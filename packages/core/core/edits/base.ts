import { mapSelector, Selector, type SelectorTransform } from "../selector.ts";
import { ListNode, type Node, PrimitiveNode, RecordNode } from "../nodes.ts";
import type { EncodedRemoteEdit } from "../remote-edit-codec.ts";

/** Thrown when an edit would remove a node that is the target of a live reference. */
export class ProtectedTargetError extends Error {}
/** Thrown when an inserted node contains a reference whose target does not exist. */
export class MissingReferenceTargetError extends Error {}

/**
 * Abstract base class for all document edits in the CRDT event DAG.
 *
 * Edits mutate the document tree in place, support operational
 * transformation of selectors for concurrent structural changes,
 * and encode themselves for remote replication.
 */
export abstract class Edit {
  /** Selector path that this edit targets in the document tree. */
  abstract readonly target: Selector;
  /** Whether this edit changes the document structure (e.g. wrap, rename, delete). */
  abstract readonly isStructural: boolean;
  /** Stable string identifier for this edit type. Survives minification. */
  abstract readonly kind: string;

  /**
   * Mutates `doc` in place to apply this edit.
   * Concrete edits throw on type mismatch or missing path.
   * Explicit replay no-ops are surfaced by materialization as conflicts.
   *
   * **Atomicity contract.** Implementations must be effectively atomic: if
   * `apply` throws, the document passed in MUST be left observationally
   * unchanged. `EventGraph`'s incremental cache path relies on this to
   * decide whether to keep or invalidate the cached document when an edit
   * fails mid-replay. Edits that perform multiple mutations (e.g.
   * `CompositeEdit`) should therefore either validate all preconditions
   * up-front (via `canApply`/`validate`) or operate on a staged copy.
   */
  abstract apply(doc: Node): void;
  /** Returns whether this edit can be applied to `doc` without throwing. */
  abstract canApply(doc: Node): boolean;
  /** Validates pre-conditions against the document. Override in subclasses. */
  validate(_doc: Node): void {}

  /** Transforms another selector through the structural change made by this edit. */
  abstract transformSelector(sel: Selector): SelectorTransform;

  /** Structural equality check against another edit. */
  abstract equals(other: Edit): boolean;

  /** Returns a copy of this edit with a different target. */
  abstract withTarget(target: Selector): Edit;
  /** Serializes this edit into the wire format for remote replication. */
  abstract encodeRemoteEdit(): EncodedRemoteEdit;

  /** Computes the inverse edit that undoes this edit given the pre-edit document state. */
  abstract computeInverse(preDoc: Node): Edit;

  /** Returns a human-readable description of what this edit does. */
  describe(): string {
    return `${this.kind} at ${this.target.format()}`;
  }

  /** All selectors involved in this edit (target and any secondary selectors). */
  get selectors(): Selector[] {
    return [this.target];
  }

  /** Returns a transformed copy of this edit accounting for a prior concurrent structural edit. */
  transform(prior: Edit): Edit {
    const t = prior.transformSelector(this.target);
    return t.kind === "mapped"
      ? this.withTarget(t.selector)
      : this.handleRemovedTarget(prior);
  }

  /**
   * Rewrites a concurrent edit that will replay after this edit.
   *
   * The receiver is already earlier in deterministic replay order. Most edits
   * simply transform the later edit's selector through themselves, while richer
   * edits can also rewrite inserted payloads or duplicate mirrored effects.
   *
   * The default implementation also handles the general case where this edit
   * targets a wildcard path and the concurrent edit inserts into a matching
   * parent list: the edit is replayed on the inserted payload so newly
   * inserted items receive the same modification.
   */
  transformLaterConcurrentEdit(concurrent: Edit): Edit {
    const transformed = concurrent.transform(this);
    if (transformed instanceof NoOpEdit) return transformed;

    if (this.target.hasWildcard) {
      const rewritten = transformed.rewritePayloadForWildcard(this, this.target);
      if (rewritten) return rewritten;
    }

    return transformed;
  }

