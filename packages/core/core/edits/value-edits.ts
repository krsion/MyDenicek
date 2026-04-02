import { type Edit, NoOpOnRemovedTargetEdit } from "./base.ts";
import { ListInsertEdit } from "./list-edits.ts";
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

type EncodedApplyPrimitiveEdit = Extract<
  EncodedRemoteEdit,
  { kind: "ApplyPrimitiveEdit" }
>;

export class ApplyPrimitiveEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = false;
  readonly kind = "ApplyPrimitiveEdit";

  constructor(
    readonly target: Selector,
    readonly editName: string,
    readonly args: PrimitiveValue[] = [],
  ) {
    super();
  }

  apply(doc: Node): void {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const node of nodes) {
      if (!(node instanceof PrimitiveNode)) {
        throw new Error(
          `${node.constructor.name} does not support 'setPrimitive'.`,
        );
      }
      node.setPrimitive(
        applyRegisteredPrimitiveEdit(this.editName, node.value, this.args),
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

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    if (!(concurrent instanceof ListInsertEdit)) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    const rewritten = concurrent.rewriteInsertedNode(
      this.target,
      (transformedNode, relativeTarget) => {
        const nodes = transformedNode.navigate(relativeTarget);
        if (
          nodes.length === 0 ||
          !nodes.every((node) => node instanceof PrimitiveNode)
        ) {
          return null;
        }
        for (const node of nodes) {
          node.setPrimitive(
            applyRegisteredPrimitiveEdit(this.editName, node.value, this.args),
          );
        }
        return transformedNode;
      },
    );
    return rewritten ?? super.transformLaterConcurrentEdit(concurrent);
  }

  equals(other: Edit): boolean {
    return other instanceof ApplyPrimitiveEdit &&
      this.target.equals(other.target) &&
      this.editName === other.editName &&
      this.args.length === other.args.length &&
      this.args.every((arg, index) => arg === other.args[index]);
  }

  withTarget(target: Selector): ApplyPrimitiveEdit {
    return new ApplyPrimitiveEdit(target, this.editName, this.args);
  }

  encodeRemoteEdit(): EncodedApplyPrimitiveEdit {
    return {
      kind: "ApplyPrimitiveEdit",
      target: this.target.format(),
      editName: this.editName,
      args: this.args,
    };
  }
}

registerRemoteEditDecoder<EncodedApplyPrimitiveEdit>(
  "ApplyPrimitiveEdit",
  (encodedEdit) =>
    new ApplyPrimitiveEdit(
      Selector.parse(encodedEdit.target),
      encodedEdit.editName,
      Array.isArray(encodedEdit.args) ? encodedEdit.args : [],
    ),
);
