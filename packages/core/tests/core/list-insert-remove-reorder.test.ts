import { assertEquals, assertThrows, Denicek, sync } from "./test-helpers.ts";

// ── Helpers ─────────────────────────────────────────────────────────

function makeListDoc() {
  return {
    $tag: "root",
    items: { $tag: "ul", $items: ["a", "b", "c"] },
  };
}

// ── Basic operations (single peer) ──────────────────────────────────

Deno.test("insertAt: inserts at beginning of list", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.insertAt("items", 0, "x");
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["x", "a", "b", "c"]);
});

Deno.test("insertAt: inserts at middle of list", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.insertAt("items", 1, "x");
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "x", "b", "c"]);
});

Deno.test("insertAt: inserts at end of list", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.insertAt("items", 3, "x");
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "b", "c", "x"]);
});

Deno.test("insertAt: throws on out-of-bounds index", () => {
  const dk = new Denicek("alice", makeListDoc());
  assertThrows(() => dk.insertAt("items", 5, "x"));
});

Deno.test("removeAt: removes first item", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.removeAt("items", 0);
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["b", "c"]);
});

Deno.test("removeAt: removes middle item", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.removeAt("items", 1);
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "c"]);
});

Deno.test("removeAt: removes last item", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.removeAt("items", 2);
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "b"]);
});

Deno.test("removeAt: throws on out-of-bounds index", () => {
  const dk = new Denicek("alice", makeListDoc());
  assertThrows(() => dk.removeAt("items", 3));
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

Deno.test("undo insertAt restores original list", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.insertAt("items", 1, "x");
  dk.undo();
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "b", "c"]);
});

Deno.test("redo insertAt re-applies the insertion", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.insertAt("items", 1, "x");
  dk.undo();
  dk.redo();
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "x", "b", "c"]);
});

Deno.test("undo removeAt restores removed item", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.removeAt("items", 1);
  dk.undo();
  const doc = dk.materialize() as Record<string, unknown>;
  const items = doc.items as { $items: string[] };
  assertEquals(items.$items, ["a", "b", "c"]);
});

Deno.test("redo removeAt re-applies the removal", () => {
  const dk = new Denicek("alice", makeListDoc());
  dk.removeAt("items", 1);
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

// ── Two-peer convergence: concurrent insertAt + insertAt ────────────

Deno.test("concurrent insertAt at same index: both items appear, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insertAt("items", 1, "X");
  bob.insertAt("items", 1, "Y");
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 5);
  // Both X and Y should be present
  assertEquals(items.includes("X"), true);
  assertEquals(items.includes("Y"), true);
});

Deno.test("concurrent insertAt at different indices: both items appear, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insertAt("items", 0, "X");
  bob.insertAt("items", 2, "Y");
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 5);
  assertEquals(items.includes("X"), true);
  assertEquals(items.includes("Y"), true);
});

// ── Two-peer convergence: concurrent insertAt + removeAt ────────────

Deno.test("concurrent insertAt + removeAt: both apply, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insertAt("items", 1, "X");
  bob.removeAt("items", 2);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.includes("X"), true);
  assertEquals(!items.includes("c"), true);
});

Deno.test("concurrent insertAt before removeAt index: both apply, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insertAt("items", 0, "X");
  bob.removeAt("items", 0);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 3); // inserted 1, removed 1
  assertEquals(items.includes("X"), true);
  assertEquals(!items.includes("a"), true); // "a" was at index 0, removed
});

// ── Two-peer convergence: concurrent removeAt + removeAt ────────────

Deno.test("concurrent removeAt same index: one becomes no-op, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.removeAt("items", 1);
  bob.removeAt("items", 1);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items, ["a", "c"]);
});

Deno.test("concurrent removeAt different indices: both apply, peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.removeAt("items", 0);
  bob.removeAt("items", 2);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items, ["b"]);
});

// ── Two-peer convergence: concurrent reorder + insertAt ─────────────

Deno.test("concurrent reorder + insertAt: peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.reorder("items", 0, 2);
  bob.insertAt("items", 1, "X");
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 4);
  assertEquals(items.includes("X"), true);
});

// ── Two-peer convergence: concurrent reorder + removeAt ─────────────

Deno.test("concurrent reorder + removeAt of different item: peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.reorder("items", 0, 2);
  bob.removeAt("items", 1);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 2);
});

Deno.test("concurrent reorder + removeAt of reordered item: peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.reorder("items", 0, 2);
  bob.removeAt("items", 0);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 2);
});

// ── Cross-edit: concurrent pushFront + removeAt ─────────────────────

Deno.test("concurrent pushFront + removeAt: peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.pushFront("items", "X");
  bob.removeAt("items", 1);
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 3); // pushed 1, removed 1
  assertEquals(items.includes("X"), true);
  assertEquals(!items.includes("b"), true);
});

// ── Cross-edit: concurrent insertAt + popFront ──────────────────────

Deno.test("concurrent insertAt + popFront: peers converge", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insertAt("items", 2, "X");
  bob.popFront("items");
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  assertEquals(items.length, 3); // inserted 1, popped 1
  assertEquals(items.includes("X"), true);
  assertEquals(!items.includes("a"), true);
});

// ── Remote codec round-trip ─────────────────────────────────────────

Deno.test("insertAt survives remote round-trip", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.insertAt("items", 1, "X");
  // Sync via the remote event codec path
  for (const event of alice.eventsSince(bob.frontiers)) {
    bob.applyRemote(event);
  }
  assertEquals(alice.materialize(), bob.materialize());
});

Deno.test("removeAt survives remote round-trip", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.removeAt("items", 1);
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

Deno.test("insertAt: set targeting shifted index is properly adjusted", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  // Alice inserts at 0, which shifts everything up
  alice.insertAt("items", 0, "X");
  // Bob sets the value at index 1 (originally "b")
  bob.set("items/1", "B!");
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  // "b" was at index 1, should still be "B!" after shift
  assertEquals(items.includes("B!"), true);
});

Deno.test("removeAt: set targeting removed index becomes conflict", () => {
  const alice = new Denicek("alice", makeListDoc());
  const bob = new Denicek("bob", makeListDoc());
  alice.removeAt("items", 1);
  bob.set("items/1", "B!");
  sync(alice, bob);
  assertEquals(alice.materialize(), bob.materialize());
  const doc = alice.materialize() as Record<string, unknown>;
  const items = (doc.items as { $items: string[] }).$items;
  // "b" was removed, so the edit targeting index 1 should become a no-op
  assertEquals(items.length, 2);
  assertEquals(items, ["a", "c"]);
});
