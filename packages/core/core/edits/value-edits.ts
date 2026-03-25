import { type Edit, NoOpOnRemovedTargetEdit } from './base.ts';
import { mapSelector, type PrimitiveValue, type SelectorTransform, type Selector } from '../selector.ts';
import { type Node, PrimitiveNode } from '../nodes.ts';

export class SetValueEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = false;

  constructor(readonly target: Selector, readonly value: PrimitiveValue) { super(); }

  apply(doc: Node): void {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const node of nodes) {
      if (!node.setPrimitive(this.value)) {
        throw new Error(`${this.constructor.name}: expected PrimitiveNode, found '${node.constructor.name}'`);
      }
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(doc, this.target, (node) => node instanceof PrimitiveNode);
  }

  transformSelector(sel: Selector): SelectorTransform { return mapSelector(sel); }

  equals(other: Edit): boolean {
    return other instanceof SetValueEdit&& this.target.equals(other.target) && this.value === other.value;
  }

  withTarget(target: Selector): SetValueEdit { return new SetValueEdit(target, this.value); }
}
