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

type EncodedListPushBackEdit = Extract<
  EncodedRemoteEdit,
  { kind: "ListPushBackEdit" }
>;
type EncodedListPushFrontEdit = Extract<
  EncodedRemoteEdit,
  { kind: "ListPushFrontEdit" }
>;
type EncodedListPopBackEdit = Extract<
  EncodedRemoteEdit,
  { kind: "ListPopBackEdit" }
>;
type EncodedListPopFrontEdit = Extract<
  EncodedRemoteEdit,
  { kind: "ListPopFrontEdit" }
>;
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

/** Appends a node to the end of every list matched by the target selector. */
export class ListPushBackEdit extends ListInsertEdit {
  /** @inheritDoc */
  readonly kind = "ListPushBack";

  constructor(readonly target: Selector, readonly node: Node) {
    super();
  }

  override validate(doc: Node): void {
    const insertions = doc.navigateWithPaths(this.target)
      .map(({ path, node }) => {
        const list = this.assertList(node);
        return {
          path: new Selector([...path.segments, list.items.length]),
          node: this.node,
        };
      });
    this.assertInsertedReferencesResolve(doc, insertions);
  }

  apply(doc: Node): void {
    this.validate(doc);
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      n.pushBack(this.node.clone());
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) => node instanceof ListNode,
    );
  }

  transformSelector(sel: Selector): SelectorTransform {
    return mapSelector(sel);
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
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
        transformedNode.pushBack(this.node.clone());
        return transformedNode;
      },
    );
    if (rewritten === null) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    return rewritten;
  }

  computeInverse(_preDoc: Node): Edit {
    return new ListPopBackEdit(this.target);
  }

  equals(other: Edit): boolean {
    return other instanceof ListPushBackEdit &&
      this.target.equals(other.target) && this.node.equals(other.node);
  }

  withTarget(target: Selector): ListPushBackEdit {
    return new ListPushBackEdit(target, this.node);
  }

  protected withInsertedNode(node: Node): ListPushBackEdit {
    return new ListPushBackEdit(this.target, node);
  }

  encodeRemoteEdit(): EncodedListPushBackEdit {
    return {
      kind: "ListPushBackEdit",
      target: this.target.format(),
      node: this.node.toPlain() as PlainNode,
    };
  }
}

registerRemoteEditDecoder<EncodedListPushBackEdit>(
  "ListPushBackEdit",
  (encodedEdit) =>
    new ListPushBackEdit(
      Selector.parse(encodedEdit.target),
      Node.fromPlain(encodedEdit.node),
    ),
);

/** Prepends a node to the beginning of every list matched by the target selector. */
export class ListPushFrontEdit extends ListInsertEdit {
  /** @inheritDoc */
  readonly kind = "ListPushFront";

  constructor(readonly target: Selector, readonly node: Node) {
    super();
  }

  override validate(doc: Node): void {
    const insertions = doc.navigateWithPaths(this.target)
      .map(({ path, node }) => {
        this.assertList(node);
        return { path: new Selector([...path.segments, 0]), node: this.node };
      });
    this.assertInsertedReferencesResolve(doc, insertions);
  }

  apply(doc: Node): void {
    this.validate(doc);
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      n.pushFront(this.node.clone());
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) => node instanceof ListNode,
    );
  }

  transformSelector(sel: Selector): SelectorTransform {
    return this.target.shiftIndex(sel, 0, +1);
  }

  computeInverse(_preDoc: Node): Edit {
    return new ListPopFrontEdit(this.target);
  }

  equals(other: Edit): boolean {
    return other instanceof ListPushFrontEdit &&
      this.target.equals(other.target) && this.node.equals(other.node);
  }

  withTarget(target: Selector): ListPushFrontEdit {
    return new ListPushFrontEdit(target, this.node);
  }

  protected withInsertedNode(node: Node): ListPushFrontEdit {
    return new ListPushFrontEdit(this.target, node);
  }

  encodeRemoteEdit(): EncodedListPushFrontEdit {
    return {
      kind: "ListPushFrontEdit",
      target: this.target.format(),
      node: this.node.toPlain() as PlainNode,
    };
  }
}

