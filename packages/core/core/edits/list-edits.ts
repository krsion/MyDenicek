import { type Edit, NoOpEdit, NoOpOnRemovedTargetEdit } from "./base.ts";
import {
  mapSelector,
  REMOVED_SELECTOR,
  Selector,
  type SelectorTransform,
} from "../selector.ts";
import { ListNode, Node, type PlainNode, RecordNode } from "../nodes.ts";
import {
  type EncodedRemoteEdit,
  registerRemoteEditDecoder,
} from "../remote-edit-codec.ts";

type EncodedListInsertAtEdit = Extract<
  EncodedRemoteEdit,
  { kind: "ListInsertAtEdit" }
>;
type EncodedListRemoveAtEdit = Extract<
  EncodedRemoteEdit,
  { kind: "ListRemoveAtEdit" }
>;
type EncodedListReorderEdit = Extract<
  EncodedRemoteEdit,
  { kind: "ListReorderEdit" }
>;

/** Abstract base for list insertion edits (push-back and push-front). */
export abstract class ListInsertEdit extends NoOpOnRemovedTargetEdit {
  /** @inheritDoc */
  readonly isStructural = true;

  abstract override readonly target: Selector;
  abstract readonly node: Node;

  matchInsertedChildRoot(target: Selector): Selector | null {
    const insertedChildPath = new Selector([...this.target.segments, "*"]);
    const match = insertedChildPath.matchPrefix(target);
    return match.kind === "no-match" ? null : match.rest;
  }

  rewriteInsertedNode(
    target: Selector,
    rewrite: (node: Node, relativeTarget: Selector) => Node | null,
  ): ListInsertEdit | null {
    const relativeTarget = this.matchInsertedChildRoot(target);
    if (relativeTarget === null) return null;
    const rewrittenNode = rewrite(this.node.clone(), relativeTarget);
    return rewrittenNode === null ? null : this.withInsertedNode(rewrittenNode);
  }

  protected abstract withInsertedNode(node: Node): ListInsertEdit;

  /**
   * General wildcard-affects-concurrent-inserts: replay a wildcard edit's
   * inner portion on this insert's payload by wrapping it in a temporary
   * RecordNode root.
   */
  override rewritePayloadForWildcard(
    wildcardEdit: Edit,
    wildcardTarget: Selector,
  ): Edit | null {
    return this.rewriteInsertedNode(
      wildcardTarget,
      (payloadNode, relativeTarget) => {
        if (relativeTarget.length === 0) return null;
        try {
          const tempRoot = new RecordNode("__tmp", { __item__: payloadNode });
          const innerEdit = wildcardEdit.withTarget(
            new Selector(["__item__", ...relativeTarget.segments]),
          );
          if (!innerEdit.canApply(tempRoot)) return null;
          innerEdit.apply(tempRoot);
          return tempRoot.fields["__item__"]!;
        } catch {
          return null;
        }
      },
    );
  }
}

// ── Index-based list edits ──────────────────────────────────────────

/**
 * Inserts a node at a specific index of every list matched by the target
 * selector.
 *
 * **Negative indices** use Python-style end-relative addressing and are
 * resolved at replay time:
 * - `-1` → append (insert at `list.length`)
 * - `-2` → insert before the last item (`list.length - 1`)
 * - Out-of-range negatives clamp to 0.
 *
 * Negative indices are always end-relative (equivalent to `strict` for
 * OT purposes): they are not shifted by prior concurrent edits. After
 * resolution the absolute position shifts later edits normally.
 *
 * When `strict` is true the positive index is fixed and will not be
 * shifted by concurrent OT transformations:
 * - `index=0, strict=true`  → always insert at front
 *
 * When `strict` is false (default) positive indices are shifted by OT.
 */
export class ListInsertAtEdit extends ListInsertEdit {
  /** @inheritDoc */
  readonly kind = "ListInsertAt";

  constructor(
    readonly target: Selector,
    readonly index: number,
    readonly node: Node,
    readonly strict: boolean = false,
    readonly listLength: number = 0,
  ) {
    super();
  }

  /**
   * Resolve the effective insertion index using the stored list length.
   * Positive indices are returned as-is; negative indices are resolved
   * to an absolute position using `listLength` (the length of the target
   * list at the time this edit was created).
   */
  resolveAbsoluteIndex(): number {
    if (this.index >= 0) return this.index;
    // Python-style: -1 → listLength (append), -2 → listLength-1, etc.
    return Math.max(0, this.listLength + 1 + this.index);
  }

