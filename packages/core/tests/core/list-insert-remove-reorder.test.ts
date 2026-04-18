import { assertEquals, assertThrows, Denicek, sync } from "./test-helpers.ts";

// ── Helpers ─────────────────────────────────────────────────────────

function makeListDoc() {
  return {
    $tag: "root",
    items: { $tag: "ul", $items: ["a", "b", "c"] },
  };
}

// ── Basic operations (single peer) ──────────────────────────────────

Deno.test("insert: inserts at beginning of list", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.insert("items", 0, "x");
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["x", "a", "b", "c"]);
});

Deno.test("insert: inserts at middle of list", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.insert("items", 1, "x");
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "x", "b", "c"]);
});

Deno.test("insert: inserts at end of list", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.insert("items", 3, "x");
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "b", "c", "x"]);
});

Deno.test("insert: throws on out-of-bounds index", () => {
  const dk = new Denicek("alice", makeListDoc());
  assertThrows(() => dk.insert("items", 5, "x"));
});

Deno.test("remove: removes first item", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.remove("items", 0);
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["b", "c"]);
});

Deno.test("remove: removes middle item", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.remove("items", 1);
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "c"]);
});

Deno.test("remove: removes last item", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.remove("items", 2);
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "b"]);
});

Deno.test("remove: throws on out-of-bounds index", () => {
  const dk = new Denicek("alice", makeListDoc());
  assertThrows(() => dk.remove("items", 3));
});

Deno.test("reorder: moves item forward", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.reorder("items", 0, 2);
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["b", "c", "a"]);
});

Deno.test("reorder: moves item backward", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.reorder("items", 2, 0);
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["c", "a", "b"]);
});

Deno.test("reorder: same index is a no-op", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.reorder("items", 1, 1);
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "b", "c"]);
});

// ── Undo/Redo ───────────────────────────────────────────────────────

Deno.test("undo insert restores original list", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.insert("items", 1, "x");
  dk.undo();
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "b", "c"]);
});

Deno.test("redo insert re-applies the insertion", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.insert("items", 1, "x");
  dk.undo();
  dk.redo();
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "x", "b", "c"]);
});

Deno.test("undo remove restores removed item", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.remove("items", 1);
  dk.undo();
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "b", "c"]);
});

Deno.test("redo remove re-applies the removal", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.remove("items", 1);
  dk.undo();
  dk.redo();
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "c"]);
});

Deno.test("undo reorder restores original order", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.reorder("items", 0, 2);
  dk.undo();
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "b", "c"]);
});

Deno.test("redo reorder re-applies the move", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.reorder("items", 0, 2);
  dk.undo();
  dk.redo();
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["b", "c", "a"]);
});

// ── Two-peer convergence: concurrent insert + insert ────────────

Deno.test("concurrent insert at same index: both items appear, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insert("items", 1, "X");
  bob.insert("items", 1, "Y");
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 5);
  // Both X and Y should be present
  assertEquals(items.includes("X"), true);
  assertEquals(items.includes("Y"), true);
});

Deno.test("concurrent insert at different indices: both items appear, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insert("items", 0, "X");
  bob.insert("items", 2, "Y");
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 5);
  assertEquals(items.includes("X"), true);
  assertEquals(items.includes("Y"), true);
});

// ── Two-peer convergence: concurrent insert + remove ────────────

Deno.test("concurrent insert + remove: both apply, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insert("items", 1, "X");
  bob.remove("items", 2);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.includes("X"), true);
  assertEquals(!items.includes("c"), true);
});

Deno.test("concurrent insert before remove index: both apply, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insert("items", 0, "X");
  bob.remove("items", 0);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 3); // inserted 1, removed 1
  assertEquals(items.includes("X"), true);
  assertEquals(!items.includes("a"), true); // "a" was at index 0, removed
});

// ── Two-peer convergence: concurrent remove + remove ────────────

Deno.test("concurrent remove same index: one becomes no-op, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.remove("items", 1);
  bob.remove("items", 1);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items, ["a", "c"]);
});

Deno.test("concurrent remove different indices: both apply, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.remove("items", 0);
  bob.remove("items", 2);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items, ["b"]);
});

// ── Two-peer convergence: concurrent reorder + insert ─────────────

Deno.test("concurrent reorder + insert: peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.reorder("items", 0, 2);
  bob.insert("items", 1, "X");
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 4);
  assertEquals(items.includes("X"), true);
});

// ── Two-peer convergence: concurrent reorder + remove ─────────────

Deno.test("concurrent reorder + remove of different item: peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.reorder("items", 0, 2);
  bob.remove("items", 1);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 2);
});

Deno.test("concurrent reorder + remove of reordered item: peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.reorder("items", 0, 2);
  bob.remove("items", 0);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 2);
});

// ── Cross-edit: concurrent insert(strict) + remove ──────────────────

Deno.test("concurrent insert(strict) + remove: peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insert("items", 0, "X", true);
  bob.remove("items", 1);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 3); // pushed 1, removed 1
  assertEquals(items.includes("X"), true);
  assertEquals(!items.includes("b"), true);
});

// ── Cross-edit: concurrent insert + remove(strict) ──────────────────────

Deno.test("concurrent insert + remove(strict): peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insert("items", 2, "X");
  bob.remove("items", 0, true);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 3); // inserted 1, popped 1
  assertEquals(items.includes("X"), true);
  assertEquals(!items.includes("a"), true);
});

// ── Remote codec round-trip ─────────────────────────────────────────

Deno.test("insert survives remote round-trip", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insert("items", 1, "X");
  // Sync via the remote event codec path
  for (const event of alice.eventsSince(bob.frontiers)) {
    bob.applyRemote(event);
  }
  assertEquals(alice.materialize(), bob.materialize());
});

Deno.test("remove survives remote round-trip", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.remove("items", 1);
  for (const event of alice.eventsSince(bob.frontiers)) {
    bob.applyRemote(event);
  }
  assertEquals(alice.materialize(), bob.materialize());
});

Deno.test("reorder survives remote round-trip", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.reorder("items", 0, 2);
  for (const event of alice.eventsSince(bob.frontiers)) {
    bob.applyRemote(event);
  }
  assertEquals(alice.materialize(), bob.materialize());
});

// ── Selector transformation ─────────────────────────────────────────

Deno.test("insert: set targeting shifted index is properly adjusted", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  // Alice inserts at 0, which shifts everything up
  alice.insert("items", 0, "X");
  // Bob sets the value at index 1 (originally "b")
  bob.set("items/1", "B!");
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  // "b" was at index 1, should still be "B!" after shift
  assertEquals(items.includes("B!"), true);
});

Deno.test("remove: set targeting removed index becomes conflict", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.remove("items", 1);
  bob.set("items/1", "B!");
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  // "b" was removed, so the edit targeting index 1 should become a no-op
  assertEquals(items.length, 2);
  assertEquals(items, ["a", "c"]);
});