registerRemoteEditDecoder<EncodedListPushFrontEdit>(
  "ListPushFrontEdit",
  (encodedEdit) =>
    new ListPushFrontEdit(
      Selector.parse(encodedEdit.target),
      Node.fromPlain(encodedEdit.node),
    ),
);

/** Removes the last item from every list matched by the target selector. */
export class ListPopBackEdit extends NoOpOnRemovedTargetEdit {
  /** @inheritDoc */
  readonly isStructural = true;
  /** @inheritDoc */
  readonly kind = "ListPopBack";

  constructor(readonly target: Selector) {
    super();
  }

  override validate(doc: Node): void {
    const removedPaths = doc.navigateWithPaths(this.target)
      .flatMap(({ path, node }) => {
        const list = this.assertList(node);
        return list.items.length === 0
          ? []
          : [new Selector([...path.segments, list.items.length - 1])];
      });
    this.assertRemovedPathsAreUnreferenced(doc, removedPaths);
  }

  apply(doc: Node): void {
    this.validate(doc);
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      n.popBack();
    }
  }

  canApply(doc: Node): boolean {
    const nodes = doc.navigate(this.target);
    return nodes.length > 0 &&
      nodes.every((node) => node instanceof ListNode && node.items.length > 0);
  }

  transformSelector(sel: Selector): SelectorTransform {
    return mapSelector(sel);
  }

  override transform(prior: Edit): Edit {
    // Two concurrent pops of the same list edge collapse to one removal.
    // Otherwise replay could remove a second item that neither peer observed
    // as the last element when they issued their pop.
    if (
      (prior instanceof ListPopBackEdit || prior instanceof ListPopFrontEdit) &&
      prior.target.equals(this.target)
    ) {
      return new NoOpEdit(
        this.target,
        `${prior.constructor.name} already removed the list item targeted by ${this.constructor.name}.`,
      );
    }
    return super.transform(prior);
  }

  computeInverse(preDoc: Node): Edit {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const list = this.assertList(nodes[0]!);
    return new ListPushBackEdit(
      this.target,
      list.items[list.items.length - 1]!.clone(),
    );
  }

  equals(other: Edit): boolean {
    return other instanceof ListPopBackEdit && this.target.equals(other.target);
  }

  withTarget(target: Selector): ListPopBackEdit {
    return new ListPopBackEdit(target);
  }
  encodeRemoteEdit(): EncodedListPopBackEdit {
    return { kind: "ListPopBackEdit", target: this.target.format() };
  }
}

registerRemoteEditDecoder<EncodedListPopBackEdit>(
  "ListPopBackEdit",
  (encodedEdit) => new ListPopBackEdit(Selector.parse(encodedEdit.target)),
);

/** Removes the first item from every list matched by the target selector. */
export class ListPopFrontEdit extends NoOpOnRemovedTargetEdit {
  /** @inheritDoc */
  readonly isStructural = true;
  /** @inheritDoc */
  readonly kind = "ListPopFront";

  constructor(readonly target: Selector) {
    super();
  }

  override validate(doc: Node): void {
    const removedPaths = doc.navigateWithPaths(this.target)
      .flatMap(({ path, node }) => {
        const list = this.assertList(node);
        return list.items.length === 0
          ? []
          : [new Selector([...path.segments, 0])];
      });
    this.assertRemovedPathsAreUnreferenced(doc, removedPaths);
  }