  /** Resolve the effective insertion index from a list (for apply). */
  private resolveIndex(list: ListNode): number {
    if (this.index >= 0) return this.index;
    // Python-style: -1 → list.length (append), -2 → list.length-1, etc.
    return Math.max(0, list.items.length + 1 + this.index);
  }

  /**
   * Returns a copy of this edit with the negative index resolved to a
   * positive absolute position and `strict` cleared. Used by the
   * materializer for strict-negative edits whose absolute position must
   * be computed at replay time (the stored `listLength` is stale for
   * strict edits because their position is never shifted by OT).
   */
  withResolvedIndex(listLength: number): ListInsertAtEdit {
    if (this.index >= 0) return this;
    const resolved = Math.max(0, listLength + 1 + this.index);
    return new ListInsertAtEdit(this.target, resolved, this.node, false);
  }

  override validate(doc: Node): void {
    const insertions = doc.navigateWithPaths(this.target)
      .map(({ path, node }) => {
        const list = this.assertList(node);
        const idx = this.resolveIndex(list);
        return {
          path: new Selector([...path.segments, idx]),
          node: this.node,
        };
      });
    this.assertInsertedReferencesResolve(doc, insertions);
  }

  apply(doc: Node): void {
    if (this.strict && this.index === 0) {
      // Strict front insert shifts references — same as old pushFront.
      const referenceTargets = doc.captureReferenceTransformTargets();
      this.validate(doc);
      const nodes = this.navigateOrThrow(doc, this.target);
      for (const n of nodes) {
        n.pushFront(this.node.clone());
      }
      doc.updateReferences(
        (abs) => this.transformSelectorOrThrow(abs),
        referenceTargets,
      );
      return;
    }
    if (this.index < 0) {
      // Negative index: resolve end-relative, then apply.
      const nodes = this.navigateOrThrow(doc, this.target);
      for (const n of nodes) {
        const list = this.assertList(n);
        const resolved = this.resolveIndex(list);
        if (resolved === 0) {
          // Inserting at front — shift references.
          const referenceTargets = doc.captureReferenceTransformTargets();
          this.validate(doc);
          n.pushFront(this.node.clone());
          doc.updateReferences(
            (abs) =>
              this.target.shiftIndex(abs, 0, +1).kind === "mapped"
                ? (this.target.shiftIndex(abs, 0, +1) as {
                  kind: "mapped";
                  selector: Selector;
                }).selector
                : abs,
            referenceTargets,
          );
        } else if (resolved >= list.items.length) {
          // Appending — no reference shift needed.
          this.validate(doc);
          n.pushBack(this.node.clone());
        } else {
          // Middle insert.
          const referenceTargets = doc.captureReferenceTransformTargets();
          this.validate(doc);
          n.insertAt(resolved, this.node.clone());
          doc.updateReferences(
            (abs) => {
              const t = this.target.shiftIndex(abs, resolved, +1);
              return t.kind === "mapped" ? t.selector : abs;
            },
            referenceTargets,
          );
        }
      }
      return;
    }
    if (this.strict) {
      // Strict positive (non-zero) — treat as fixed position.
      const referenceTargets = doc.captureReferenceTransformTargets();
      this.validate(doc);
      const nodes = this.navigateOrThrow(doc, this.target);
      for (const n of nodes) {
        const list = this.assertList(n);
        if (this.index > list.items.length) {
          throw new Error(
            `ListInsertAtEdit: index ${this.index} out of bounds [0, ${list.items.length}]`,
          );
        }
        n.insertAt(this.index, this.node.clone());
      }
      doc.updateReferences(
        (abs) => this.transformSelectorOrThrow(abs),
        referenceTargets,
      );
      return;
    }
    // Non-strict positive indexed insert.
    const referenceTargets = doc.captureReferenceTransformTargets();
    this.validate(doc);
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      const list = this.assertList(n);
      if (this.index < 0 || this.index > list.items.length) {
        throw new Error(
          `ListInsertAtEdit: index ${this.index} out of bounds [0, ${list.items.length}]`,
        );
      }
      n.insertAt(this.index, this.node.clone());
    }
    doc.updateReferences(
      (abs) => this.transformSelectorOrThrow(abs),
      referenceTargets,
    );
  }

  canApply(doc: Node): boolean {
    const nodes = doc.navigate(this.target);
    if (this.index < 0 || this.strict) {
      return this.canFindNodesOfType(
        doc,
        this.target,
        (node) => node instanceof ListNode,
      );
    }
    return nodes.length > 0 &&
      nodes.every((node) =>
        node instanceof ListNode && this.index >= 0 &&
        this.index <= node.items.length
      );
  }

  transformSelector(sel: Selector): SelectorTransform {
    if (this.strict && this.index === -1) {
      // Strict append: doesn't shift existing indices.
      return mapSelector(sel);
    }
    const absIndex = this.resolveAbsoluteIndex();
    return this.target.shiftIndex(sel, absIndex, +1);
  }

  override transform(prior: Edit): Edit {
    // Insert index adjustment is handled by the prior edit's
    // transformLaterConcurrentEdit, not here.  Strict and negative
    // inserts both delegate to the base class (selector remap only).
    return super.transform(prior);
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    // Strict append (-1): don't shift concurrent indices, only rewrite
    // concurrent insert payloads that construct our target list.
    if (this.strict && this.index === -1) {
      if (!(concurrent instanceof ListInsertEdit)) {
        return super.transformLaterConcurrentEdit(concurrent);
      }
      const rewritten = concurrent.rewriteInsertedNode(
        this.target,
        (transformedNode, relativeTarget) => {
          if (
            relativeTarget.length !== 0 ||
            !(transformedNode instanceof ListNode)
          ) {
            return null;
          }
          transformedNode.pushBack(this.node.clone());
          return transformedNode;
        },
      );
      if (rewritten === null) {
        return super.transformLaterConcurrentEdit(concurrent);
      }
      return rewritten;
    }

    const thisAbsIndex = this.resolveAbsoluteIndex();

    // ── Shift non-strict concurrent ListInsertAtEdit ───────────────
    if (
      concurrent instanceof ListInsertAtEdit &&
      !concurrent.strict &&
      this.target.equals(concurrent.target)
    ) {
      const concAbsIndex = concurrent.resolveAbsoluteIndex();
      if (concAbsIndex >= thisAbsIndex) {
        return new ListInsertAtEdit(
          concurrent.target,
          concAbsIndex + 1,
          concurrent.node,
        );
      }
      // Not shifted — resolve to positive if it was negative.
      if (concurrent.index < 0) {
        return new ListInsertAtEdit(
          concurrent.target,
          concAbsIndex,
          concurrent.node,
        );
      }
      return concurrent;
    }

    // ── Shift non-strict concurrent ListRemoveAtEdit ──────────────
    if (
      concurrent instanceof ListRemoveAtEdit &&
      !concurrent.strict &&
      this.target.equals(concurrent.target)
    ) {
      const concAbsIndex = concurrent.resolveAbsoluteIndex();
      if (concAbsIndex >= thisAbsIndex) {
        return new ListRemoveAtEdit(concurrent.target, concAbsIndex + 1);
      }
      if (concurrent.index < 0) {
        return new ListRemoveAtEdit(concurrent.target, concAbsIndex);
      }
      return concurrent;
    }

    // ── Shift concurrent ListReorderEdit ──────────────────────────
    if (
      concurrent instanceof ListReorderEdit &&
      this.target.equals(concurrent.target)
    ) {
      const newFrom = concurrent.fromIndex >= thisAbsIndex
        ? concurrent.fromIndex + 1
        : concurrent.fromIndex;
      const newTo = concurrent.toIndex >= thisAbsIndex
        ? concurrent.toIndex + 1
        : concurrent.toIndex;
      if (newFrom === concurrent.fromIndex && newTo === concurrent.toIndex) {
        return super.transformLaterConcurrentEdit(concurrent);
      }
      return new ListReorderEdit(concurrent.target, newFrom, newTo);
    }

    // ── Rewrite concurrent ListInsertEdit inserting into our target ─
    if (!(concurrent instanceof ListInsertEdit)) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    const rewritten = concurrent.rewriteInsertedNode(
      this.target,
      (transformedNode, relativeTarget) => {
        if (
          relativeTarget.length !== 0 ||
          !(transformedNode instanceof ListNode)
        ) {
          return null;
        }
        // For rewriting into a newly constructed node, use the node's own
        // length for negative indices (listLength refers to the original
        // list, not this constructed node).
        const insertPos = this.index >= 0
          ? this.index
          : Math.max(0, transformedNode.items.length + 1 + this.index);
        if (insertPos >= transformedNode.items.length) {
          transformedNode.pushBack(this.node.clone());
        } else {
          transformedNode.insertAt(insertPos, this.node.clone());
        }
        return transformedNode;
      },
    );
    if (rewritten === null) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    return rewritten;
  }

  computeInverse(_preDoc: Node): Edit {
    if (this.strict) {
      return new ListRemoveAtEdit(
        this.target,
        this.index,
        true,
        this.listLength,
      );
    }
    const absIndex = this.resolveAbsoluteIndex();
    return new ListRemoveAtEdit(this.target, absIndex);
  }

  equals(other: Edit): boolean {
    return other instanceof ListInsertAtEdit &&
      this.target.equals(other.target) &&
      this.index === other.index &&
      this.node.equals(other.node) &&
      this.strict === other.strict &&
      this.listLength === other.listLength;
  }

  withTarget(target: Selector): ListInsertAtEdit {
    return new ListInsertAtEdit(
      target,
      this.index,
      this.node,
      this.strict,
      this.listLength,
    );
  }

  protected withInsertedNode(node: Node): ListInsertAtEdit {
    return new ListInsertAtEdit(
      this.target,
      this.index,
      node,
      this.strict,
      this.listLength,
    );
  }

  encodeRemoteEdit(): EncodedListInsertAtEdit {
    const encoded: EncodedListInsertAtEdit = {
      kind: "ListInsertAtEdit",
      target: this.target.format(),
      index: this.index,
      node: this.node.toPlain() as PlainNode,
    };
    if (this.strict) {
      (encoded as Record<string, unknown>).strict = true;
    }
    if (this.listLength !== 0) {
      (encoded as Record<string, unknown>).listLength = this.listLength;
    }
    return encoded;
  }
}

