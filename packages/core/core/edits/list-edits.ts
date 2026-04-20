import { type Edit, NoOpEdit, NoOpOnRemovedTargetEdit } from "./base.ts";
import {
  mapSelector,
  REMOVED_SELECTOR,
  Selector,
  type SelectorTransform,
} from "../selector.ts";
import { ListNode, Node, type PlainNode } from "../nodes.ts";
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
  ) {
    super();
  }

  /** Resolve the effective insertion index from a list. */
  private resolveIndex(list: ListNode): number {
    if (this.index >= 0) return this.index;
    // Python-style: -1 → list.length (append), -2 → list.length-1, etc.
    return Math.max(0, list.items.length + 1 + this.index);
  }

  /**
   * Returns a copy of this edit with the negative index resolved to a
   * positive absolute position. Used by the materializer so that
   * downstream OT transformations operate on the concrete position.
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
    if (this.index < 0) {
      // Negative index: end-relative. Before resolution, we can't shift
      // selectors because we don't know the absolute position. The
      // resolved copy (with positive index) stored in `applied` will
      // handle selector transforms for downstream OT.
      return mapSelector(sel);
    }
    if (this.strict && this.index === 0) {
      return this.target.shiftIndex(sel, 0, +1);
    }
    if (this.strict) {
      // Strict positive non-zero: shifts indices at and after this.index.
      return this.target.shiftIndex(sel, this.index, +1);
    }
    return this.target.shiftIndex(sel, this.index, +1);
  }

  override transform(prior: Edit): Edit {
    // Negative indices are end-relative — not shifted by prior edits.
    // Strict inserts also never adjust their own index through prior edits.
    if (this.strict || this.index < 0) {
      return super.transform(prior);
    }
    // Non-strict positive: delegate to base (default OT).
    return super.transform(prior);
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    if (this.index < 0) {
      // Negative index: end-relative. We can't shift concurrent edits
      // because we don't know the resolved position yet. The resolved
      // copy stored in `applied` will handle downstream OT. For
      // concurrent inserts into the same list that are being constructed
      // (e.g. ListInsertEdit), rewrite the inserted node.
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
          // Resolve position against the node being constructed.
          const resolved = Math.max(
            0,
            transformedNode.items.length + 1 + this.index,
          );
          if (resolved >= transformedNode.items.length) {
            transformedNode.pushBack(this.node.clone());
          } else {
            transformedNode.insertAt(resolved, this.node.clone());
          }
          return transformedNode;
        },
      );
      if (rewritten === null) {
        return super.transformLaterConcurrentEdit(concurrent);
      }
      return rewritten;
    }

    if (this.strict && this.index >= 0) {
      // Strict front insert at index 0: shifts all concurrent indexed edits.
      if (
        concurrent instanceof ListInsertAtEdit &&
        !concurrent.strict &&
        concurrent.index >= 0 &&
        this.target.equals(concurrent.target)
      ) {
        return new ListInsertAtEdit(
          concurrent.target,
          concurrent.index + 1,
          concurrent.node,
        );
      }
      if (
        concurrent instanceof ListRemoveAtEdit &&
        !concurrent.strict &&
        concurrent.index >= 0 &&
        this.target.equals(concurrent.target)
      ) {
        return new ListRemoveAtEdit(concurrent.target, concurrent.index + 1);
      }
      if (
        concurrent instanceof ListReorderEdit &&
        this.target.equals(concurrent.target)
      ) {
        return new ListReorderEdit(
          concurrent.target,
          concurrent.fromIndex + 1,
          concurrent.toIndex + 1,
        );
      }
      // For other ListInsertEdits (e.g. another strict insert), delegate.
      return super.transformLaterConcurrentEdit(concurrent);
    }

    // Non-strict positive indexed insert — original logic.
    if (
      concurrent instanceof ListInsertAtEdit &&
      !concurrent.strict &&
      concurrent.index >= 0 &&
      this.target.equals(concurrent.target)
    ) {
      if (concurrent.index >= this.index) {
        return new ListInsertAtEdit(
          concurrent.target,
          concurrent.index + 1,
          concurrent.node,
        );
      }
      return concurrent;
    }
    if (
      concurrent instanceof ListRemoveAtEdit &&
      !concurrent.strict &&
      concurrent.index >= 0 &&
      this.target.equals(concurrent.target)
    ) {
      if (concurrent.index >= this.index) {
        return new ListRemoveAtEdit(concurrent.target, concurrent.index + 1);
      }
      return concurrent;
    }
    if (
      concurrent instanceof ListReorderEdit &&
      this.target.equals(concurrent.target)
    ) {
      const newFrom = concurrent.fromIndex >= this.index
        ? concurrent.fromIndex + 1
        : concurrent.fromIndex;
      const newTo = concurrent.toIndex >= this.index
        ? concurrent.toIndex + 1
        : concurrent.toIndex;
      if (newFrom === concurrent.fromIndex && newTo === concurrent.toIndex) {
        return super.transformLaterConcurrentEdit(concurrent);
      }
      return new ListReorderEdit(concurrent.target, newFrom, newTo);
    }
    // Handle concurrent ListInsertEdit inserting into our target
    if (!(concurrent instanceof ListInsertEdit)) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    const rewritten = concurrent.rewriteInsertedNode(
      this.target,
      (transformedNode, relativeTarget) => {
        if (
          relativeTarget.length !== 0 || !(transformedNode instanceof ListNode)
        ) {
          return null;
        }
        transformedNode.insertAt(this.index, this.node.clone());
        return transformedNode;
      },
    );
    if (rewritten === null) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    return rewritten;
  }

  computeInverse(_preDoc: Node): Edit {
    if (this.index < 0) {
      return new ListRemoveAtEdit(this.target, this.index, true);
    }
    if (this.strict && this.index === 0) {
      return new ListRemoveAtEdit(this.target, 0, true);
    }
    return new ListRemoveAtEdit(this.target, this.index);
  }

  equals(other: Edit): boolean {
    return other instanceof ListInsertAtEdit &&
      this.target.equals(other.target) &&
      this.index === other.index &&
      this.node.equals(other.node) &&
      this.strict === other.strict;
  }

  withTarget(target: Selector): ListInsertAtEdit {
    return new ListInsertAtEdit(target, this.index, this.node, this.strict);
  }

  protected withInsertedNode(node: Node): ListInsertAtEdit {
    return new ListInsertAtEdit(this.target, this.index, node, this.strict);
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
  ) {
    super();
  }

  /** Resolve the effective removal index from a list. */
  private resolveIndex(list: ListNode): number {
    if (this.index >= 0) return this.index;
    // Python-style: -1 → list.length-1 (last), -2 → list.length-2, etc.
    return Math.max(0, list.items.length + this.index);
  }

  /**
   * Returns a copy of this edit with the negative index resolved to a
   * positive absolute position. Used by the materializer so that
   * downstream OT transformations operate on the concrete position.
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
    if (this.index < 0) {
      // Negative index: end-relative. Before resolution, we can't shift
      // selectors. The resolved copy stored in `applied` handles this.
      return mapSelector(sel);
    }
    if (this.strict && this.index === 0) {
      const m = this.target.matchPrefix(sel);
      if (
        m.kind === "matched" && m.rest.length > 0 && m.rest.segments[0] === 0
      ) {
        return REMOVED_SELECTOR;
      }
      return this.target.shiftIndex(sel, 1, -1);
    }
    if (this.strict) {
      // Strict positive (non-zero).
      const m = this.target.matchPrefix(sel);
      if (
        m.kind === "matched" && m.rest.length > 0 &&
        m.rest.segments[0] === this.index
      ) {
        return REMOVED_SELECTOR;
      }
      return this.target.shiftIndex(sel, this.index + 1, -1);
    }
    // Non-strict positive.
    const m = this.target.matchPrefix(sel);
    if (
      m.kind === "matched" && m.rest.length > 0 &&
      m.rest.segments[0] === this.index
    ) {
      return REMOVED_SELECTOR;
    }
    return this.target.shiftIndex(sel, this.index + 1, -1);
  }

  override transform(prior: Edit): Edit {
    if (this.index < 0) {
      // Negative indices are end-relative — not shifted by prior edits.
      // Two concurrent negative removes of the same index collapse.
      if (
        prior instanceof ListRemoveAtEdit &&
        (prior.strict || prior.index < 0) &&
        prior.target.equals(this.target) &&
        prior.index === this.index
      ) {
        return new NoOpEdit(
          this.target,
          `Concurrent negative ListRemoveAtEdit already removed the same end-relative item.`,
        );
      }
      return super.transform(prior);
    }
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
    // Non-strict positive indexed remove — original OT logic.
    if (
      prior instanceof ListRemoveAtEdit &&
      prior.target.equals(this.target)
    ) {
      if (prior.index < 0) {
        // Prior is negative (end-relative) — doesn't affect positive indices
        // below the last element (we don't know the resolved position here).
        return this;
      }
      if (prior.strict && prior.index === 0) {
        if (this.index === 0) {
          return new NoOpEdit(
            this.target,
            `strict ListRemoveAtEdit already removed item at index 0.`,
          );
        }
        return new ListRemoveAtEdit(this.target, this.index - 1);
      }
      if (prior.strict) {
        // Strict positive (non-zero): shifts indices after prior.index.
        if (prior.index === this.index) {
          return new NoOpEdit(
            this.target,
            `strict ListRemoveAtEdit already removed item at index ${this.index}.`,
          );
        }
        if (prior.index < this.index) {
          return new ListRemoveAtEdit(this.target, this.index - 1);
        }
        return this;
      }
      // Prior is also non-strict positive.
      if (prior.index < this.index) {
        return new ListRemoveAtEdit(this.target, this.index - 1);
      }
      if (prior.index === this.index) {
        return new NoOpEdit(
          this.target,
          `ListRemoveAtEdit already removed item at index ${this.index}.`,
        );
      }
      return this;
    }
    if (
      prior instanceof ListInsertAtEdit &&
      prior.target.equals(this.target)
    ) {
      if (prior.index < 0) {
        // Prior is negative (end-relative) — doesn't affect existing indices.
        return this;
      }
      if (prior.strict && prior.index === 0) {
        return new ListRemoveAtEdit(this.target, this.index + 1);
      }
      if (prior.strict) {
        // Strict positive (non-zero).
        if (prior.index <= this.index) {
          return new ListRemoveAtEdit(this.target, this.index + 1);
        }
        return this;
      }
      if (prior.index <= this.index) {
        return new ListRemoveAtEdit(this.target, this.index + 1);
      }
      return this;
    }
    return super.transform(prior);
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    if (this.index < 0) {
      // Negative index: end-relative. We can't shift concurrent edits
      // because we don't know the resolved position yet. The resolved
      // copy stored in `applied` will handle downstream OT.
      return super.transformLaterConcurrentEdit(concurrent);
    }

    if (this.strict && this.index === 0) {
      // Strict front remove at index 0: shift concurrent indexed edits.
      if (
        concurrent instanceof ListInsertAtEdit &&
        !concurrent.strict &&
        concurrent.index >= 0 &&
        this.target.equals(concurrent.target)
      ) {
        if (concurrent.index > 0) {
          return new ListInsertAtEdit(
            concurrent.target,
            concurrent.index - 1,
            concurrent.node,
          );
        }
        return concurrent;
      }
      if (
        concurrent instanceof ListRemoveAtEdit &&
        !concurrent.strict &&
        concurrent.index >= 0 &&
        this.target.equals(concurrent.target)
      ) {
        if (concurrent.index > 0) {
          return new ListRemoveAtEdit(concurrent.target, concurrent.index - 1);
        }
        if (concurrent.index === 0) {
          return new NoOpEdit(
            concurrent.target,
            `ListRemoveAtEdit already removed item at index 0.`,
          );
        }
        return concurrent;
      }
      if (
        concurrent instanceof ListReorderEdit &&
        this.target.equals(concurrent.target)
      ) {
        if (concurrent.fromIndex === 0) {
          return new NoOpEdit(
            concurrent.target,
            `ListRemoveAtEdit removed the item being reordered at index 0.`,
          );
        }
        const newFrom = concurrent.fromIndex > 0
          ? concurrent.fromIndex - 1
          : concurrent.fromIndex;
        const newTo = concurrent.toIndex > 0
          ? concurrent.toIndex - 1
          : concurrent.toIndex;
        if (newFrom === concurrent.fromIndex && newTo === concurrent.toIndex) {
          return super.transformLaterConcurrentEdit(concurrent);
        }
        return new ListReorderEdit(concurrent.target, newFrom, newTo);
      }
      return super.transformLaterConcurrentEdit(concurrent);
    }

    if (this.strict) {
      // Strict positive non-zero: similar to non-strict but from a fixed position.
      if (
        concurrent instanceof ListInsertAtEdit &&
        !concurrent.strict &&
        concurrent.index >= 0 &&
        this.target.equals(concurrent.target)
      ) {
        if (concurrent.index > this.index) {
          return new ListInsertAtEdit(
            concurrent.target,
            concurrent.index - 1,
            concurrent.node,
          );
        }
        return concurrent;
      }
      if (
        concurrent instanceof ListRemoveAtEdit &&
        !concurrent.strict &&
        concurrent.index >= 0 &&
        this.target.equals(concurrent.target)
      ) {
        if (concurrent.index > this.index) {
          return new ListRemoveAtEdit(concurrent.target, concurrent.index - 1);
        }
        if (concurrent.index === this.index) {
          return new NoOpEdit(
            concurrent.target,
            `ListRemoveAtEdit already removed item at index ${this.index}.`,
          );
        }
        return concurrent;
      }
      if (
        concurrent instanceof ListReorderEdit &&
        this.target.equals(concurrent.target)
      ) {
        if (concurrent.fromIndex === this.index) {
          return new NoOpEdit(
            concurrent.target,
            `ListRemoveAtEdit removed the item being reordered at index ${this.index}.`,
          );
        }
        const newFrom = concurrent.fromIndex > this.index
          ? concurrent.fromIndex - 1
          : concurrent.fromIndex;
        const newTo = concurrent.toIndex > this.index
          ? concurrent.toIndex - 1
          : concurrent.toIndex;
        if (newFrom === concurrent.fromIndex && newTo === concurrent.toIndex) {
          return super.transformLaterConcurrentEdit(concurrent);
        }
        return new ListReorderEdit(concurrent.target, newFrom, newTo);
      }
      return super.transformLaterConcurrentEdit(concurrent);
    }

    // Non-strict positive indexed remove — original logic.
    if (
      concurrent instanceof ListInsertAtEdit &&
      !concurrent.strict &&
      concurrent.index >= 0 &&
      this.target.equals(concurrent.target)
    ) {
      if (concurrent.index > this.index) {
        return new ListInsertAtEdit(
          concurrent.target,
          concurrent.index - 1,
          concurrent.node,
        );
      }
      return concurrent;
    }
    if (
      concurrent instanceof ListRemoveAtEdit &&
      !concurrent.strict &&
      concurrent.index >= 0 &&
      this.target.equals(concurrent.target)
    ) {
      if (concurrent.index > this.index) {
        return new ListRemoveAtEdit(concurrent.target, concurrent.index - 1);
      }
      if (concurrent.index === this.index) {
        return new NoOpEdit(
          concurrent.target,
          `ListRemoveAtEdit already removed item at index ${this.index}.`,
        );
      }
      return concurrent;
    }
    if (
      concurrent instanceof ListReorderEdit &&
      this.target.equals(concurrent.target)
    ) {
      if (concurrent.fromIndex === this.index) {
        return new NoOpEdit(
          concurrent.target,
          `ListRemoveAtEdit removed the item being reordered at index ${this.index}.`,
        );
      }
      const newFrom = concurrent.fromIndex > this.index
        ? concurrent.fromIndex - 1
        : concurrent.fromIndex;
      const newTo = concurrent.toIndex > this.index
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
    if (this.index < 0) {
      const resolved = this.resolveIndex(list);
      return new ListInsertAtEdit(
        this.target,
        this.index,
        list.items[resolved]!.clone(),
        true,
      );
    }
    if (this.strict && this.index === 0) {
      return new ListInsertAtEdit(
        this.target,
        0,
        list.items[0]!.clone(),
        true,
      );
    }
    if (this.strict) {
      return new ListInsertAtEdit(
        this.target,
        this.index,
        list.items[this.index]!.clone(),
        true,
      );
    }
    return new ListInsertAtEdit(
      this.target,
      this.index,
      list.items[this.index]!.clone(),
    );
  }

  equals(other: Edit): boolean {
    return other instanceof ListRemoveAtEdit &&
      this.target.equals(other.target) &&
      this.index === other.index &&
      this.strict === other.strict;
  }

  withTarget(target: Selector): ListRemoveAtEdit {
    return new ListRemoveAtEdit(target, this.index, this.strict);
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
      if (prior.index < 0) {
        // Negative (end-relative) insert — doesn't affect existing indices.
        return super.transform(prior);
      }
      if (prior.strict && prior.index === 0) {
        // Strict front insert always inserts at 0, shifts everything +1.
        return new ListReorderEdit(
          this.target,
          this.fromIndex + 1,
          this.toIndex + 1,
        );
      }
      if (prior.strict) {
        // Strict positive (non-zero).
        const newFrom = this.fromIndex >= prior.index
          ? this.fromIndex + 1
          : this.fromIndex;
        const newTo = this.toIndex >= prior.index
          ? this.toIndex + 1
          : this.toIndex;
        if (newFrom === this.fromIndex && newTo === this.toIndex) {
          return super.transform(prior);
        }
        return new ListReorderEdit(this.target, newFrom, newTo);
      }
      const newFrom = this.fromIndex >= prior.index
        ? this.fromIndex + 1
        : this.fromIndex;
      const newTo = this.toIndex >= prior.index
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
      if (prior.index < 0) {
        // Negative (end-relative) remove — doesn't affect existing indices.
        return super.transform(prior);
      }
      if (prior.strict && prior.index === 0) {
        // Strict front remove always removes index 0.
        if (this.fromIndex === 0) {
          return new NoOpEdit(
            this.target,
            `strict ListRemoveAtEdit removed the item being reordered at index 0.`,
          );
        }
        return new ListReorderEdit(
          this.target,
          this.fromIndex - 1,
          this.toIndex > 0 ? this.toIndex - 1 : this.toIndex,
        );
      }
      if (prior.strict) {
        // Strict positive (non-zero).
        if (prior.index === this.fromIndex) {
          return new NoOpEdit(
            this.target,
            `strict ListRemoveAtEdit removed the item being reordered at index ${this.fromIndex}.`,
          );
        }
        const newFrom = this.fromIndex > prior.index
          ? this.fromIndex - 1
          : this.fromIndex;
        const newTo = this.toIndex > prior.index
          ? this.toIndex - 1
          : this.toIndex;
        if (newFrom === this.fromIndex && newTo === this.toIndex) {
          return super.transform(prior);
        }
        return new ListReorderEdit(this.target, newFrom, newTo);
      }
      if (prior.index === this.fromIndex) {
        return new NoOpEdit(
          this.target,
          `ListRemoveAtEdit removed the item being reordered at index ${this.fromIndex}.`,
        );
      }
      const newFrom = this.fromIndex > prior.index
        ? this.fromIndex - 1
        : this.fromIndex;
      const newTo = this.toIndex > prior.index
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
