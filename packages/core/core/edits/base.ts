import { mapSelector, type SelectorTransform, type Selector } from '../selector.ts';
import { ListNode, type Node, PrimitiveNode, RecordNode } from '../nodes.ts';

export class ProtectedTargetError extends Error {}
export class MissingReferenceTargetError extends Error {}

export abstract class Edit {
  abstract readonly target: Selector;
  abstract readonly isStructural: boolean;
  /** Stable string identifier for this edit type. Survives minification. */
  abstract readonly kind: string;

  /**
   * Mutates `doc` in place to apply this edit.
   * Concrete edits throw on type mismatch or missing path.
   * Explicit replay no-ops are surfaced by materialization as conflicts.
   */
  abstract apply(doc: Node): void;
  abstract canApply(doc: Node): boolean;
  validate(_doc: Node): void {}

  /** Transforms another selector through the structural change made by this edit. */
  abstract transformSelector(sel: Selector): SelectorTransform;

  abstract equals(other: Edit): boolean;

  /** Returns a copy of this edit with a different target. */
  abstract withTarget(target: Selector): Edit;

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

  protected navigateOrThrow(doc: Node, target: Selector): Node[] {
    const nodes = doc.navigate(target);
    if (nodes.length === 0) {
      throw new Error(`No nodes match selector '${target.format()}'.`);
    }
    return nodes;
  }

  protected assertRecord(n: Node): RecordNode {
    if (!(n instanceof RecordNode)) throw new Error(`${this.constructor.name}: expected record, found '${n.constructor.name}'`);
    return n;
  }

  protected assertList(n: Node): ListNode {
    if (!(n instanceof ListNode)) throw new Error(`${this.constructor.name}: expected list, found '${n.constructor.name}'`);
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

  protected canFindNodesOfType(doc: Node, target: Selector, predicate: (node: Node) => boolean): boolean {
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
      throw new Error(`${this.constructor.name}: unexpectedly removed selector '${sel.format()}' while updating references.`);
    }
    return result.selector;
  }

  protected assertRemovedPathsAreUnreferenced(doc: Node, removedPaths: Selector[]): void {
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
    const insertedPaths = insertions.flatMap(({ path, node }) =>
      node.navigateWithPaths(new Selector([])).map((entry) => new Selector([...path.segments, ...entry.path.segments]))
    );
    for (const { path, node } of insertions) {
      for (const reference of node.collectResolvedReferencePaths(path)) {
        const targetExists = doc.navigate(reference.targetPath).length > 0 ||
          insertedPaths.some((insertedPath) => this.matchesConcretePath(reference.targetPath, insertedPath));
        if (!targetExists) {
          throw new MissingReferenceTargetError(
            `${this.constructor.name}: cannot create reference '${reference.referencePath.format()}' to missing target ` +
              `'${reference.targetPath.format()}'.`,
          );
        }
      }
    }
  }

  private matchesConcretePath(selector: Selector, concretePath: Selector): boolean {
    const match = selector.matchPrefix(concretePath);
    return match.kind === "matched" && match.rest.length === 0;
  }
}

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
  readonly kind = 'NoOp';

  constructor(readonly target: Selector, readonly reason: string) { super(); }

  apply(_doc: Node): void {
    throw new Error("NoOpEdit must be surfaced as a conflict during materialization.");
  }

  toConflict(): RecordNode {
    return this.conflict(new PrimitiveNode(this.reason));
  }

  canApply(_doc: Node): boolean {
    return true;
  }

  transformSelector(sel: Selector): SelectorTransform { return mapSelector(sel); }

  override transform(_prior: Edit): Edit {
    return this;
  }

  equals(other: Edit): boolean {
    return other instanceof NoOpEdit &&
      this.target.equals(other.target) &&
      this.reason === other.reason;
  }

  withTarget(target: Selector): NoOpEdit { return new NoOpEdit(target, this.reason); }
}