registerRemoteEditDecoder<EncodedListInsertAtEdit>(
  "ListInsertAtEdit",
  (encodedEdit) => {
    const raw = encodedEdit as Record<string, unknown>;
    // Backward compat: decode old anchor format to strict format.
    if (raw.anchor === "front") {
      return new ListInsertAtEdit(
        Selector.parse(encodedEdit.target),
        0,
        Node.fromPlain(encodedEdit.node),
        true,
      );
    }
    if (raw.anchor === "back") {
      return new ListInsertAtEdit(
        Selector.parse(encodedEdit.target),
        -1,
        Node.fromPlain(encodedEdit.node),
        true,
      );
    }
    return new ListInsertAtEdit(
      Selector.parse(encodedEdit.target),
      encodedEdit.index,
      Node.fromPlain(encodedEdit.node),
      raw.strict === true,
      typeof raw.listLength === "number" ? raw.listLength : 0,
    );
  },
);

// Backward-compat decoders for old wire format kinds.
registerRemoteEditDecoder(
  "ListPushBackEdit" as EncodedRemoteEdit["kind"],
  (e: Record<string, unknown>) =>
    new ListInsertAtEdit(
      Selector.parse(e.target as string),
      -1,
      Node.fromPlain(e.node as PlainNode),
      true,
    ),
);
registerRemoteEditDecoder(
  "ListPushFrontEdit" as EncodedRemoteEdit["kind"],
  (e: Record<string, unknown>) =>
    new ListInsertAtEdit(
      Selector.parse(e.target as string),
      0,
      Node.fromPlain(e.node as PlainNode),
      true,
    ),
);

