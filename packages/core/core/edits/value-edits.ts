import { Edit } from "./base.ts";
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

/** Applies a registered named primitive edit (e.g. "set") to every matched primitive node. */
export class ApplyPrimitiveEdit extends Edit {
  /** @inheritDoc */
  readonly isStructural = false;
  /** @inheritDoc */
  readonly kind = "ApplyPrimitiveEdit";

  /** Creates an edit that applies the named primitive edit with the given arguments. */
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

  override canApply(doc: Node): boolean {
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

  computeInverse(preDoc: Node): Edit {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const primitive = nodes[0]!;
    if (!(primitive instanceof PrimitiveNode)) {
      throw new Error(
        `ApplyPrimitiveEdit.computeInverse: expected primitive, found '${primitive.constructor.name}'`,
      );
    }
    return new ApplyPrimitiveEdit(this.target, "set", [primitive.value]);
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

  override describe(): string {
    const argsStr = this.args.map((a) =>
      typeof a === "string" ? `"${a}"` : String(a)
    ).join(", ");
    return `${this.editName}(${argsStr}) at ${this.target.format()}`;
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
