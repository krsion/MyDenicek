import {
  assertEquals,
  assertThrows,
  Denicek,
  registerPrimitiveEdit,
  sync,
} from "./test-helpers.ts";

// ---------------------------------------------------------------------------
// 1 · Basic undo for each edit type
// ---------------------------------------------------------------------------

Deno.test("undo: set restores original value", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    value: "original",
  });

  peer.set("value", "changed");
  assertEquals(peer.get("value"), ["changed"]);

  peer.undo();
  assertEquals(peer.get("value"), ["original"]);
});

Deno.test("undo: add removes the added field", () => {
  const peer = new Denicek("alice", { $tag: "root" });

  peer.add("", "title", "hello");
  assertEquals(peer.toPlain(), { $tag: "root", title: "hello" });

  peer.undo();
  assertEquals(peer.toPlain(), { $tag: "root" });
});

Deno.test("undo: delete restores deleted field", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    name: "Ada",
  });

  peer.delete("", "name");
  assertEquals(peer.toPlain(), { $tag: "root" });

  peer.undo();
  assertEquals(peer.toPlain(), { $tag: "root", name: "Ada" });
});

Deno.test("undo: rename restores original field name", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    person: { $tag: "person", name: "Ada" },
  });

  peer.rename("person", "name", "fullName");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    person: { $tag: "person", fullName: "Ada" },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    person: { $tag: "person", name: "Ada" },
  });
});

Deno.test("undo: pushBack removes appended item", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "list", $items: ["a"] },
  });

  peer.pushBack("items", "b");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    items: { $tag: "list", $items: ["a", "b"] },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    items: { $tag: "list", $items: ["a"] },
  });
});

Deno.test("undo: pushFront removes prepended item", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "list", $items: ["a"] },
  });

  peer.pushFront("items", "b");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    items: { $tag: "list", $items: ["b", "a"] },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    items: { $tag: "list", $items: ["a"] },
  });
});

Deno.test("undo: popBack restores removed last item", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "list", $items: ["a", "b"] },
  });

  peer.popBack("items");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    items: { $tag: "list", $items: ["a"] },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    items: { $tag: "list", $items: ["a", "b"] },
  });
});

Deno.test("undo: popFront restores removed first item", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "list", $items: ["a", "b"] },
  });

  peer.popFront("items");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    items: { $tag: "list", $items: ["b"] },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    items: { $tag: "list", $items: ["a", "b"] },
  });
});

Deno.test("undo: updateTag restores original tag", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    item: { $tag: "div", name: "test" },
  });

  peer.updateTag("item", "span");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    item: { $tag: "span", name: "test" },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    item: { $tag: "div", name: "test" },
  });
});

Deno.test("undo: wrapRecord restores unwrapped structure", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    name: "Ada",
  });

  peer.wrapRecord("name", "wrapper", "box");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    name: { $tag: "box", wrapper: "Ada" },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    name: "Ada",
  });
});

Deno.test("undo: wrapList restores unwrapped structure", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    name: "Ada",
  });

  peer.wrapList("name", "items");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    name: { $tag: "items", $items: ["Ada"] },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    name: "Ada",
  });
});

// ---------------------------------------------------------------------------
// 2 · Basic redo
// ---------------------------------------------------------------------------

Deno.test("redo: undo then redo restores the edit", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    value: "original",
  });

  peer.set("value", "changed");
  peer.undo();
  assertEquals(peer.get("value"), ["original"]);

  peer.redo();
  assertEquals(peer.get("value"), ["changed"]);
});

Deno.test("redo: multiple undo then redo in sequence", () => {
  const peer = new Denicek("alice", { $tag: "root", v: "a" });

  peer.set("v", "b");
  peer.set("v", "c");

  // Undo both
  peer.undo();
  assertEquals(peer.get("v"), ["b"]);
  peer.undo();
  assertEquals(peer.get("v"), ["a"]);

  // Redo both
  peer.redo();
  assertEquals(peer.get("v"), ["b"]);
  peer.redo();
  assertEquals(peer.get("v"), ["c"]);
});

Deno.test("redo: new edit after undo clears redo stack", () => {
  const peer = new Denicek("alice", { $tag: "root", v: "a" });

  peer.set("v", "b");
  peer.undo();
  assertEquals(peer.get("v"), ["a"]);

  // New edit should clear the redo stack
  peer.set("v", "c");
  assertEquals(peer.canRedo, false);
  assertThrows(() => peer.redo(), Error, "Nothing to redo.");
});