/**
 * Removes an item at a specific index of every list matched by the target
 * selector.
 *
 * **Negative indices** use Python-style end-relative addressing and are
 * resolved at replay time:
 * - `-1` → remove last item (`list.length - 1`)
 * - `-2` → remove second-to-last (`list.length - 2`)
 * - Out-of-range negatives clamp to 0; empty list → error.
 *
 * Negative indices are always end-relative (equivalent to `strict` for
 * OT purposes): they are not shifted by prior concurrent edits. After
 * resolution the absolute position shifts later edits normally.
 *
 * When `strict` is true the positive index is fixed and will not be
 * shifted by concurrent OT transformations:
 * - `index=0, strict=true`  → always remove first
 *
 * When `strict` is false (default) positive indices are shifted by OT.
 */
export class ListRemoveAtEdit extends NoOpOnRemovedTargetEdit {
  /** @inheritDoc */
  readonly isStructural = true;
  /** @inheritDoc */
  readonly kind = "ListRemoveAt";

  constructor(
    readonly target: Selector,
    readonly index: number,
    readonly strict: boolean = false,
    readonly listLength: number = 0,
  ) {
    super();
  }

  /**
   * Resolve the effective removal index using the stored list length.
   * Positive indices are returned as-is; negative indices are resolved
   * to an absolute position using `listLength`.
   */
  resolveAbsoluteIndex(): number {
    if (this.index >= 0) return this.index;
    // Python-style: -1 → listLength-1 (last), -2 → listLength-2, etc.
    return Math.max(0, this.listLength + this.index);
  }