  /**
   * Called on a concurrent edit (typically a `ListInsertEdit`) to replay a
   * wildcard-targeting edit onto its inserted payload.
   *
   * Non-insert edits return `null` (nothing to rewrite). `ListInsertEdit`
   * overrides this to clone its payload, apply the wildcard edit's inner
   * portion, and return a new insert with the modified payload.
   */
  rewritePayloadForWildcard(
    _wildcardEdit: Edit,
    _wildcardTarget: Selector,
  ): Edit | null {
    return null;
  }

  /**
   * If this edit inserts a payload, calls `fn` with the payload node and its
   * computed base path, returning a new edit carrying the (possibly modified)
   * node. Non-insert edits return `this` unchanged.
   */
  mapInsertedPayload(
    _fn: (node: Node, basePath: Selector) => Node,
  ): Edit {
    return this;
  }

  /**
   * If this edit inserts a node into a list, attempts to rewrite the inserted
   * payload via `rewrite`. Returns a new edit with the rewritten payload, or
   * `null` if not applicable (e.g. target doesn't match, or this edit is not
   * a list insert).
   */
  rewriteInsertedNode(
    _target: Selector,
    _rewrite: (node: Node, relativeTarget: Selector) => Node | null,
  ): Edit | null {
    return null;
  }

  /**
   * If this edit targets a list and carries shiftable indices, applies an
   * index shift caused by a prior concurrent insert (`+1`) or remove (`−1`)
   * on the same list. Returns the shifted edit, a {@link NoOpEdit} if the
   * shift invalidates the edit (e.g. same-position remove collision), or
   * `null` if not applicable.
   */
  applyListIndexShift(
    _listTarget: Selector,
    _threshold: number,
    _delta: 1 | -1,
  ): Edit | null {
    return null;
  }

  protected navigateOrThrow(doc: Node, target: Selector): Node[] {
    const nodes = doc.navigate(target);
    if (nodes.length === 0) {
      throw new Error(`No nodes match selector '${target.format()}'.`);
    }
    return nodes;
  }

  protected assertRecord(n: Node): RecordNode {
    if (!(n instanceof RecordNode)) {
      throw new Error(
        `${this.constructor.name}: expected record, found '${n.constructor.name}'`,
      );
    }
    return n;
  }

  protected assertList(n: Node): ListNode {
    if (!(n instanceof ListNode)) {
      throw new Error(
        `${this.constructor.name}: expected list, found '${n.constructor.name}'`,
      );
    }
    return n;
  }

  /** Builds a conflict node describing an edit that couldn't be applied. */
  protected conflict(data?: Node): RecordNode {
    const fields: Record<string, Node> = {
      kind: new PrimitiveNode(this.constructor.name),
      target: new PrimitiveNode(this.target.format()),
    };
    if (data) fields.data = data;
    return new RecordNode("conflict", fields);
  }

  protected canFindNodes(doc: Node, target: Selector): boolean {
    return doc.navigate(target).length > 0;
  }

  protected canFindNodesOfType(
    doc: Node,
    target: Selector,
    predicate: (node: Node) => boolean,
  ): boolean {
    const nodes = doc.navigate(target);
    return nodes.length > 0 && nodes.every(predicate);
  }

  protected handleRemovedTarget(prior: Edit): Edit {
    throw new Error(
      `${this.constructor.name} must explicitly handle removal of '${this.target.format()}' by ${prior.constructor.name}.`,
    );
  }

  protected createRemovedTargetNoOp(prior: Edit): NoOpEdit {
    return new NoOpEdit(
      this.target,
      `${prior.constructor.name} removed '${this.target.format()}' before ${this.constructor.name} could apply.`,
    );
  }

  protected transformSelectorOrThrow(sel: Selector): Selector {
    const result = this.transformSelector(sel);
    if (result.kind === "removed") {
      throw new Error(
        `${this.constructor.name}: unexpectedly removed selector '${sel.format()}' while updating references.`,
      );
    }
    return result.selector;
  }

