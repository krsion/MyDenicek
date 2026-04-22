import { Edit } from "./base.ts";
import {
  mapSelector,
  REMOVED_SELECTOR,
  Selector,
  type SelectorTransform,
} from "../selector.ts";
import { ListNode, type Node, RecordNode } from "../nodes.ts";
import {
  type EncodedRemoteEdit,
  registerRemoteEditDecoder,
} from "../remote-edit-codec.ts";
import { WrapListEdit, WrapRecordEdit } from "./tree-edits.ts";

type EncodedUnwrapRecordEdit = Extract<
  EncodedRemoteEdit,
  { kind: "UnwrapRecordEdit" }
>;
type EncodedUnwrapListEdit = Extract<
  EncodedRemoteEdit,
  { kind: "UnwrapListEdit" }
>;

/** Unwraps a record wrapper, replacing it with the child at the given field. */
export class UnwrapRecordEdit extends Edit {
  /** @inheritDoc */
  readonly isStructural = true;
  /** @inheritDoc */
  readonly kind = "UnwrapRecord";

  constructor(readonly target: Selector, readonly field: string) {
    super();
  }

  apply(doc: Node): void {
    this.applyWithReferenceUpdate(doc, () => {
      const entries = doc.navigateWithPaths(this.target);
      if (entries.length === 0) {
        throw new Error(
          `No nodes match selector '${this.target.format()}'.`,
        );
      }
      for (const { path, node } of entries) {
        const record = this.assertRecord(node);
        const child = record.fields[this.field];
        if (child === undefined) {
          throw new Error(
            `UnwrapRecordEdit: field '${this.field}' not found at '${path.format()}'.`,
          );
        }
        doc.replaceAtPath(path, child);
      }
    });
  }

  override canApply(doc: Node): boolean {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) =>
        node instanceof RecordNode &&
        this.field in (node as RecordNode).fields,
    );
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "no-match") return mapSelector(sel);
    if (m.rest.length > 0 && m.rest.segments[0] === this.field) {
      return mapSelector(
        new Selector([
          ...m.specificPrefix.segments,
          ...m.rest.segments.slice(1),
        ]),
      );
    }
    return REMOVED_SELECTOR;
  }

  computeInverse(preDoc: Node): Edit {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const record = this.assertRecord(nodes[0]!);
    return new WrapRecordEdit(this.target, this.field, record.tag);
  }

  equals(other: Edit): boolean {
    return other instanceof UnwrapRecordEdit &&
      this.target.equals(other.target) &&
      this.field === other.field;
  }

  withTarget(target: Selector): UnwrapRecordEdit {
    return new UnwrapRecordEdit(target, this.field);
  }

  encodeRemoteEdit(): EncodedUnwrapRecordEdit {
    return {
      kind: "UnwrapRecordEdit",
      target: this.target.format(),
      field: this.field,
    };
  }
}

registerRemoteEditDecoder<EncodedUnwrapRecordEdit>(
  "UnwrapRecordEdit",
  (encodedEdit) =>
    new UnwrapRecordEdit(
      Selector.parse(encodedEdit.target),
      encodedEdit.field,
    ),
);

/** Unwraps a single-item list, replacing it with its sole child. */
export class UnwrapListEdit extends Edit {
  /** @inheritDoc */
  readonly isStructural = true;
  /** @inheritDoc */
  readonly kind = "UnwrapList";

  constructor(readonly target: Selector) {
    super();
  }

  apply(doc: Node): void {
    this.applyWithReferenceUpdate(doc, () => {
      const entries = doc.navigateWithPaths(this.target);
      if (entries.length === 0) {
        throw new Error(
          `No nodes match selector '${this.target.format()}'.`,
        );
      }
      for (const { path, node } of entries) {
        const list = this.assertList(node);
        if (list.items.length !== 1) {
          throw new Error(
            `UnwrapListEdit: expected exactly 1 item at '${path.format()}', found ${list.items.length}.`,
          );
        }
        doc.replaceAtPath(path, list.items[0]!);
      }
    });
  }

  override canApply(doc: Node): boolean {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) =>
        node instanceof ListNode && (node as ListNode).items.length === 1,
    );
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "no-match") return mapSelector(sel);
    if (m.rest.length === 0) return mapSelector(sel);
    const firstSeg = m.rest.segments[0];
    if (firstSeg === "*" || firstSeg === 0) {
      return mapSelector(
        new Selector([
          ...m.specificPrefix.segments,
          ...m.rest.segments.slice(1),
        ]),
      );
    }
    return REMOVED_SELECTOR;
  }

  computeInverse(preDoc: Node): Edit {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const list = this.assertList(nodes[0]!);
    return new WrapListEdit(this.target, list.tag);
  }

  equals(other: Edit): boolean {
    return other instanceof UnwrapListEdit &&
      this.target.equals(other.target);
  }

  withTarget(target: Selector): UnwrapListEdit {
    return new UnwrapListEdit(target);
  }

  encodeRemoteEdit(): EncodedUnwrapListEdit {
    return {
      kind: "UnwrapListEdit",
      target: this.target.format(),
    };
  }
}

registerRemoteEditDecoder<EncodedUnwrapListEdit>(
  "UnwrapListEdit",
  (encodedEdit) => new UnwrapListEdit(Selector.parse(encodedEdit.target)),
);
