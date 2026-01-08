import { next as Automerge, type Doc } from "@automerge/automerge";
import { describe, expect, test } from "vitest";
import { UndoManager } from "./UndoManager";

interface TestDoc {
  name: string;
  count: number;
  items: string[];
}

function createTestDoc(): Doc<TestDoc> {
  return Automerge.from({ name: "test", count: 0, items: [] });
}

describe("UndoManager", () => {
  test("canUndo/canRedo are false initially", () => {
    const undoManager = new UndoManager<TestDoc>();
    expect(undoManager.canUndo).toBe(false);
    expect(undoManager.canRedo).toBe(false);
  });

  test("change() makes canUndo true", () => {
    const undoManager = new UndoManager<TestDoc>();
    let doc = createTestDoc();

    doc = undoManager.change(doc, (d) => {
      d.count = 1;
    });

    expect(undoManager.canUndo).toBe(true);
    expect(undoManager.canRedo).toBe(false);
    expect(doc.count).toBe(1);
  });

  test("undo() reverts a single change", () => {
    const undoManager = new UndoManager<TestDoc>();
    let doc = createTestDoc();

    doc = undoManager.change(doc, (d) => {
      d.name = "changed";
    });
    expect(doc.name).toBe("changed");

    const undone = undoManager.undo(doc);
    expect(undone).not.toBeNull();
    expect(undone!.name).toBe("test");
  });

  test("redo() restores an undone change", () => {
    const undoManager = new UndoManager<TestDoc>();
    let doc = createTestDoc();

    doc = undoManager.change(doc, (d) => {
      d.count = 42;
    });

    doc = undoManager.undo(doc)!;
    expect(doc.count).toBe(0);
    expect(undoManager.canRedo).toBe(true);

    doc = undoManager.redo(doc)!;
    expect(doc.count).toBe(42);
  });

  test("undo() returns null when stack is empty", () => {
    const undoManager = new UndoManager<TestDoc>();
    const doc = createTestDoc();
    expect(undoManager.undo(doc)).toBeNull();
  });

  test("redo() returns null when stack is empty", () => {
    const undoManager = new UndoManager<TestDoc>();
    const doc = createTestDoc();
    expect(undoManager.redo(doc)).toBeNull();
  });

  test("new change clears redo stack", () => {
    const undoManager = new UndoManager<TestDoc>();
    let doc = createTestDoc();

    doc = undoManager.change(doc, (d) => {
      d.count = 1;
    });
    doc = undoManager.undo(doc)!;
    expect(undoManager.canRedo).toBe(true);

    doc = undoManager.change(doc, (d) => {
      d.count = 2;
    });
    expect(undoManager.canRedo).toBe(false);
  });

  test("transaction() groups changes into single undo step", () => {
    const undoManager = new UndoManager<TestDoc>();
    let doc = createTestDoc();

    doc = undoManager.transaction(doc, (change) => {
      let d = doc;
      d = change(d, (d) => {
        d.name = "first";
      });
      d = change(d, (d) => {
        d.count = 100;
      });
      d = change(d, (d) => {
        d.items.push("item1");
      });
      return d;
    });

    expect(doc.name).toBe("first");
    expect(doc.count).toBe(100);
    expect(doc.items).toContain("item1");

    // Single undo should revert all three changes
    doc = undoManager.undo(doc)!;
    expect(doc.name).toBe("test");
    expect(doc.count).toBe(0);
    expect(doc.items).not.toContain("item1");

    // Only one undo entry
    expect(undoManager.canUndo).toBe(false);
  });

  test("multiple undo/redo cycles work correctly", () => {
    const undoManager = new UndoManager<TestDoc>();
    let doc = createTestDoc();

    doc = undoManager.change(doc, (d) => {
      d.count = 1;
    });
    doc = undoManager.change(doc, (d) => {
      d.count = 2;
    });
    doc = undoManager.change(doc, (d) => {
      d.count = 3;
    });

    expect(doc.count).toBe(3);

    doc = undoManager.undo(doc)!;
    expect(doc.count).toBe(2);

    doc = undoManager.undo(doc)!;
    expect(doc.count).toBe(1);

    doc = undoManager.redo(doc)!;
    expect(doc.count).toBe(2);

    doc = undoManager.redo(doc)!;
    expect(doc.count).toBe(3);
  });

  test("clear() empties both stacks", () => {
    const undoManager = new UndoManager<TestDoc>();
    let doc = createTestDoc();

    doc = undoManager.change(doc, (d) => {
      d.count = 1;
    });
    undoManager.undo(doc);

    expect(undoManager.canUndo).toBe(false);
    expect(undoManager.canRedo).toBe(true);

    undoManager.clear();
    expect(undoManager.canUndo).toBe(false);
    expect(undoManager.canRedo).toBe(false);
  });

  test("per-replica undo preserves concurrent changes", () => {
    // Simulate two users each with their own undo manager
    const userA = new UndoManager<TestDoc>();
    const userB = new UndoManager<TestDoc>();

    // Start with same document
    let docA = createTestDoc();
    let docB = Automerge.clone(docA);

    // User A makes a change
    docA = userA.change(docA, (d) => {
      d.name = "userA";
    });

    // User B makes a different change
    docB = userB.change(docB, (d) => {
      d.count = 999;
    });

    // Merge: A receives B's changes
    docA = Automerge.merge(docA, docB);
    expect(docA.name).toBe("userA");
    expect(docA.count).toBe(999);

    // User A undoes their change - should only affect name, not count
    docA = userA.undo(docA)!;
    expect(docA.name).toBe("test"); // reverted
    expect(docA.count).toBe(999); // preserved from B
  });

  // ========== String splice tests ==========
  
  test("undo reverts string splice (append text)", () => {
    const undoManager = new UndoManager<TestDoc>();
    let doc = createTestDoc();
    expect(doc.name).toBe("test");

    doc = undoManager.change(doc, (d) => {
      Automerge.splice(d, ["name"], 4, 0, " appended");
    });
    expect(doc.name).toBe("test appended");

    doc = undoManager.undo(doc)!;
    expect(doc.name).toBe("test");
  });

  test("undo reverts string splice (delete text)", () => {
    const undoManager = new UndoManager<TestDoc>();
    let doc = createTestDoc();
    expect(doc.name).toBe("test");

    doc = undoManager.change(doc, (d) => {
      Automerge.splice(d, ["name"], 0, 2, ""); // delete "te"
    });
    expect(doc.name).toBe("st");

    doc = undoManager.undo(doc)!;
    expect(doc.name).toBe("test");
  });

  test("undo reverts string splice (replace text)", () => {
    const undoManager = new UndoManager<TestDoc>();
    let doc = createTestDoc();
    expect(doc.name).toBe("test");

    doc = undoManager.change(doc, (d) => {
      Automerge.splice(d, ["name"], 0, 4, "replaced");
    });
    expect(doc.name).toBe("replaced");

    doc = undoManager.undo(doc)!;
    expect(doc.name).toBe("test");
  });
});