  protected assertRemovedPathsAreUnreferenced(
    doc: Node,
    removedPaths: Selector[],
  ): void {
    const blockingReference = doc.findBlockingReference(removedPaths);
    if (blockingReference !== null) {
      throw new ProtectedTargetError(
        `${this.constructor.name}: cannot remove '${blockingReference.removedPath.format()}' because reference ` +
          `'${blockingReference.referencePath.format()}' targets '${blockingReference.targetPath.format()}'.`,
      );
    }
  }

  protected assertInsertedReferencesResolve(
    doc: Node,
    insertions: { path: Selector; node: Node }[],
  ): void {
    const insertedPaths = insertions.flatMap(({ path, node }) => {
      const paths: Selector[] = [];
      node.forEach((relativePath) => {
        paths.push(new Selector([...path.segments, ...relativePath.segments]));
      });
      return paths;
    });
    for (const { path, node } of insertions) {
      for (const reference of node.collectResolvedReferencePaths(path)) {
        const targetExists = doc.navigate(reference.targetPath).length > 0 ||
          insertedPaths.some((insertedPath) =>
            this.matchesConcretePath(reference.targetPath, insertedPath)
          );
        if (!targetExists) {
          throw new MissingReferenceTargetError(
            `${this.constructor.name}: cannot create reference '${reference.referencePath.format()}' to missing target ` +
              `'${reference.targetPath.format()}'.`,
          );
        }
      }
    }
  }

  private matchesConcretePath(
    selector: Selector,
    concretePath: Selector,
  ): boolean {
    const match = selector.matchPrefix(concretePath);
    return match.kind === "matched" && match.rest.length === 0;
  }
}

/** Edit subclass that degrades to a no-op when its target is removed by a prior structural edit. */
export abstract class NoOpOnRemovedTargetEdit extends Edit {
  protected override handleRemovedTarget(prior: Edit): Edit {
    return this.createRemovedTargetNoOp(prior);
  }
}

/**
 * Explicit replay no-op used when concurrent structural edits remove or
 * overwrite an edit's target before replay.
 */
export class NoOpEdit extends Edit {
  readonly isStructural = false;
  readonly kind = "NoOp";

  constructor(readonly target: Selector, readonly reason: string) {
    super();
  }

  apply(_doc: Node): void {
    throw new Error(
      "NoOpEdit must be surfaced as a conflict during materialization.",
    );
  }

  toConflict(): RecordNode {
    return this.conflict(new PrimitiveNode(this.reason));
  }

  canApply(_doc: Node): boolean {
    return true;
  }

  transformSelector(sel: Selector): SelectorTransform {
    return mapSelector(sel);
  }

  override transform(_prior: Edit): Edit {
    return this;
  }

  override transformLaterConcurrentEdit(_concurrent: Edit): Edit {
    return this;
  }

  computeInverse(_preDoc: Node): NoOpEdit {
    return this;
  }

  equals(other: Edit): boolean {
    return other instanceof NoOpEdit &&
      this.target.equals(other.target) &&
      this.reason === other.reason;
  }

  withTarget(target: Selector): NoOpEdit {
    return new NoOpEdit(target, this.reason);
  }
  encodeRemoteEdit(): EncodedRemoteEdit {
    return {
      kind: "NoOpEdit",
      target: this.target.format(),
      reason: this.reason,
    };
  }

  override describe(): string {
    return `No-op: ${this.reason}`;
  }
}

/** Returns a human-readable snippet describing a node for edit descriptions. */
export function describeNodeForEdit(node: Node): string {
  if (node instanceof PrimitiveNode) {
    const v = node.value;
    return ` = ${typeof v === "string" ? `"${v}"` : String(v)}`;
  }
  if (node instanceof RecordNode) {
    return ` <${node.tag}>`;
  }
  if (node instanceof ListNode) {
    return ` [${node.tag}](${node.items.length} items)`;
  }
  return "";
}