  apply(doc: Node): void {
    this.validate(doc);
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      n.popFront();
    }
  }

  canApply(doc: Node): boolean {
    const nodes = doc.navigate(this.target);
    return nodes.length > 0 &&
      nodes.every((node) => node instanceof ListNode && node.items.length > 0);
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "matched" && m.rest.length > 0 && m.rest.segments[0] === 0) {
      return REMOVED_SELECTOR;
    }
    return this.target.shiftIndex(sel, 1, -1);
  }

  override transform(prior: Edit): Edit {
    // Two concurrent pops of the same list edge collapse to one removal.
    // Otherwise replay could remove a second item that neither peer observed
    // as the first element when they issued their pop.
    if (
      (prior instanceof ListPopBackEdit || prior instanceof ListPopFrontEdit) &&
      prior.target.equals(this.target)
    ) {
      return new NoOpEdit(
        this.target,
        `${prior.constructor.name} already removed the list item targeted by ${this.constructor.name}.`,
      );
    }
    return super.transform(prior);
  }

  computeInverse(preDoc: Node): Edit {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const list = this.assertList(nodes[0]!);
    return new ListPushFrontEdit(this.target, list.items[0]!.clone());
  }

  equals(other: Edit): boolean {
    return other instanceof ListPopFrontEdit &&
      this.target.equals(other.target);
  }

  withTarget(target: Selector): ListPopFrontEdit {
    return new ListPopFrontEdit(target);
  }
  encodeRemoteEdit(): EncodedListPopFrontEdit {
    return { kind: "ListPopFrontEdit", target: this.target.format() };
  }
}

registerRemoteEditDecoder<EncodedListPopFrontEdit>(
  "ListPopFrontEdit",
  (encodedEdit) => new ListPopFrontEdit(Selector.parse(encodedEdit.target)),
);

// ── Index-based list edits ──────────────────────────────────────────

/** Inserts a node at a specific index in every list matched by the target selector. */
export class ListInsertAtEdit extends ListInsertEdit {
  /** @inheritDoc */
  readonly kind = "ListInsertAt";

  constructor(
    readonly target: Selector,
    readonly index: number,
    readonly node: Node,
  ) {
    super();
  }

  override validate(doc: Node): void {
    const insertions = doc.navigateWithPaths(this.target)
      .map(({ path, node }) => {
        this.assertList(node);
        return {
          path: new Selector([...path.segments, this.index]),
          node: this.node,
        };
      });
    this.assertInsertedReferencesResolve(doc, insertions);
  }

  apply(doc: Node): void {
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
  }

  canApply(doc: Node): boolean {
    const nodes = doc.navigate(this.target);
    return nodes.length > 0 &&
      nodes.every((node) =>
        node instanceof ListNode && this.index >= 0 &&
        this.index <= node.items.length
      );
  }

  transformSelector(sel: Selector): SelectorTransform {
    return this.target.shiftIndex(sel, this.index, +1);
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    if (
      concurrent instanceof ListInsertAtEdit &&
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
    // Handle concurrent ListInsertEdit (pushFront/pushBack inserting into our target)
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
    return new ListRemoveAtEdit(this.target, this.index);
  }

  equals(other: Edit): boolean {
    return other instanceof ListInsertAtEdit &&
      this.target.equals(other.target) &&
      this.index === other.index &&
      this.node.equals(other.node);
  }

  withTarget(target: Selector): ListInsertAtEdit {
    return new ListInsertAtEdit(target, this.index, this.node);
  }

  protected withInsertedNode(node: Node): ListInsertAtEdit {
    return new ListInsertAtEdit(this.target, this.index, node);
  }

  encodeRemoteEdit(): EncodedListInsertAtEdit {
    return {
      kind: "ListInsertAtEdit",
      target: this.target.format(),
      index: this.index,
      node: this.node.toPlain() as PlainNode,
    };
  }
}

registerRemoteEditDecoder<EncodedListInsertAtEdit>(
  "ListInsertAtEdit",
  (encodedEdit) =>
    new ListInsertAtEdit(
      Selector.parse(encodedEdit.target),
      encodedEdit.index,
      Node.fromPlain(encodedEdit.node),
    ),
);

/** Removes the item at a specific index from every list matched by the target selector. */
export class ListRemoveAtEdit extends NoOpOnRemovedTargetEdit {
  /** @inheritDoc */
  readonly isStructural = true;
  /** @inheritDoc */
  readonly kind = "ListRemoveAt";