  /** Resolve the effective removal index from a list (for apply). */
  private resolveIndex(list: ListNode): number {
    if (this.index >= 0) return this.index;
    // Python-style: -1 → list.length-1 (last), -2 → list.length-2, etc.
    return Math.max(0, list.items.length + this.index);
  }

  /**
   * Returns a copy of this edit with the negative index resolved to a
   * positive absolute position and `strict` cleared. Used by the
   * materializer for strict-negative edits whose absolute position must
   * be computed at replay time.
   */
  withResolvedIndex(listLength: number): ListRemoveAtEdit {
    if (this.index >= 0) return this;
    const resolved = Math.max(0, listLength + this.index);
    return new ListRemoveAtEdit(this.target, resolved, false);
  }

  override validate(doc: Node): void {
    const removedPaths = doc.navigateWithPaths(this.target)
      .flatMap(({ path, node }) => {
        const list = this.assertList(node);
        if (this.index < 0 || this.strict) {
          return list.items.length === 0 ? [] : [
            new Selector([
              ...path.segments,
              this.resolveIndex(list),
            ]),
          ];
        }
        return this.index >= 0 && this.index < list.items.length
          ? [new Selector([...path.segments, this.index])]
          : [];
      });
    this.assertRemovedPathsAreUnreferenced(doc, removedPaths);
  }