// ---------------------------------------------------------------------------
// 3 · canUndo / canRedo
// ---------------------------------------------------------------------------

Deno.test("canUndo/canRedo: fresh peer has neither", () => {
  const peer = new Denicek("alice", { $tag: "root" });
  assertEquals(peer.canUndo, false);
  assertEquals(peer.canRedo, false);
});

Deno.test("canUndo/canRedo: after edit, canUndo is true", () => {
  const peer = new Denicek("alice", { $tag: "root", v: "a" });
  peer.set("v", "b");
  assertEquals(peer.canUndo, true);
  assertEquals(peer.canRedo, false);
});

Deno.test("canUndo/canRedo: after undo of single edit", () => {
  const peer = new Denicek("alice", { $tag: "root", v: "a" });
  peer.set("v", "b");
  peer.undo();
  assertEquals(peer.canUndo, false);
  assertEquals(peer.canRedo, true);
});

Deno.test("canUndo/canRedo: after redo", () => {
  const peer = new Denicek("alice", { $tag: "root", v: "a" });
  peer.set("v", "b");
  peer.undo();
  peer.redo();
  assertEquals(peer.canUndo, true);
  assertEquals(peer.canRedo, false);
});

Deno.test("canUndo/canRedo: new edit after undo clears canRedo", () => {
  const peer = new Denicek("alice", { $tag: "root", v: "a" });
  peer.set("v", "b");
  peer.undo();
  assertEquals(peer.canRedo, true);

  peer.set("v", "c");
  assertEquals(peer.canRedo, false);
  assertEquals(peer.canUndo, true);
});

// ---------------------------------------------------------------------------
// 4 · Error cases
// ---------------------------------------------------------------------------

Deno.test("undo with nothing to undo throws", () => {
  const peer = new Denicek("alice", { $tag: "root" });
  assertThrows(() => peer.undo(), Error, "Nothing to undo.");
});

Deno.test("redo with nothing to redo throws", () => {
  const peer = new Denicek("alice", { $tag: "root" });
  assertThrows(() => peer.redo(), Error, "Nothing to redo.");
});

// ---------------------------------------------------------------------------
// 5 · Multi-peer convergence with undo
// ---------------------------------------------------------------------------

Deno.test("multi-peer: alice edits, syncs, undoes, both converge", () => {
  const doc = { $tag: "root", v: "original" };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.set("v", "changed");
  sync(alice, bob);
  assertEquals(bob.get("v"), ["changed"]);

  alice.undo();
  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(alice.get("v"), ["original"]);
});

Deno.test("multi-peer: concurrent edits, alice undoes hers, converge", () => {
  const doc = {
    $tag: "root",
    a: "initial-a",
    b: "initial-b",
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Concurrent edits to different fields
  alice.set("a", "alice-a");
  bob.set("b", "bob-b");
  sync(alice, bob);

  // Alice undoes her edit
  alice.undo();
  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(alice.get("a"), ["initial-a"]);
  assertEquals(alice.get("b"), ["bob-b"]);
});

// ---------------------------------------------------------------------------
// 6 · Multiple undos in sequence
// ---------------------------------------------------------------------------

Deno.test("multiple undos: 3 edits, undo all 3, back to original", () => {
  const peer = new Denicek("alice", { $tag: "root", v: "a" });

  peer.set("v", "b");
  peer.set("v", "c");
  peer.set("v", "d");

  peer.undo();
  assertEquals(peer.get("v"), ["c"]);
  peer.undo();
  assertEquals(peer.get("v"), ["b"]);
  peer.undo();
  assertEquals(peer.get("v"), ["a"]);
});

Deno.test("multiple undos: 3 edits, undo 2, verify intermediate", () => {
  const peer = new Denicek("alice", { $tag: "root", v: "a" });

  peer.set("v", "b");
  peer.set("v", "c");
  peer.set("v", "d");

  peer.undo();
  peer.undo();
  assertEquals(peer.get("v"), ["b"]);
  assertEquals(peer.canUndo, true);
});

// ---------------------------------------------------------------------------
// 7 · Undo of structural edits
// ---------------------------------------------------------------------------

Deno.test("undo wrapRecord restores original flat structure", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    data: { $tag: "data", value: "hello" },
  });

  peer.wrapRecord("data/value", "inner", "wrapper");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    data: { $tag: "data", value: { $tag: "wrapper", inner: "hello" } },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    data: { $tag: "data", value: "hello" },
  });
});

