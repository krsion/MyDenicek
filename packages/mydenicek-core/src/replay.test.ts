import { next as Automerge, type Doc } from "@automerge/automerge";
import { describe, expect, test } from "vitest";
import { replayScript } from "./replay";
import type { ElementNode, GeneralizedPatch, JsonDoc, ValueNode } from "./types";

/**
 * Create a simple document with a ul and one li child.
 */
function createDocWithUl(): Doc<JsonDoc> {
  const doc: JsonDoc = {
    root: "root",
    nodes: {
      root: { kind: "element", tag: "div", attrs: {}, children: ["ul1"] },
      ul1: { kind: "element", tag: "ul", attrs: {}, children: ["li1"] },
      li1: { kind: "element", tag: "li", attrs: {}, children: ["text1"] },
      text1: { kind: "value", value: "Item 1" },
    },
    transformations: {},
  };
  return Automerge.from(doc);
}

describe("replayScript", () => {
  test("replays adding li with value to ul", () => {
    let doc = createDocWithUl();
    
    // Simulate the recorded script for adding an li with a value child
    const script: GeneralizedPatch[] = [
      // Create the li element node
      { action: "put", path: ["nodes", "$1"], value: { kind: "element", tag: "li", attrs: {}, children: [] } },
      // Insert empty string into $0's children array at index 1
      { action: "insert", path: ["nodes", "$0", "children", 1], values: [""] },
      // Splice the $1 reference into that empty string
      { action: "splice", path: ["nodes", "$0", "children", 1, 0], value: "$1" },
      // Create the value node
      { action: "put", path: ["nodes", "$2"], value: { kind: "value", value: "Item 2" } },
      // Insert empty string into $1's children array at index 0
      { action: "insert", path: ["nodes", "$1", "children", 0], values: [""] },
      // Splice the $2 reference into that empty string
      { action: "splice", path: ["nodes", "$1", "children", 0, 0], value: "$2" },
    ];
    
    doc = Automerge.change(doc, (d) => {
      replayScript(d, script, "ul1");
    });
    
    // After replay, ul1 should have 2 children: li1 and the new li
    const ul = doc.nodes["ul1"] as ElementNode;
    expect(ul.children).toHaveLength(2);
    expect(ul.children[0]).toBe("li1"); // Original
    
    // The new li should be a valid node ID
    const newLiId = ul.children[1];
    expect(newLiId).toBeDefined();
    expect(newLiId).not.toBe("$1");
    expect(newLiId.startsWith("n_")).toBe(true);
    
    // Check the new li node
    const newLi = doc.nodes[newLiId] as ElementNode;
    expect(newLi).toBeDefined();
    expect(newLi.kind).toBe("element");
    expect(newLi.tag).toBe("li");
    expect(newLi.children).toHaveLength(1);
    
    // Check the value child
    const valueId = newLi.children[0];
    expect(valueId).toBeDefined();
    expect(valueId).not.toBe("$2");
    expect(valueId.startsWith("n_")).toBe(true);
    
    const valueNode = doc.nodes[valueId] as ValueNode;
    expect(valueNode).toBeDefined();
    expect(valueNode.kind).toBe("value");
    expect(valueNode.value).toBe("Item 2");
  });
  
  test("replays adding li with Automerge-style patches (with empty puts and splices)", () => {
    let doc = createDocWithUl();
    
    // This mimics what Automerge actually records - with empty property puts and splices
    const script: GeneralizedPatch[] = [
      // Create the li element node
      { action: "put", path: ["nodes", "$1"], value: { kind: "element", tag: "li", attrs: {}, children: [] } },
      // Insert empty string into $0's children array at index 1
      { action: "insert", path: ["nodes", "$0", "children", 1], values: [""] },
      // Automerge's empty property puts (these should be skipped)
      { action: "put", path: ["nodes", "$1", "kind"], value: undefined },
      { action: "put", path: ["nodes", "$1", "tag"], value: undefined },
      { action: "put", path: ["nodes", "$1", "attrs"], value: {} },
      { action: "put", path: ["nodes", "$1", "children"], value: [] },
      // Automerge's splices into string properties
      { action: "splice", path: ["nodes", "$1", "kind", 0], value: "element" },
      { action: "splice", path: ["nodes", "$1", "tag", 0], value: "li" },
      // Splice the $1 reference into the children array
      { action: "splice", path: ["nodes", "$0", "children", 1, 0], value: "$1" },
      // Create the value node
      { action: "put", path: ["nodes", "$2"], value: { kind: "value", value: "Item 2" } },
      // Insert empty string into $1's children array at index 0
      { action: "insert", path: ["nodes", "$1", "children", 0], values: [""] },
      // Automerge's empty property puts
      { action: "put", path: ["nodes", "$2", "kind"], value: undefined },
      { action: "put", path: ["nodes", "$2", "value"], value: undefined },
      // Automerge's splices
      { action: "splice", path: ["nodes", "$2", "kind", 0], value: "value" },
      { action: "splice", path: ["nodes", "$2", "value", 0], value: "Item 2" },
      // Splice the $2 reference into $1's children
      { action: "splice", path: ["nodes", "$1", "children", 0, 0], value: "$2" },
    ];
    
    doc = Automerge.change(doc, (d) => {
      replayScript(d, script, "ul1");
    });
    
    // After replay, ul1 should have 2 children
    const ul = doc.nodes["ul1"] as ElementNode;
    expect(ul.children).toHaveLength(2);
    
    // The new li should be properly linked
    const newLiId = ul.children[1];
    expect(newLiId.startsWith("n_")).toBe(true);
    
    const newLi = doc.nodes[newLiId] as ElementNode;
    expect(newLi.tag).toBe("li");
    expect(newLi.children).toHaveLength(1);
    
    // The value should be properly linked
    const valueId = newLi.children[0];
    expect(valueId.startsWith("n_")).toBe(true);
    
    const valueNode = doc.nodes[valueId] as ValueNode;
    expect(valueNode.kind).toBe("value");
    expect(valueNode.value).toBe("Item 2");
  });
});