  apply(doc: Node): void {
    if (this.strict && this.index === 0) {
      // Strict front remove shifts references — same as old popFront.
      const referenceTargets = doc.captureReferenceTransformTargets();
      this.validate(doc);
      const nodes = this.navigateOrThrow(doc, this.target);
      for (const n of nodes) {
        n.popFront();
      }
      doc.updateReferences(
        (abs) => {
          const t = this.transformSelector(abs);
          return t.kind === "mapped" ? t.selector : abs;
        },
        referenceTargets,
      );
      return;
    }
    if (this.index < 0) {
      // Negative index: resolve end-relative, then apply.
      const nodes = this.navigateOrThrow(doc, this.target);
      for (const n of nodes) {
        const list = this.assertList(n);
        if (list.items.length === 0) {
          throw new Error(
            `ListRemoveAtEdit: cannot remove from empty list`,
          );
        }
        const resolved = this.resolveIndex(list);
        if (resolved === list.items.length - 1) {
          // Removing last — no reference shift.
          this.validate(doc);
          n.popBack();
        } else if (resolved === 0) {
          // Removing first — shift references.
          const referenceTargets = doc.captureReferenceTransformTargets();
          this.validate(doc);
          n.popFront();
          doc.updateReferences(
            (abs) => {
              const t = this.target.shiftIndex(abs, 1, -1);
              return t.kind === "mapped" ? t.selector : abs;
            },
            referenceTargets,
          );
        } else {
          // Middle remove.
          const referenceTargets = doc.captureReferenceTransformTargets();
          this.validate(doc);
          n.removeAt(resolved);
          doc.updateReferences(
            (abs) => {
              const m = this.target.matchPrefix(abs);
              if (
                m.kind === "matched" && m.rest.length > 0 &&
                m.rest.segments[0] === resolved
              ) {
                return abs; // removed selector — keep as-is (will be dangling)
              }
              const t = this.target.shiftIndex(abs, resolved + 1, -1);
              return t.kind === "mapped" ? t.selector : abs;
            },
            referenceTargets,
          );
        }
      }
      return;
    }
    if (this.strict) {
      // Strict positive (non-zero).
      const referenceTargets = doc.captureReferenceTransformTargets();
      this.validate(doc);
      const nodes = this.navigateOrThrow(doc, this.target);
      for (const n of nodes) {
        const list = this.assertList(n);
        if (this.index >= list.items.length) {
          throw new Error(
            `ListRemoveAtEdit: index ${this.index} out of bounds [0, ${list.items.length})`,
          );
        }
        n.removeAt(this.index);
      }
      doc.updateReferences(
        (abs) => {
          const t = this.transformSelector(abs);
          return t.kind === "mapped" ? t.selector : abs;
        },
        referenceTargets,
      );
      return;
    }
    // Non-strict positive indexed remove.
    const referenceTargets = doc.captureReferenceTransformTargets();
    this.validate(doc);
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      const list = this.assertList(n);
      if (this.index < 0 || this.index >= list.items.length) {
        throw new Error(
          `ListRemoveAtEdit: index ${this.index} out of bounds [0, ${list.items.length})`,
        );
      }
      n.removeAt(this.index);
    }
    doc.updateReferences(
      (abs) => {
        const t = this.transformSelector(abs);
        return t.kind === "mapped" ? t.selector : abs;
      },
      referenceTargets,
    );
  }

  canApply(doc: Node): boolean {
    const nodes = doc.navigate(this.target);
    if (this.index < 0 || this.strict) {
      return nodes.length > 0 &&
        nodes.every((node) =>
          node instanceof ListNode && node.items.length > 0
        );
    }
    return nodes.length > 0 &&
      nodes.every((node) =>
        node instanceof ListNode && this.index >= 0 &&
        this.index < node.items.length
      );
  }

  transformSelector(sel: Selector): SelectorTransform {
    if (this.strict && this.index === -1) {
      // Strict remove-last: can't determine which index is last without
      // current list state. Identity — doesn't shift existing indices.
      return mapSelector(sel);
    }
    const absIndex = this.resolveAbsoluteIndex();
    const m = this.target.matchPrefix(sel);
    if (
      m.kind === "matched" && m.rest.length > 0 &&
      m.rest.segments[0] === absIndex
    ) {
      return REMOVED_SELECTOR;
    }
    return this.target.shiftIndex(sel, absIndex + 1, -1);
  }

  override transform(prior: Edit): Edit {
    if (this.strict) {
      // Two concurrent strict removes of the same list collapse to one removal.
      if (
        prior instanceof ListRemoveAtEdit &&
        prior.strict &&
        prior.target.equals(this.target)
      ) {
        return new NoOpEdit(
          this.target,
          `strict ListRemoveAtEdit already removed the list item targeted by strict ListRemoveAtEdit.`,
        );
      }
      // Strict removes don't adjust their index through prior edits.
      return super.transform(prior);
    }

    // Non-strict (positive or negative): resolve to absolute and shift.
    const thisAbsIndex = this.resolveAbsoluteIndex();

    if (
      prior instanceof ListRemoveAtEdit &&
      prior.target.equals(this.target)
    ) {
      const priorAbsIndex = prior.resolveAbsoluteIndex();
      if (priorAbsIndex < thisAbsIndex) {
        return new ListRemoveAtEdit(this.target, thisAbsIndex - 1);
      }
      if (priorAbsIndex === thisAbsIndex) {
        return new NoOpEdit(
          this.target,
          `ListRemoveAtEdit already removed item at index ${thisAbsIndex}.`,
        );
      }
      // priorAbsIndex > thisAbsIndex — no shift needed.
      if (this.index < 0) {
        return new ListRemoveAtEdit(this.target, thisAbsIndex);
      }
      return this;
    }

    if (
      prior instanceof ListInsertAtEdit &&
      prior.target.equals(this.target)
    ) {
      const priorAbsIndex = prior.resolveAbsoluteIndex();
      if (priorAbsIndex <= thisAbsIndex) {
        return new ListRemoveAtEdit(this.target, thisAbsIndex + 1);
      }
      if (this.index < 0) {
        return new ListRemoveAtEdit(this.target, thisAbsIndex);
      }
      return this;
    }

    return super.transform(prior);
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    // Strict remove-last (-1): doesn't shift concurrent indices.
    if (this.strict && this.index === -1) {
      return super.transformLaterConcurrentEdit(concurrent);
    }

    const thisAbsIndex = this.resolveAbsoluteIndex();

    // ── Shift non-strict concurrent ListInsertAtEdit ───────────────
    if (
      concurrent instanceof ListInsertAtEdit &&
      !concurrent.strict &&
      this.target.equals(concurrent.target)
    ) {
      const concAbsIndex = concurrent.resolveAbsoluteIndex();
      if (concAbsIndex > thisAbsIndex) {
        return new ListInsertAtEdit(
          concurrent.target,
          concAbsIndex - 1,
          concurrent.node,
        );
      }
      if (concurrent.index < 0) {
        return new ListInsertAtEdit(
          concurrent.target,
          concAbsIndex,
          concurrent.node,
        );
      }
      return concurrent;
    }

    // ── Shift non-strict concurrent ListRemoveAtEdit ──────────────
    if (
      concurrent instanceof ListRemoveAtEdit &&
      !concurrent.strict &&
      this.target.equals(concurrent.target)
    ) {
      const concAbsIndex = concurrent.resolveAbsoluteIndex();
      if (concAbsIndex > thisAbsIndex) {
        return new ListRemoveAtEdit(concurrent.target, concAbsIndex - 1);
      }
      if (concAbsIndex === thisAbsIndex) {
        return new NoOpEdit(
          concurrent.target,
          `ListRemoveAtEdit already removed item at index ${thisAbsIndex}.`,
        );
      }
      if (concurrent.index < 0) {
        return new ListRemoveAtEdit(concurrent.target, concAbsIndex);
      }
      return concurrent;
    }

    // ── Shift concurrent ListReorderEdit ──────────────────────────
    if (
      concurrent instanceof ListReorderEdit &&
      this.target.equals(concurrent.target)
    ) {
      if (concurrent.fromIndex === thisAbsIndex) {
        return new NoOpEdit(
          concurrent.target,
          `ListRemoveAtEdit removed the item being reordered at index ${thisAbsIndex}.`,
        );
      }
      const newFrom = concurrent.fromIndex > thisAbsIndex
        ? concurrent.fromIndex - 1
        : concurrent.fromIndex;
      const newTo = concurrent.toIndex > thisAbsIndex
        ? concurrent.toIndex - 1
        : concurrent.toIndex;
      if (newFrom === concurrent.fromIndex && newTo === concurrent.toIndex) {
        return super.transformLaterConcurrentEdit(concurrent);
      }
      return new ListReorderEdit(concurrent.target, newFrom, newTo);
    }

    return super.transformLaterConcurrentEdit(concurrent);
  }

  computeInverse(preDoc: Node): Edit {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const list = this.assertList(nodes[0]!);
    const absIndex = this.resolveIndex(list);
    if (this.strict) {
      return new ListInsertAtEdit(
        this.target,
        this.index,
        list.items[absIndex]!.clone(),
        true,
        this.listLength,
      );
    }
    return new ListInsertAtEdit(
      this.target,
      absIndex,
      list.items[absIndex]!.clone(),
    );
  }

  equals(other: Edit): boolean {
    return other instanceof ListRemoveAtEdit &&
      this.target.equals(other.target) &&
      this.index === other.index &&
      this.strict === other.strict &&
      this.listLength === other.listLength;
  }

  withTarget(target: Selector): ListRemoveAtEdit {
    return new ListRemoveAtEdit(
      target,
      this.index,
      this.strict,
      this.listLength,
    );
  }

  encodeRemoteEdit(): EncodedListRemoveAtEdit {
    const encoded: EncodedListRemoveAtEdit = {
      kind: "ListRemoveAtEdit",
      target: this.target.format(),
      index: this.index,
    };
    if (this.strict) {
      (encoded as Record<string, unknown>).strict = true;
    }
    if (this.listLength !== 0) {
      (encoded as Record<string, unknown>).listLength = this.listLength;
    }
    return encoded;
  }
}

