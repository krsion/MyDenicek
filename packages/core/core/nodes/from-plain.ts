import { ListNode } from "./list-node.ts";
import type { Node } from "./base.ts";
import { PrimitiveNode } from "./primitive-node.ts";
import { RecordNode } from "./record-node.ts";
import { ReferenceNode } from "./reference-node.ts";
import type { PlainList, PlainNode, PlainRecord, PlainRef } from "./plain.ts";
import { Selector, validateFieldName } from "../selector.ts";

export function createNodeFromPlain(plain: PlainNode): Node {
  if (plain === null) throw new Error("Null is not a valid PlainNode.");
  if (typeof plain !== "object") return new PrimitiveNode(plain);
  if ("$ref" in plain) {
    return new ReferenceNode(Selector.parse((plain as PlainRef).$ref));
  }
  if ("$items" in plain && Array.isArray((plain as PlainList).$items)) {
    const list = plain as PlainList;
    return new ListNode(list.$tag, list.$items.map(createNodeFromPlain));
  }
  const record = plain as PlainRecord;
  const fields: Record<string, Node> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== "$tag") {
      validateFieldName(key);
      fields[key] = createNodeFromPlain(value as PlainNode);
    }
  }
  return new RecordNode(record.$tag, fields);
}
