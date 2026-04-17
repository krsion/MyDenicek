import { assertEquals, Denicek, sync } from "./test-helpers.ts";

// ---------------------------------------------------------------------------
// 1 · Basic copy undo
// ---------------------------------------------------------------------------

Deno.test("undo: copy restores original target value", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    source: "hello",
    target: "world",
  });

  const original = peer.toPlain();

  peer.copy("target", "source");
  assertEquals(peer.toPlain(), {
    $tag: "root",
    source: "hello",
    target: "hello",
  });

  peer.undo();
  assertEquals(peer.toPlain(), original);
});

Deno.test("undo: copy of complex subtree restores original", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    source: { $tag: "person", name: "Ada", age: 36 },
    target: { $tag: "person", name: "Grace", age: 85 },
  });

  const original = peer.toPlain();

  peer.copy("target", "source");
  assertEquals(peer.get("target/name"), ["Ada"]);

  peer.undo();
  assertEquals(peer.toPlain(), original);
});

// ---------------------------------------------------------------------------
// 2 · Wildcard copy undo
// ---------------------------------------------------------------------------

Deno.test("undo: wildcard copy restores all targets", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "list",
      $items: [
        { $tag: "item", name: "first", value: "a" },
        { $tag: "item", name: "second", value: "b" },
      ],
    },
    defaults: {
      $tag: "list",
      $items: [
        { $tag: "item", name: "default1", value: "d1" },
        { $tag: "item", name: "default2", value: "d2" },
      ],
    },
  });

  const original = peer.toPlain();

  peer.copy("items/*/name", "defaults/*/name");
  assertEquals(peer.get("items/0/name"), ["default1"]);
  assertEquals(peer.get("items/1/name"), ["default2"]);

  peer.undo();
  assertEquals(peer.toPlain(), original);
});

// ---------------------------------------------------------------------------
// 3 · Round-trip: copy → undo → redo → undo
// ---------------------------------------------------------------------------

Deno.test("undo/redo: copy round-trip restores original", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    source: "hello",
    target: "world",
  });

  const original = peer.toPlain();

  peer.copy("target", "source");
  const afterCopy = peer.toPlain();

  // undo → original
  peer.undo();
  assertEquals(peer.toPlain(), original);

  // redo → after copy
  peer.redo();
  assertEquals(peer.toPlain(), afterCopy);

  // undo again → original
  peer.undo();
  assertEquals(peer.toPlain(), original);
});

// ---------------------------------------------------------------------------
// 4 · Copy then undo via Denicek.undo()
// ---------------------------------------------------------------------------

Deno.test("undo: copy via Denicek facade undo works", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    a: 1,
    b: 2,
  });

  peer.copy("b", "a");
  assertEquals(peer.get("b"), [1]);
  assertEquals(peer.canUndo, true);

  peer.undo();
  assertEquals(peer.get("b"), [2]);
  assertEquals(peer.get("a"), [1]);
});

// ---------------------------------------------------------------------------
// 5 · Multi-peer copy undo convergence
// ---------------------------------------------------------------------------

Deno.test("multi-peer: alice copies, syncs, undoes, both converge", () => {
  const doc = {
    $tag: "root",
    source: "hello",
    target: "world",
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.copy("target", "source");
  sync(alice, bob);
  assertEquals(bob.get("target"), ["hello"]);

  alice.undo();
  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(alice.get("target"), ["world"]);
});
