import { type Edit, NoOpOnRemovedTargetEdit } from './base.ts';
import { mapSelector, REMOVED_SELECTOR, type SelectorTransform, Selector } from '../selector.ts';
import { Node, type PlainNode, RecordNode } from '../nodes.ts';
import { registerRemoteEditDecoder, type EncodedRemoteEdit } from '../remote-edit-codec.ts';

type EncodedRecordAddEdit = Extract<EncodedRemoteEdit, { kind: 'RecordAddEdit' }>;
type EncodedRecordDeleteEdit = Extract<EncodedRemoteEdit, { kind: 'RecordDeleteEdit' }>;
type EncodedRecordRenameFieldEdit = Extract<EncodedRemoteEdit, { kind: 'RecordRenameFieldEdit' }>;

export class RecordAddEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = false;
  readonly kind = 'RecordAdd';

  constructor(readonly target: Selector, readonly node: Node) { super(); }

  override validate(doc: Node): void {
    const insertions = doc.navigateWithPaths(this.target.parent)
      .map(({ path, node }) => {
        this.assertRecord(node);
        return { path: new Selector([...path.segments, this.target.lastSegment]), node: this.node };
      });
    this.assertInsertedReferencesResolve(doc, insertions);
  }

  apply(doc: Node): void {
    this.validate(doc);
    const parentSel = this.target.parent;
    const field = String(this.target.lastSegment);
    const parents = this.navigateOrThrow(doc, parentSel);
    for (const parent of parents) {
      if (!parent.addField(field, this.node.clone())) this.assertRecord(parent);
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(doc, this.target.parent, (node) => node instanceof RecordNode);
  }

  transformSelector(sel: Selector): SelectorTransform { return mapSelector(sel); }

  equals(other: Edit): boolean {
    return other instanceof RecordAddEdit&& this.target.equals(other.target) && this.node.equals(other.node);
  }

  withTarget(target: Selector): RecordAddEdit { return new RecordAddEdit(target, this.node); }
  encodeRemoteEdit(): EncodedRecordAddEdit {
    return { kind: 'RecordAddEdit', target: this.target.format(), node: this.node.toPlain() as PlainNode };
  }
}

registerRemoteEditDecoder<EncodedRecordAddEdit>(
  'RecordAddEdit',
  (encodedEdit) => new RecordAddEdit(Selector.parse(encodedEdit.target), Node.fromPlain(encodedEdit.node)),
);

export class RecordDeleteEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;
  readonly kind = 'RecordDelete';

  constructor(readonly target: Selector) { super(); }

  override validate(doc: Node): void {
    this.assertRemovedPathsAreUnreferenced(doc, doc.navigateWithPaths(this.target).map((entry) => entry.path));
  }

  apply(doc: Node): void {
    this.validate(doc);
    const parentSel = this.target.parent;
    const field = String(this.target.lastSegment);
    const parents = this.navigateOrThrow(doc, parentSel);
    for (const parent of parents) {
      if (!parent.deleteField(field)) this.assertRecord(parent);
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(doc, this.target.parent, (node) => node instanceof RecordNode);
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "matched") return REMOVED_SELECTOR;
    return mapSelector(sel);
  }

  equals(other: Edit): boolean {
    return other instanceof RecordDeleteEdit&& this.target.equals(other.target);
  }

  withTarget(target: Selector): RecordDeleteEdit { return new RecordDeleteEdit(target); }
  encodeRemoteEdit(): EncodedRecordDeleteEdit {
    return { kind: 'RecordDeleteEdit', target: this.target.format() };
  }
}

registerRemoteEditDecoder<EncodedRecordDeleteEdit>(
  'RecordDeleteEdit',
  (encodedEdit) => new RecordDeleteEdit(Selector.parse(encodedEdit.target)),
);

export class RecordRenameFieldEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;
  readonly kind = 'RecordRenameField';

  constructor(readonly target: Selector, readonly to: string) { super(); }

  apply(doc: Node): void {
    const parentSel = this.target.parent;
    const from = String(this.target.lastSegment);
    const parents = this.navigateOrThrow(doc, parentSel);
    for (const parent of parents) {
      if (!parent.renameField(from, this.to)) this.assertRecord(parent);
    }
    doc.updateReferences((abs) => this.transformSelectorOrThrow(abs));
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(doc, this.target.parent, (node) => node instanceof RecordNode);
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "no-match") return mapSelector(sel);
    return mapSelector(new Selector([...m.specificPrefix.segments.slice(0, -1), this.to, ...m.rest.segments]));
  }

  equals(other: Edit): boolean {
    return other instanceof RecordRenameFieldEdit && this.target.equals(other.target) && this.to === other.to;
  }

  withTarget(target: Selector): RecordRenameFieldEdit { return new RecordRenameFieldEdit(target, this.to); }
  encodeRemoteEdit(): EncodedRecordRenameFieldEdit {
    return { kind: 'RecordRenameFieldEdit', target: this.target.format(), to: this.to };
  }
}

registerRemoteEditDecoder<EncodedRecordRenameFieldEdit>(
  'RecordRenameFieldEdit',
  (encodedEdit) => new RecordRenameFieldEdit(Selector.parse(encodedEdit.target), encodedEdit.to),
);