  constructor(readonly target: Selector, readonly index: number) {
    super();
  }

  override validate(doc: Node): void {
    const removedPaths = doc.navigateWithPaths(this.target)
      .flatMap(({ path, node }) => {
        const list = this.assertList(node);
        return this.index >= 0 && this.index < list.items.length
          ? [new Selector([...path.segments, this.index])]
          : [];
      });
    this.assertRemovedPathsAreUnreferenced(doc, removedPaths);
  }

  apply(doc: Node): void {
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
  }

  canApply(doc: Node): boolean {
    const nodes = doc.navigate(this.target);
    return nodes.length > 0 &&
      nodes.every((node) =>
        node instanceof ListNode && this.index >= 0 &&
        this.index < node.items.length
      );
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    if (
      m.kind === "matched" && m.rest.length > 0 && m.rest.segments[0] === this.index
    ) {
      return REMOVED_SELECTOR;
    }
    return this.target.shiftIndex(sel, this.index + 1, -1);
  }

  override transform(prior: Edit): Edit {
    if (
      prior instanceof ListRemoveAtEdit &&
      prior.target.equals(this.target)
    ) {
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
      if (prior.index <= this.index) {
        return new ListRemoveAtEdit(this.target, this.index + 1);
      }
      return this;
    }
    if (
      prior instanceof ListPushFrontEdit &&
      prior.target.equals(this.target)
    ) {
      return new ListRemoveAtEdit(this.target, this.index + 1);
    }
    if (
      (prior instanceof ListPopFrontEdit || prior instanceof ListPopBackEdit) &&
      prior.target.equals(this.target)
    ) {
      if (prior instanceof ListPopFrontEdit) {
        if (this.index === 0) {
          return new NoOpEdit(
            this.target,
            `ListPopFrontEdit already removed item at index 0.`,
          );
        }
        return new ListRemoveAtEdit(this.target, this.index - 1);
      }
      // ListPopBackEdit — doesn't affect indices below the last element
      return this;
    }
    return super.transform(prior);
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    if (
      concurrent instanceof ListInsertAtEdit &&
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
    return new ListInsertAtEdit(
      this.target,
      this.index,
      list.items[this.index]!.clone(),
    );
  }

  equals(other: Edit): boolean {
    return other instanceof ListRemoveAtEdit &&
      this.target.equals(other.target) &&
      this.index === other.index;
  }

  withTarget(target: Selector): ListRemoveAtEdit {
    return new ListRemoveAtEdit(target, this.index);
  }

  encodeRemoteEdit(): EncodedListRemoveAtEdit {
    return {
      kind: "ListRemoveAtEdit",
      target: this.target.format(),
      index: this.index,
    };
  }
}

registerRemoteEditDecoder<EncodedListRemoveAtEdit>(
  "ListRemoveAtEdit",
  (encodedEdit) =>
    new ListRemoveAtEdit(
      Selector.parse(encodedEdit.target),
      encodedEdit.index,
    ),
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
    if (
      prior instanceof ListPushFrontEdit &&
      prior.target.equals(this.target)
    ) {
      return new ListReorderEdit(
        this.target,
        this.fromIndex + 1,
        this.toIndex + 1,
      );
    }
    if (
      prior instanceof ListPopFrontEdit &&
      prior.target.equals(this.target)
    ) {
      if (this.fromIndex === 0) {
        return new NoOpEdit(
          this.target,
          `ListPopFrontEdit removed the item being reordered at index 0.`,
        );
      }
      return new ListReorderEdit(
        this.target,
        this.fromIndex - 1,
        this.toIndex > 0 ? this.toIndex - 1 : this.toIndex,
      );
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