registerRemoteEditDecoder<EncodedListRemoveAtEdit>(
  "ListRemoveAtEdit",
  (encodedEdit) => {
    const raw = encodedEdit as Record<string, unknown>;
    // Backward compat: decode old anchor format to strict format.
    if (raw.anchor === "front") {
      return new ListRemoveAtEdit(
        Selector.parse(encodedEdit.target),
        0,
        true,
      );
    }
    if (raw.anchor === "back") {
      return new ListRemoveAtEdit(
        Selector.parse(encodedEdit.target),
        -1,
        true,
      );
    }
    return new ListRemoveAtEdit(
      Selector.parse(encodedEdit.target),
      encodedEdit.index,
      raw.strict === true,
      typeof raw.listLength === "number" ? raw.listLength : 0,
    );
  },
);

// Backward-compat decoders for old wire format kinds.
registerRemoteEditDecoder(
  "ListPopBackEdit" as EncodedRemoteEdit["kind"],
  (e: Record<string, unknown>) =>
    new ListRemoveAtEdit(Selector.parse(e.target as string), -1, true),
);
registerRemoteEditDecoder(
  "ListPopFrontEdit" as EncodedRemoteEdit["kind"],
  (e: Record<string, unknown>) =>
    new ListRemoveAtEdit(Selector.parse(e.target as string), 0, true),
);

/** Moves an item from one index to another in every list matched by the target selector. */
export class ListReorderEdit extends NoOpOnRemovedTargetEdit {
  /** @inheritDoc */
  readonly isStructural = true;
  /** @inheritDoc */
  readonly kind = "ListReorder";

  constructor(
    readonly target: Selector,
    readonly fromIndex: number,
    readonly toIndex: number,
  ) {
    super();
  }

  override validate(_doc: Node): void {}

