import { type Edit, NoOpOnRemovedTargetEdit } from "./base.ts";
import {
  mapSelector,
  type PrimitiveValue,
  Selector,
  type SelectorTransform,
} from "../selector.ts";
import { type Node, PrimitiveNode } from "../nodes.ts";
import { applyRegisteredPrimitiveEdit } from "../primitive-edits.ts";
import {
  type EncodedRemoteEdit,
  registerRemoteEditDecoder,
} from "../remote-edit-codec.ts";

type EncodedSetValueEdit = Extract<EncodedRemoteEdit, { kind: "SetValueEdit" }>;
type EncodedApplyPrimitiveEdit = Extract<
  EncodedRemoteEdit,
  { kind: "ApplyPrimitiveEdit" }
>;

export class SetValueEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = false;
  readonly kind = "SetValue";

  constructor(readonly target: Selector, readonly value: PrimitiveValue) {
    super();
  }

  apply(doc: Node): void {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const node of nodes) {
      if (!node.setPrimitive(this.value)) {
        throw new Error(
          `${this.constructor.name}: expected PrimitiveNode, found '${node.constructor.name}'`,
        );
      }
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) => node instanceof PrimitiveNode,
    );
  }

  transformSelector(sel: Selector): SelectorTransform {
    return mapSelector(sel);
  }

  equals(other: Edit): boolean {
    return other instanceof SetValueEdit && this.target.equals(other.target) &&
      this.value === other.value;
  }

  withTarget(target: Selector): SetValueEdit {
    return new SetValueEdit(target, this.value);
  }
  encodeRemoteEdit(): EncodedSetValueEdit {
    return {
      kind: "SetValueEdit",
      target: this.target.format(),
      value: this.value,
    };
  }
}

registerRemoteEditDecoder<EncodedSetValueEdit>(
  "SetValueEdit",
  (encodedEdit) =>
    new SetValueEdit(Selector.parse(encodedEdit.target), encodedEdit.value),
);

export class ApplyPrimitiveEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = false;
  readonly kind = "ApplyPrimitiveEdit";

  constructor(readonly target: Selector, readonly editName: string) {
    super();
  }

  apply(doc: Node): void {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const node of nodes) {
      if (!(node instanceof PrimitiveNode)) {
        throw new Error(
          `${this.constructor.name}: expected PrimitiveNode, found '${node.constructor.name}'`,
        );
      }
      node.setPrimitive(
        applyRegisteredPrimitiveEdit(this.editName, node.value),
      );
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) => node instanceof PrimitiveNode,
    );
  }

  transformSelector(sel: Selector): SelectorTransform {
    return mapSelector(sel);
  }

  equals(other: Edit): boolean {
    return other instanceof ApplyPrimitiveEdit &&
      this.target.equals(other.target) &&
      this.editName === other.editName;
  }

  withTarget(target: Selector): ApplyPrimitiveEdit {
    return new ApplyPrimitiveEdit(target, this.editName);
  }
  encodeRemoteEdit(): EncodedApplyPrimitiveEdit {
    return {
      kind: "ApplyPrimitiveEdit",
      target: this.target.format(),
      editName: this.editName,
    };
  }
}

registerRemoteEditDecoder<EncodedApplyPrimitiveEdit>(
  "ApplyPrimitiveEdit",
  (encodedEdit) =>
    new ApplyPrimitiveEdit(
      Selector.parse(encodedEdit.target),
      encodedEdit.editName,
    ),
);
