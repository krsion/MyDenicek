import { ListNode } from "./list-node.ts";
import type { Node } from "./base.ts";
import { PrimitiveNode } from "./primitive-node.ts";
import { RecordNode } from "./record-node.ts";
import { ReferenceNode } from "./reference-node.ts";
import type { PlainList, PlainNode, PlainRecord, PlainRef } from "./plain.ts";
import { Selector, validateFieldName } from "../selector.ts";

// This bound prevents stack overflows and runaway work when callers hand the
// public API extremely deep object graphs. Real documents should stay far below
// this depth, so rejecting deeper inputs protects invariants without narrowing
// normal usage.
const MAX_PLAIN_NODE_DEPTH = 512;

function checkIsPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateNodeTag(tag: unknown, kind: "List" | "Record"): string {
  if (typeof tag !== "string" || tag.length === 0) {
    throw new Error(`${kind} nodes must carry a non-empty string $tag.`);
  }
  return tag;
}

function createNodeFromPlainInternal(
  plain: PlainNode,
  ancestors: WeakSet<object>,
  depth: number,
): Node {
  if (depth > MAX_PLAIN_NODE_DEPTH) {
    throw new Error(
      `Plain nodes cannot be nested deeper than ${MAX_PLAIN_NODE_DEPTH} levels.`,
    );
  }
  if (plain === null) throw new Error("Null is not a valid PlainNode.");
  if (typeof plain !== "object") return new PrimitiveNode(plain);
  if (Array.isArray(plain)) {
    throw new Error(
      "Arrays are not valid PlainNode values. Use a {$tag, $items} list.",
    );
  }
  if (ancestors.has(plain)) {
    throw new Error("Plain nodes must not contain cycles.");
  }
  ancestors.add(plain);
  try {
    if ("$ref" in plain) {
      const reference = plain as PlainRef;
      if (typeof reference.$ref !== "string") {
        throw new Error("Reference nodes must carry a string $ref.");
      }
      return new ReferenceNode(Selector.parse(reference.$ref));
    }
    if ("$items" in plain) {
      const list = plain as PlainList;
      const tag = validateNodeTag(list.$tag, "List");
      if (!Array.isArray(list.$items)) {
        throw new Error("List nodes must carry an array $items field.");
      }
      return new ListNode(
        tag,
        list.$items.map((item) =>
          createNodeFromPlainInternal(item as PlainNode, ancestors, depth + 1)
        ),
      );
    }
    if (!checkIsPlainObject(plain)) {
      throw new Error(
        "Plain nodes must be primitives, references, records, or lists.",
      );
    }
    const record = plain as PlainRecord;
    const tag = validateNodeTag(record.$tag, "Record");
    const fields: Record<string, Node> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key !== "$tag") {
        validateFieldName(key);
        fields[key] = createNodeFromPlainInternal(
          value as PlainNode,
          ancestors,
          depth + 1,
        );
      }
    }
    return new RecordNode(tag, fields);
  } finally {
    ancestors.delete(plain);
  }
}

export function createNodeFromPlain(plain: PlainNode): Node {
  return createNodeFromPlainInternal(plain, new WeakSet<object>(), 0);
}