Deno.test("undo wrapList restores original structure", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    data: { $tag: "data", value: "hello" },
  });

  peer.wrapList("data/value", "list");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    data: { $tag: "data", value: { $tag: "list", $items: ["hello"] } },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    data: { $tag: "data", value: "hello" },
  });
});

// ---------------------------------------------------------------------------
// 7a · Unwrap edit behavior (via undo of wraps)
// ---------------------------------------------------------------------------

Deno.test("undo: nested wrapRecord + wrapList undone in correct order", () => {
  const peer = new Denicek("alice", { $tag: "root", value: "hello" });

  peer.wrapRecord("value", "inner", "wrapper1");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    value: { $tag: "wrapper1", inner: "hello" },
  });

  peer.wrapList("value", "wrapper2");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    value: {
      $tag: "wrapper2",
      $items: [{ $tag: "wrapper1", inner: "hello" }],
    },
  });

  // Undo wrapList → back to single wrapRecord state
  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    value: { $tag: "wrapper1", inner: "hello" },
  });

  // Undo wrapRecord → back to original
  peer.undo();
  assertEquals(peer.toPlain(), { $tag: "root", value: "hello" });
});

Deno.test("undo wrapRecord: concurrent add inside wrapped field converges", () => {
  const doc = {
    $tag: "root",
    data: { $tag: "inner", x: 1 },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Alice wraps data into { $tag: "outer", child: <inner> }
  alice.wrapRecord("data", "child", "outer");
  // Bob concurrently adds y:2 to the inner record
  bob.add("data", "y", 2);

  sync(alice, bob);
  // Both should see the wrapped structure with Bob's addition inside
  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(alice.toPlain(), {
    $tag: "root",
    data: { $tag: "outer", child: { $tag: "inner", x: 1, y: 2 } },
  });

  // Alice undoes the wrap
  alice.undo();
  sync(alice, bob);

  // Both converge and Bob's concurrent add is preserved
  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(alice.get("data/y"), [2]);
});

Deno.test("undo wrapList: references through wrapped path survive unwrap", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    data: "hello",
    ref: { $ref: "/data" },
  });

  peer.wrapList("data", "wrapped");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    data: { $tag: "wrapped", $items: ["hello"] },
    ref: { $ref: "/data/*" },
  });

  // Undo the wrapList → reference should point back to /data
  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    data: "hello",
    ref: { $ref: "/data" },
  });
});

Deno.test("undo wrapRecord: edits to other fields survive unwrap", () => {
  const peer = new Denicek("alice", { $tag: "root", a: 1, b: 2 });

  peer.wrapRecord("a", "inner", "wrapper");
  peer.set("b", 99);

  assertEquals(peer.toPlain(), {
    $tag: "root",
    a: { $tag: "wrapper", inner: 1 },
    b: 99,
  });

  // Undo set("b", 99) first
  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    a: { $tag: "wrapper", inner: 1 },
    b: 2,
  });

  // Undo wrapRecord → a is restored, b stays at original
  peer.undo();
  assertEquals(peer.toPlain(), { $tag: "root", a: 1, b: 2 });
});

Deno.test("undo: three successive wraps undone restores original", () => {
  const peer = new Denicek("alice", { $tag: "root", x: 42 });

  peer.wrapRecord("x", "a", "t1");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    x: { $tag: "t1", a: 42 },
  });

  peer.wrapRecord("x", "b", "t2");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    x: { $tag: "t2", b: { $tag: "t1", a: 42 } },
  });

  peer.wrapRecord("x", "c", "t3");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    x: { $tag: "t3", c: { $tag: "t2", b: { $tag: "t1", a: 42 } } },
  });

  // Undo all three wraps in reverse order
  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    x: { $tag: "t2", b: { $tag: "t1", a: 42 } },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    x: { $tag: "t1", a: 42 },
  });

  peer.undo();
  assertEquals(peer.toPlain(), { $tag: "root", x: 42 });
});

