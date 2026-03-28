import { createNodeFromPlain } from "./nodes/from-plain.ts";
import { Node } from "./nodes/base.ts";

Node.fromPlain = createNodeFromPlain;

export { Node } from "./nodes/base.ts";
export { ListNode } from "./nodes/list-node.ts";
export { PrimitiveNode } from "./nodes/primitive-node.ts";
export type {
  PlainList,
  PlainNode,
  PlainRecord,
  PlainRef,
} from "./nodes/plain.ts";
export { RecordNode } from "./nodes/record-node.ts";
export { ReferenceNode } from "./nodes/reference-node.ts";
