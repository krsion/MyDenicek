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

export abstract class ListInsertEdit extends NoOpOnRemovedTargetEdit {
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

export class ListPushBackEdit extends ListInsertEdit {
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

export class ListPushFrontEdit extends ListInsertEdit {
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

export class ListPopBackEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;
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

export class ListPopFrontEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;
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