Deno.test("undo rename restores original field name in nested record", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    data: { $tag: "data", oldKey: "value" },
  });

  peer.rename("data", "oldKey", "newKey");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    data: { $tag: "data", newKey: "value" },
  });

  peer.undo();
  assertEquals(peer.toPlain(), {
    $tag: "root",
    data: { $tag: "data", oldKey: "value" },
  });
});

// ---------------------------------------------------------------------------
// 8 · Advanced edge-case tests
// ---------------------------------------------------------------------------

registerPrimitiveEdit(
  "test-double",
  (value) => (value as number) * 2,
);

Deno.test("undo: applyPrimitiveEdit with custom registered edit", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    count: 5,
  });

  peer.applyPrimitiveEdit("count", "test-double");
  assertEquals(peer.get("count"), [10]);

  peer.undo();
  assertEquals(peer.get("count"), [5]);
});

Deno.test("undo: after compact throws because history is gone", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    v: "original",
  });

  peer.set("v", "changed");
  assertEquals(peer.get("v"), ["changed"]);

  peer.compact(peer.frontiers);

  assertThrows(() => peer.undo(), Error);
});

Deno.test("undo: with interleaved remote events converges", () => {
  const doc = {
    $tag: "root",
    a: "initial-a",
    b: "initial-b",
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Concurrent edits
  alice.set("a", "alice-a");
  bob.set("b", "bob-b");

  // Sync both ways
  sync(alice, bob);
  assertEquals(alice.toPlain(), bob.toPlain());

  // Alice undoes her edit
  alice.undo();
  sync(alice, bob);

  // Both converge: Bob's edit survives, Alice's is undone
  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(alice.get("a"), ["initial-a"]);
  assertEquals(alice.get("b"), ["bob-b"]);
});

Deno.test("undo/redo: alternating undo and redo multiple times", () => {
  const peer = new Denicek("alice", { $tag: "root", v: "a" });

  peer.set("v", "b");
  assertEquals(peer.get("v"), ["b"]);

  // undo → original
  peer.undo();
  assertEquals(peer.get("v"), ["a"]);
  assertEquals(peer.canUndo, false);
  assertEquals(peer.canRedo, true);

  // redo → changed
  peer.redo();
  assertEquals(peer.get("v"), ["b"]);
  assertEquals(peer.canUndo, true);
  assertEquals(peer.canRedo, false);

  // undo → original again
  peer.undo();
  assertEquals(peer.get("v"), ["a"]);
  assertEquals(peer.canUndo, false);
  assertEquals(peer.canRedo, true);

  // redo → changed again
  peer.redo();
  assertEquals(peer.get("v"), ["b"]);
  assertEquals(peer.canUndo, true);
  assertEquals(peer.canRedo, false);
});

Deno.test("undo: multiple structural edits undone in reverse order", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    data: "hello",
  });

  const original = peer.toPlain();

  // Step 1: wrapRecord
  peer.wrapRecord("data", "inner", "box");
  const afterWrap = peer.toPlain();
  assertEquals(afterWrap, {
    $tag: "root",
    data: { $tag: "box", inner: "hello" },
  });

  // Step 2: rename field inside the wrapper
  peer.rename("data", "inner", "content");
  const afterRename = peer.toPlain();
  assertEquals(afterRename, {
    $tag: "root",
    data: { $tag: "box", content: "hello" },
  });

  // Step 3: add a new field to the wrapper
  peer.add("data", "extra", "world");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    data: { $tag: "box", content: "hello", extra: "world" },
  });

  // Undo add
  peer.undo();
  assertEquals(peer.toPlain(), afterRename);

  // Undo rename
  peer.undo();
  assertEquals(peer.toPlain(), afterWrap);

  // Undo wrapRecord
  peer.undo();
  assertEquals(peer.toPlain(), original);
});

Deno.test("canUndo: remote events do not appear in undo stack", () => {
  const doc = { $tag: "root", v: "original" };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  assertEquals(alice.canUndo, false);

  // Bob makes an edit and syncs to Alice
  bob.set("v", "bob-changed");
  sync(alice, bob);

  // Alice received the remote event but has no local edits to undo
  assertEquals(alice.get("v"), ["bob-changed"]);
  assertEquals(alice.canUndo, false);
  assertThrows(() => alice.undo(), Error, "Nothing to undo.");
});
