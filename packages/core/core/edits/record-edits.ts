import { type Edit, NoOpOnRemovedTargetEdit } from './base.ts';
import { mapSelector, REMOVED_SELECTOR, type SelectorTransform, Selector } from '../selector.ts';
import { type Node, RecordNode } from '../nodes.ts';

export class RecordAddEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = false;

  constructor(readonly target: Selector, readonly node: Node) { super(); }

  apply(doc: Node): void {
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
}

export class RecordDeleteEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;

  constructor(readonly target: Selector) { super(); }

  apply(doc: Node): void {
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
}

export class RecordRenameFieldEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;

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
}