  apply(doc: Node): void {
    const referenceTargets = doc.captureReferenceTransformTargets();
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      const list = this.assertList(n);
      if (this.fromIndex < 0 || this.fromIndex >= list.items.length) {
        throw new Error(
          `ListReorderEdit: fromIndex ${this.fromIndex} out of bounds [0, ${list.items.length})`,
        );
      }
      const maxTo = list.items.length - 1;
      if (this.toIndex < 0 || this.toIndex > maxTo) {
        throw new Error(
          `ListReorderEdit: toIndex ${this.toIndex} out of bounds [0, ${maxTo}]`,
        );
      }
      n.reorder(this.fromIndex, this.toIndex);
    }
    doc.updateReferences(
      (abs) => this.transformSelectorOrThrow(abs),
      referenceTargets,
    );
  }

  canApply(doc: Node): boolean {
    const nodes = doc.navigate(this.target);
    return nodes.length > 0 &&
      nodes.every((node) => {
        if (!(node instanceof ListNode)) return false;
        const maxTo = node.items.length - 1;
        return this.fromIndex >= 0 && this.fromIndex < node.items.length &&
          this.toIndex >= 0 && this.toIndex <= maxTo;
      });
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "no-match" || m.rest.length === 0) return mapSelector(sel);
    const head = m.rest.segments[0]!;
    if (typeof head !== "number") return mapSelector(sel);
    const N = head;
    const F = this.fromIndex;
    const T = this.toIndex;
    let shifted: number;
    if (N === F) {
      shifted = T;
    } else if (F < T) {
      shifted = (N > F && N <= T) ? N - 1 : N;
    } else {
      shifted = (N >= T && N < F) ? N + 1 : N;
    }
    if (shifted === N) return mapSelector(sel);
    const tail = m.rest.slice(1);
    return mapSelector(
      new Selector([...m.specificPrefix.segments, shifted, ...tail.segments]),
    );
  }

  override transform(prior: Edit): Edit {
    if (
      prior instanceof ListInsertAtEdit &&
      prior.target.equals(this.target)
    ) {
      const priorAbsIndex = prior.resolveAbsoluteIndex();
      const newFrom = this.fromIndex >= priorAbsIndex
        ? this.fromIndex + 1
        : this.fromIndex;
      const newTo = this.toIndex >= priorAbsIndex
        ? this.toIndex + 1
        : this.toIndex;
      if (newFrom === this.fromIndex && newTo === this.toIndex) {
        return super.transform(prior);
      }
      return new ListReorderEdit(this.target, newFrom, newTo);
    }
    if (
      prior instanceof ListRemoveAtEdit &&
      prior.target.equals(this.target)
    ) {
      const priorAbsIndex = prior.resolveAbsoluteIndex();
      if (priorAbsIndex === this.fromIndex) {
        return new NoOpEdit(
          this.target,
          `ListRemoveAtEdit removed the item being reordered at index ${this.fromIndex}.`,
        );
      }
      const newFrom = this.fromIndex > priorAbsIndex
        ? this.fromIndex - 1
        : this.fromIndex;
      const newTo = this.toIndex > priorAbsIndex
        ? this.toIndex - 1
        : this.toIndex;
      if (newFrom === this.fromIndex && newTo === this.toIndex) {
        return super.transform(prior);
      }
      return new ListReorderEdit(this.target, newFrom, newTo);
    }
    return super.transform(prior);
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    // Reorder doesn't change list length, just shifts indices for other edits
    if (
      concurrent instanceof ListInsertAtEdit &&
      this.target.equals(concurrent.target)
    ) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    if (
      concurrent instanceof ListRemoveAtEdit &&
      this.target.equals(concurrent.target)
    ) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    return super.transformLaterConcurrentEdit(concurrent);
  }

  computeInverse(_preDoc: Node): Edit {
    return new ListReorderEdit(this.target, this.toIndex, this.fromIndex);
  }

  equals(other: Edit): boolean {
    return other instanceof ListReorderEdit &&
      this.target.equals(other.target) &&
      this.fromIndex === other.fromIndex &&
      this.toIndex === other.toIndex;
  }

  withTarget(target: Selector): ListReorderEdit {
    return new ListReorderEdit(target, this.fromIndex, this.toIndex);
  }

  encodeRemoteEdit(): EncodedListReorderEdit {
    return {
      kind: "ListReorderEdit",
      target: this.target.format(),
      fromIndex: this.fromIndex,
      toIndex: this.toIndex,
    };
  }
}

registerRemoteEditDecoder<EncodedListReorderEdit>(
  "ListReorderEdit",
  (encodedEdit) =>
    new ListReorderEdit(
      Selector.parse(encodedEdit.target),
      encodedEdit.fromIndex,
      encodedEdit.toIndex,
    ),
);
