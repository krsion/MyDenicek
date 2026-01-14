import { next as Automerge, type Doc } from "@automerge/automerge";
import { describe, expect, test } from "vitest";
import { DenicekModel } from "./DenicekModel";
import type { ElementNode, JsonDoc } from "./types";

/**
 * Helper to create a minimal test document with a root and one child.
 */
function createMinimalDoc(): Doc<JsonDoc> {
  const doc: JsonDoc = {
    root: "root",
    nodes: {
      root: { kind: "element", tag: "div", attrs: {}, children: ["child1"] },
      child1: { kind: "value", value: "Hello" },
    },
    transformations: {},
  };
  return Automerge.from(doc);
}

/**
 * Helper to create a document with a parent and multiple children for transformation tests.
 */
function createDocWithChildren(): Doc<JsonDoc> {
  const doc: JsonDoc = {
    root: "root",
    nodes: {
      root: { kind: "element", tag: "ul", attrs: {}, children: ["li1", "li2", "li3"] },
      li1: { kind: "element", tag: "li", attrs: {}, children: ["text1"] },
      li2: { kind: "element", tag: "li", attrs: {}, children: ["text2"] },
      li3: { kind: "element", tag: "li", attrs: {}, children: ["text3"] },
      text1: { kind: "value", value: "Item 1" },
      text2: { kind: "value", value: "Item 2" },
      text3: { kind: "value", value: "Item 3" },
    },
    transformations: {},
  };
  return Automerge.from(doc);
}

/**
 * Simulates sync by merging two documents.
 * Returns a tuple of [mergedDocA, mergedDocB] - both should be identical after sync.
 */
function syncDocuments<T>(docA: Doc<T>, docB: Doc<T>): [Doc<T>, Doc<T>] {
  const merged = Automerge.merge(docA, docB);
  // After merge, both peers should have the same state
  return [merged, Automerge.clone(merged)];
}

/**
 * Helper to apply pending transformations after sync.
 */
function applyTransformationsAfterSync(doc: Doc<JsonDoc>): Doc<JsonDoc> {
  return Automerge.change(doc, (d) => {
    const model = new DenicekModel(d);
    model.applyAllPendingTransformations();
  });
}