/**
 * Internal replay-only edit that bundles one primary transformed edit together
 * with additional mirrored edits created by managed-copy OT.
 *
 * The primary edit preserves the original event intent and must succeed for the
 * event to remain meaningful. Mirror edits are best-effort applications onto
 * copy targets; they are never serialized onto the wire. The mirrors are
 * expected to represent disjoint destinations produced by managed copy, so
 * replay transforms them in the same deterministic causal order as the applied
 * structural history.
 */
export class CompositeEdit extends Edit {
  /** @inheritDoc */
  readonly kind = "Composite";

  /** Creates a composite from a primary edit and additional mirror edits. */
  constructor(readonly primary: Edit, readonly mirrors: Edit[]) {
    super();
  }

  get target(): Selector {
    return this.primary.target;
  }

  get isStructural(): boolean {
    return this.primary.isStructural ||
      this.mirrors.some((edit) => edit.isStructural);
  }

  override get selectors(): Selector[] {
    return [
      ...this.primary.selectors,
      ...this.mirrors.flatMap((edit) => edit.selectors),
    ];
  }

  apply(doc: Node): void {
    this.primary.apply(doc);
    for (const mirror of this.collectApplicableMirrorEdits(doc)) {
      mirror.apply(doc);
    }
  }

  canApply(doc: Node): boolean {
    return this.primary.canApply(doc);
  }

  override validate(doc: Node): void {
    this.primary.validate(doc);
    this.collectApplicableMirrorEdits(doc);
  }

  transformSelector(sel: Selector): SelectorTransform {
    return this.primary.transformSelector(sel);
  }

  override transform(prior: Edit): Edit {
    const transformedPrimary = prior.transformLaterConcurrentEdit(this.primary);
    if (transformedPrimary instanceof NoOpEdit) {
      return transformedPrimary;
    }
    return createCompositeEdit(
      transformedPrimary,
      this.mirrors
        .map((mirror) => prior.transformLaterConcurrentEdit(mirror))
        .filter((mirror): mirror is Edit => !(mirror instanceof NoOpEdit)),
    );
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    // Replay applies structural edits in deterministic topological order, so a
    // later concurrent edit must be transformed through the primary structural
    // change first and then through each mirrored structural change in that
    // same order.
    let transformed = this.primary.transformLaterConcurrentEdit(concurrent);
    for (const mirror of this.mirrors) {
      if (transformed instanceof NoOpEdit) {
        return transformed;
      }
      transformed = mirror.transformLaterConcurrentEdit(transformed);
    }
    return transformed;
  }

  computeInverse(preDoc: Node): Edit {
    const allEdits = [this.primary, ...this.mirrors];
    const inverses = allEdits.map((edit) => edit.computeInverse(preDoc))
      .reverse();
    return createCompositeEdit(inverses[0]!, inverses.slice(1));
  }

  equals(other: Edit): boolean {
    return other instanceof CompositeEdit &&
      this.primary.equals(other.primary) &&
      this.mirrors.length === other.mirrors.length &&
      this.mirrors.every((mirror, index) =>
        mirror.equals(other.mirrors[index]!)
      );
  }

  withTarget(target: Selector): Edit {
    return createCompositeEdit(this.primary.withTarget(target), this.mirrors);
  }

  encodeRemoteEdit(): EncodedRemoteEdit {
    throw new Error(
      "CompositeEdit is an internal replay artifact and cannot be serialized for remote transmission.",
    );
  }

  private collectApplicableMirrorEdits(doc: Node): Edit[] {
    const applicableMirrors: Edit[] = [];
    for (const mirror of this.mirrors) {
      if (!mirror.canApply(doc)) {
        continue;
      }
      try {
        mirror.validate(doc);
      } catch (error) {
        if (
          error instanceof ProtectedTargetError ||
          error instanceof MissingReferenceTargetError
        ) {
          continue;
        }
        throw error;
      }
      applicableMirrors.push(mirror);
    }
    return applicableMirrors;
  }
}

/** Creates a composite edit from a primary and zero or more mirror edits. Returns the primary directly when no mirrors exist. */
export function createCompositeEdit(primary: Edit, mirrors: Edit[]): Edit {
  return mirrors.length === 0 ? primary : new CompositeEdit(primary, mirrors);
}