describe("Sync and Conflict Resolution", () => {
  describe("Basic Value Conflicts (LWW)", () => {
    test("concurrent value edits - LWW resolves to one value", () => {
      // Start with the same document
      let docA = createMinimalDoc();
      let docB = Automerge.clone(docA);

      // Peer A changes value
      docA = Automerge.change(docA, (d) => {
        const node = d.nodes["child1"];
        if (node.kind === "value") {
          node.value = "Hello from A";
        }
      });

      // Peer B changes value concurrently
      docB = Automerge.change(docB, (d) => {
        const node = d.nodes["child1"];
        if (node.kind === "value") {
          node.value = "Hello from B";
        }
      });

      // Sync
      [docA, docB] = syncDocuments(docA, docB);

      // Both should have the same value (LWW)
      const nodeA = docA.nodes["child1"];
      const nodeB = docB.nodes["child1"];
      expect(nodeA).toEqual(nodeB);

      // The value should be one of the two (deterministic based on actor IDs)
      if (nodeA.kind === "value") {
        expect(["Hello from A", "Hello from B"]).toContain(nodeA.value);
      }
    });

    test("concurrent tag changes - LWW resolves", () => {
      let docA = createDocWithChildren();
      let docB = Automerge.clone(docA);

      // Peer A changes tag
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.updateTag("li1", "div");
      });

      // Peer B changes same tag differently
      docB = Automerge.change(docB, (d) => {
        const model = new DenicekModel(d);
        model.updateTag("li1", "span");
      });

      // Sync
      [docA, docB] = syncDocuments(docA, docB);

      const nodeA = docA.nodes["li1"] as ElementNode;
      const nodeB = docB.nodes["li1"] as ElementNode;
      expect(nodeA.tag).toEqual(nodeB.tag);
      expect(["div", "span"]).toContain(nodeA.tag);
    });
  });

  describe("Structural Conflicts", () => {
    test("peer A adds child, peer B adds different child - both preserved", () => {
      let docA = createMinimalDoc();
      let docB = Automerge.clone(docA);

      // Peer A adds a child
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        const root = d.nodes["root"] as ElementNode;
        model.addValueChildNode(root, "Child from A", "childA");
      });

      // Peer B adds a different child
      docB = Automerge.change(docB, (d) => {
        const model = new DenicekModel(d);
        const root = d.nodes["root"] as ElementNode;
        model.addValueChildNode(root, "Child from B", "childB");
      });

      // Sync
      [docA, docB] = syncDocuments(docA, docB);

      // Both children should exist
      const rootA = docA.nodes["root"] as ElementNode;
      expect(rootA.children).toContain("childA");
      expect(rootA.children).toContain("childB");
      expect(docA.nodes["childA"]).toBeDefined();
      expect(docA.nodes["childB"]).toBeDefined();
    });

    test("peer A deletes node, peer B edits same node - delete wins", () => {
      let docA = createMinimalDoc();
      let docB = Automerge.clone(docA);

      // Peer A deletes child1
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.deleteNode("child1");
      });

      // Peer B edits child1
      docB = Automerge.change(docB, (d) => {
        const node = d.nodes["child1"];
        if (node.kind === "value") {
          node.value = "Edited by B";
        }
      });

      // Sync
      [docA, docB] = syncDocuments(docA, docB);

      // The node should be removed from children array
      const rootA = docA.nodes["root"] as ElementNode;
      expect(rootA.children).not.toContain("child1");
      // Note: The node data might still exist but is orphaned
    });
  });

  describe("Transformation Sync", () => {
    test("transformation applied to existing children after sync", () => {
      let docA = createDocWithChildren();
      let docB = Automerge.clone(docA);

      // Peer A adds a transformation to rename all li to div
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "div" });
      });

      // Sync - peer B receives the transformation
      [docA, docB] = syncDocuments(docA, docB);

      // Apply pending transformations on B
      docB = applyTransformationsAfterSync(docB);

      // All li should now be div on both peers
      const model = new DenicekModel(docB);
      expect((docB.nodes["li1"] as ElementNode).tag).toBe("div");
      expect((docB.nodes["li2"] as ElementNode).tag).toBe("div");
      expect((docB.nodes["li3"] as ElementNode).tag).toBe("div");
    });

    test("new child added by peer B gets transformation from peer A", () => {
      let docA = createDocWithChildren();
      let docB = Automerge.clone(docA);

      // Peer A adds a transformation
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "div" });
      });

      // Peer B adds a new child (without knowing about transformation)
      docB = Automerge.change(docB, (d) => {
        const model = new DenicekModel(d);
        const root = d.nodes["root"] as ElementNode;
        model.addElementChildNode(root, "li", "li4");
        // Add a text child
        const li4 = d.nodes["li4"] as ElementNode;
        model.addValueChildNode(li4, "Item 4", "text4");
      });

      // Sync
      [docA, docB] = syncDocuments(docA, docB);

      // Apply pending transformations
      docA = applyTransformationsAfterSync(docA);
      docB = applyTransformationsAfterSync(docB);

      // The new child li4 should be renamed to div
      expect((docA.nodes["li4"] as ElementNode).tag).toBe("div");
      expect((docB.nodes["li4"] as ElementNode).tag).toBe("div");

      // Original children should also be div
      expect((docA.nodes["li1"] as ElementNode).tag).toBe("div");
    });

    test("child with higher version is not re-transformed", () => {
      let docA = createDocWithChildren();

      // Apply first transformation
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "div" });
      });

      // Clone after first transformation
      let docB = Automerge.clone(docA);

      // Peer A adds second transformation
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "span" });
      });

      // Peer B manually sets a child's version higher than transformation 1
      // (simulating that it was already transformed)
      docB = Automerge.change(docB, (d) => {
        const node = d.nodes["li1"];
        node.version = 1; // Already at version 1
      });

      // Sync
      [docA, docB] = syncDocuments(docA, docB);

      // Apply pending transformations
      docB = applyTransformationsAfterSync(docB);

      // li1 should be span (version 2 transformation applied)
      expect((docB.nodes["li1"] as ElementNode).tag).toBe("span");
      // version should be 2
      expect(docB.nodes["li1"].version).toBe(2);
    });

    test("concurrent transformations - LWW picks one when same version", () => {
      let docA = createDocWithChildren();
      let docB = Automerge.clone(docA);

      // Peer A adds a rename transformation (will be version 1)
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "div" });
      });

      // Peer B also adds a rename transformation (also version 1)
      docB = Automerge.change(docB, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "span" });
      });

      // Verify both have the same key before sync (new format: lca:tag:depth:version)
      expect(Object.keys(docA.transformations)).toEqual(["root:*:*:1"]);
      expect(Object.keys(docB.transformations)).toEqual(["root:*:*:1"]);

      // Sync
      [docA, docB] = syncDocuments(docA, docB);

      // Apply pending transformations
      docA = applyTransformationsAfterSync(docA);
      docB = applyTransformationsAfterSync(docB);

      // Only 1 transformation survives (LWW picks one)
      expect(Object.keys(docA.transformations).length).toBe(1);
      expect(Object.keys(docA.transformations)).toEqual(["root:*:*:1"]);

      // The surviving transformation should be one of the two
      const survivingTag = docA.transformations["root:*:*:1"].tag;
      expect(["div", "span"]).toContain(survivingTag);

      // Both peers agree on which transformation survived
      expect(docB.transformations["root:*:*:1"].tag).toBe(survivingTag);

      // IMPORTANT: After concurrent transformations with the same version,
      // both peers have consistent state (LWW on both transformation and tag)
      // The children tags are also subject to LWW, so they'll be the same on both peers
      const tagA = (docA.nodes["li1"] as ElementNode).tag;
      const tagB = (docB.nodes["li1"] as ElementNode).tag;
      expect(tagA).toBe(tagB); // Both peers are consistent
      
      // Note: The child tag may or may not match the surviving transformation
      // because both are independently resolved via LWW. This is a known limitation
      // of same-version concurrent transformations.
      expect(["div", "span"]).toContain(tagA);
    });

    test("concurrent wrap transformations - LWW and wrapper behavior", () => {
      let docA = createDocWithChildren();
      let docB = Automerge.clone(docA);

      // Peer A wraps with "article" (version 1)
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "wrap", { tag: "article" });
      });

      // Peer B wraps with "section" (also version 1)
      docB = Automerge.change(docB, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "wrap", { tag: "section" });
      });

      // Both have applied their wrap transformations locally
      // Peer A has wrappers with tag "article"
      // Peer B has wrappers with tag "section"
      // The wrapper ID format is now: wrap-${lca}-${version}-${nodeId}
      const rootA_before = docA.nodes["root"] as ElementNode;
      const rootB_before = docB.nodes["root"] as ElementNode;
      expect(rootA_before.children).toContain("wrap-root-1-li1");
      expect(rootB_before.children).toContain("wrap-root-1-li1");
      expect((docA.nodes["wrap-root-1-li1"] as ElementNode).tag).toBe("article");
      expect((docB.nodes["wrap-root-1-li1"] as ElementNode).tag).toBe("section");

      // Sync
      [docA, docB] = syncDocuments(docA, docB);

      // Apply pending transformations after sync
      docA = applyTransformationsAfterSync(docA);
      docB = applyTransformationsAfterSync(docB);

      // LWW picks one transformation (either article or section)
      const survivingTag = docA.transformations["root:*:*:1"].tag;
      expect(["article", "section"]).toContain(survivingTag);

      // Both peers should agree on transformation
      expect(docB.transformations["root:*:*:1"].tag).toBe(survivingTag);

      // QUESTION: Does the wrapper tag match the surviving transformation?
      // After LWW merge, both wrapper nodes' tags are subject to LWW too
      const wrapperTagA = (docA.nodes["wrap-root-1-li1"] as ElementNode).tag;
      const wrapperTagB = (docB.nodes["wrap-root-1-li1"] as ElementNode).tag;
      
      // Both peers should have consistent wrapper tags (LWW)
      expect(wrapperTagA).toBe(wrapperTagB);
      
      // Log what actually happened for visibility
      console.log(`Surviving transformation: ${survivingTag}, wrapper tag: ${wrapperTagA}`);
    });

    test("wrap transformation creates wrapper and updates version", () => {
      let docA = createDocWithChildren();
      let docB = Automerge.clone(docA);

      // Peer A adds wrap transformation
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "wrap", { tag: "article" });
      });

      // Peer B adds a new li child
      docB = Automerge.change(docB, (d) => {
        const model = new DenicekModel(d);
        const root = d.nodes["root"] as ElementNode;
        model.addElementChildNode(root, "li", "li4");
      });

      // Sync
      [docA, docB] = syncDocuments(docA, docB);

      // Apply pending transformations
      docA = applyTransformationsAfterSync(docA);
      docB = applyTransformationsAfterSync(docB);

      // li4 should be wrapped (wrapper ID format: wrap-${lca}-${version}-${nodeId})
      const rootA = docA.nodes["root"] as ElementNode;
      expect(rootA.children).toContain("wrap-root-1-li4");
      const wrapperA = docA.nodes["wrap-root-1-li4"] as ElementNode;
      expect(wrapperA.tag).toBe("article");
      expect(wrapperA.children).toContain("li4");

      // Original li4's version should be updated
      expect(docA.nodes["li4"].version).toBe(1);
    });
  });

  describe("Complex Scenarios", () => {
    test("three-way merge: A and B diverge, then sync", () => {
      // Start with common ancestor
      let docA = createDocWithChildren();
      let docB = Automerge.clone(docA);

      // Peer A: rename li1, add transformation
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.updateTag("li1", "strong");
      });
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "p" });
      });

      // Peer B: edit text, add child
      docB = Automerge.change(docB, (d) => {
        const node = d.nodes["text1"];
        if (node.kind === "value") {
          node.value = "Modified Item 1";
        }
      });
      docB = Automerge.change(docB, (d) => {
        const model = new DenicekModel(d);
        const root = d.nodes["root"] as ElementNode;
        model.addElementChildNode(root, "li", "li4");
      });

      // Sync
      [docA, docB] = syncDocuments(docA, docB);
      docA = applyTransformationsAfterSync(docA);
      docB = applyTransformationsAfterSync(docB);

      // Verify merge results
      // - li1 was renamed by A to "strong", then transformation renamed it to "p"
      //   (but A's manual change might conflict with transformation - depends on order)
      // - text1 has B's modification
      const text1 = docA.nodes["text1"];
      if (text1.kind === "value") {
        expect(text1.value).toBe("Modified Item 1");
      }

      // - li4 exists and was transformed
      expect(docA.nodes["li4"]).toBeDefined();
      expect((docA.nodes["li4"] as ElementNode).tag).toBe("p");
    });

    test("rapid sequential syncs maintain consistency", () => {
      let docA = createDocWithChildren();
      let docB = Automerge.clone(docA);
      let docC = Automerge.clone(docA);

      // Peer A adds transformation
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "div" });
      });

      // Sync A -> B
      [docA, docB] = syncDocuments(docA, docB);
      docB = applyTransformationsAfterSync(docB);

      // Peer C adds a child (still has old state)
      docC = Automerge.change(docC, (d) => {
        const model = new DenicekModel(d);
        const root = d.nodes["root"] as ElementNode;
        model.addElementChildNode(root, "li", "li4");
      });

      // Sync B -> C
      [docB, docC] = syncDocuments(docB, docC);
      docC = applyTransformationsAfterSync(docC);

      // li4 should exist and be transformed
      expect(docC.nodes["li4"]).toBeDefined();
      expect((docC.nodes["li4"] as ElementNode).tag).toBe("div");

      // All documents should be consistent
      const finalA = applyTransformationsAfterSync(Automerge.merge(docA, docC));
      const finalB = applyTransformationsAfterSync(Automerge.merge(docB, docC));
      const finalC = docC;

      expect((finalA.nodes["li4"] as ElementNode).tag).toBe("div");
      expect((finalB.nodes["li4"] as ElementNode).tag).toBe("div");
      expect((finalC.nodes["li4"] as ElementNode).tag).toBe("div");
    });
  });

  describe("Edge Cases", () => {
    test("empty transformations array handles gracefully", () => {
      let doc = createMinimalDoc();
      doc = applyTransformationsAfterSync(doc);
      // Should not throw
      expect(doc.nodes["child1"]).toBeDefined();
    });

    test("transformation on non-existent parent is ignored", () => {
      let doc = createMinimalDoc();
      doc = Automerge.change(doc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("non-existent", "rename", { tag: "div" });
      });
      // Should not throw, transformation should be empty or ignored
      expect(Object.keys(doc.transformations).length).toBe(0);
    });

    test("node with undefined version treated as 0", () => {
      let docA = createDocWithChildren();

      // Ensure nodes don't have version set
      expect(docA.nodes["li1"].version).toBeUndefined();

      // Add transformation
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "div" });
      });

      // Version should now be 1
      expect(docA.nodes["li1"].version).toBe(1);
      expect((docA.nodes["li1"] as ElementNode).tag).toBe("div");
    });

    test("multiple transformations on same parent applied in order", () => {
      let doc = createDocWithChildren();

      // Add first transformation
      doc = Automerge.change(doc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "div" });
      });

      // Add second transformation
      doc = Automerge.change(doc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "span" });
      });

      // Final tag should be span (version 2)
      expect((doc.nodes["li1"] as ElementNode).tag).toBe("span");
      expect(doc.nodes["li1"].version).toBe(2);
      expect(Object.keys(doc.transformations).length).toBe(2);
      expect(doc.transformations["root:*:*:1"].version).toBe(1);
      expect(doc.transformations["root:*:*:2"].version).toBe(2);
    });

    test("locally added child after transformation gets parent's latest version", () => {
      let doc = createDocWithChildren();

      // Add transformation (version 1)
      doc = Automerge.change(doc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "div" });
      });

      // Existing children should be renamed
      expect((doc.nodes["li1"] as ElementNode).tag).toBe("div");

      // Add a new child AFTER the transformation
      doc = Automerge.change(doc, (d) => {
        const model = new DenicekModel(d);
        const root = d.nodes["root"] as ElementNode;
        model.addElementChildNode(root, "li", "li4");
      });

      // New child should have version 2 (latestVersion + 1, so it won't be affected by old transformations)
      expect(doc.nodes["li4"].version).toBe(2);
      // New child should keep its original tag (not transformed by addChildNode)
      expect((doc.nodes["li4"] as ElementNode).tag).toBe("li");

      // Note: applyTransformationsAfterSync IS designed for post-sync LWW reconciliation
      // and WILL re-apply transformations. That's expected behavior.
      // The version prevents transformation during addChildNode, not during post-sync reconciliation.
    });

    test("locally added sibling after transformation gets parent's latest version", () => {
      let doc = createDocWithChildren();

      // Add transformation (version 1)
      doc = Automerge.change(doc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "div" });
      });

      // Add sibling AFTER the transformation
      doc = Automerge.change(doc, (d) => {
        const model = new DenicekModel(d);
        model.addSiblingNodeAfter("li1");
      });

      // Find the new sibling
      const root = doc.nodes["root"] as ElementNode;
      const newSiblingId = root.children.find(id => id !== "li1" && id !== "li2" && id !== "li3");
      expect(newSiblingId).toBeDefined();

      // New sibling should have version 2 (latestVersion + 1, so it won't be affected by old transformations)
      expect(doc.nodes[newSiblingId!].version).toBe(2);
      expect((doc.nodes[newSiblingId!] as ElementNode).tag).toBe("div"); // Copied from sibling which was already transformed
    });
  });

  describe("Selector-based Transformations", () => {
    test("transformation with selectorTag only matches specific tags", () => {
      // Create document with mixed element types
      const doc: JsonDoc = {
        root: "root",
        nodes: {
          root: { kind: "element", tag: "article", attrs: {}, children: ["p1", "div1", "p2"] },
          p1: { kind: "element", tag: "p", attrs: {}, children: ["text1"] },
          div1: { kind: "element", tag: "div", attrs: {}, children: ["text2"] },
          p2: { kind: "element", tag: "p", attrs: {}, children: ["text3"] },
          text1: { kind: "value", value: "Text 1" },
          text2: { kind: "value", value: "Text 2" },
          text3: { kind: "value", value: "Text 3" },
        },
        transformations: {},
      };
      
      let amDoc = Automerge.from(doc);
      
      // Add transformation that only targets 'p' elements
      amDoc = Automerge.change(amDoc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "paragraph", selectorTag: "p" });
      });
      
      // Only p elements should be renamed
      expect((amDoc.nodes["p1"] as ElementNode).tag).toBe("paragraph");
      expect((amDoc.nodes["div1"] as ElementNode).tag).toBe("div"); // unchanged
      expect((amDoc.nodes["p2"] as ElementNode).tag).toBe("paragraph");
    });

    test("transformation with selectorDepth only matches specific depth", () => {
      // Create nested document
      const doc: JsonDoc = {
        root: "root",
        nodes: {
          root: { kind: "element", tag: "article", attrs: {}, children: ["section1"] },
          section1: { kind: "element", tag: "div", attrs: {}, children: ["nested1"] },
          nested1: { kind: "element", tag: "div", attrs: {}, children: ["text1"] },
          text1: { kind: "value", value: "Text 1" },
        },
        transformations: {},
      };
      
      let amDoc = Automerge.from(doc);
      
      // Add transformation that only targets depth 1
      amDoc = Automerge.change(amDoc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "first-level", selectorDepth: 1 });
      });
      
      // Only depth 1 should be renamed
      expect((amDoc.nodes["section1"] as ElementNode).tag).toBe("first-level");
      expect((amDoc.nodes["nested1"] as ElementNode).tag).toBe("div"); // depth 2, unchanged
    });

    test("transformation with both selectorTag and selectorDepth", () => {
      // Create document with li elements at different depths
      const doc: JsonDoc = {
        root: "root",
        nodes: {
          root: { kind: "element", tag: "ul", attrs: {}, children: ["li1", "nested"] },
          li1: { kind: "element", tag: "li", attrs: {}, children: ["text1"] },
          nested: { kind: "element", tag: "div", attrs: {}, children: ["li2"] },
          li2: { kind: "element", tag: "li", attrs: {}, children: ["text2"] },
          text1: { kind: "value", value: "Item 1" },
          text2: { kind: "value", value: "Item 2" },
        },
        transformations: {},
      };
      
      let amDoc = Automerge.from(doc);
      
      // Add transformation that targets 'li' at depth 1
      amDoc = Automerge.change(amDoc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "list-item", selectorTag: "li", selectorDepth: 1 });
      });
      
      // Only li at depth 1 should be renamed
      expect((amDoc.nodes["li1"] as ElementNode).tag).toBe("list-item");
      expect((amDoc.nodes["nested"] as ElementNode).tag).toBe("div"); // not li, unchanged
      expect((amDoc.nodes["li2"] as ElementNode).tag).toBe("li"); // li but at depth 2, unchanged
    });

    test("generalizeSelectionWithInfo returns correct selector info", () => {
      const doc: JsonDoc = {
        root: "root",
        nodes: {
          root: { kind: "element", tag: "ul", attrs: {}, children: ["li1", "li2", "li3"] },
          li1: { kind: "element", tag: "li", attrs: {}, children: ["text1"] },
          li2: { kind: "element", tag: "li", attrs: {}, children: ["text2"] },
          li3: { kind: "element", tag: "li", attrs: {}, children: ["text3"] },
          text1: { kind: "value", value: "Item 1" },
          text2: { kind: "value", value: "Item 2" },
          text3: { kind: "value", value: "Item 3" },
        },
        transformations: {},
      };
      
      const amDoc = Automerge.from(doc);
      const model = new DenicekModel(amDoc);
      
      // Select just li1
      const info = model.generalizeSelectionWithInfo(["li1"]);
      
      expect(info.lcaId).toBe("root");
      expect(info.selectorTag).toBe("li");
      expect(info.selectorDepth).toBe(1);
      expect(info.matchingNodeIds).toContain("li1");
      expect(info.matchingNodeIds).toContain("li2");
      expect(info.matchingNodeIds).toContain("li3");
      expect(info.matchingNodeIds.length).toBe(3);
    });
  });

  describe("CRDT wrap transformation conflict scenarios", () => {
    test("concurrent wrap with different tags, LWW winner is outermost", () => {
      let docA = createDocWithChildren();
      let docB = Automerge.clone(docA);

      // Peer A wraps li1 with <b> (version 1)
      docA = Automerge.change(docA, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "wrap", { tag: "b", selectorTag: "li", selectorDepth: 1 });
      });

      // Peer B wraps li1 with <i> (also version 1)
      docB = Automerge.change(docB, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "wrap", { tag: "i", selectorTag: "li", selectorDepth: 1 });
      });

      // Sync
      [docA, docB] = syncDocuments(docA, docB);
      docA = applyTransformationsAfterSync(docA);
      docB = applyTransformationsAfterSync(docB);

      // Only one wrapper per node (LWW winner)
      const wrapperTag = (docA.nodes["wrap-root-1-li1"] as ElementNode).tag;
      expect(["b", "i"]).toContain(wrapperTag);
      expect((docA.nodes["wrap-root-1-li1"] as ElementNode).children).toContain("li1");
      expect((docB.nodes["wrap-root-1-li1"] as ElementNode).tag).toBe(wrapperTag);
    });

    test("sequential wrap transformations result in nested wrappers", () => {
      let doc = createDocWithChildren();
      // v1: wrap li1 in <b>
      doc = Automerge.change(doc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "wrap", { tag: "b", selectorTag: "li", selectorDepth: 1 });
      });
      // v2: wrap the new <b> wrapper in <i>
      doc = Automerge.change(doc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "wrap", { tag: "i", selectorTag: "b", selectorDepth: 1 });
      });
      doc = applyTransformationsAfterSync(doc);
      // Should be <i><b>li1</b></i>
      // Note: Each selector combination (lca+tag+depth) has its own version counter,
      // so the <b> selector gets version 1 (first transform for that selector)
      const outer = doc.nodes["wrap-root-1-wrap-root-1-li1"] as ElementNode;
      expect(outer.tag).toBe("i");
      const innerId = outer.children[0];
      const inner = doc.nodes[innerId] as ElementNode;
      expect(inner.tag).toBe("b");
      expect(inner.children[0]).toBe("li1");
    });

    test("wrap then rename, both applied", () => {
      let doc = createDocWithChildren();
      // wrap li1 in <b>
      doc = Automerge.change(doc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "wrap", { tag: "b", selectorTag: "li", selectorDepth: 1 });
      });
      // rename li1 to <strong> (now at depth 2 after being wrapped)
      doc = Automerge.change(doc, (d) => {
        const model = new DenicekModel(d);
        model.addTransformation("root", "rename", { tag: "strong", selectorTag: "li", selectorDepth: 2 });
      });
      doc = applyTransformationsAfterSync(doc);
      // The wrapper should be <b>, the node should be <strong>
      const wrapper = doc.nodes["wrap-root-1-li1"] as ElementNode;
      expect(wrapper.tag).toBe("b");
      const renamed = doc.nodes[wrapper.children[0]] as ElementNode;
      expect(renamed.tag).toBe("strong");
    });
  });
});
