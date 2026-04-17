import { assertEquals, Denicek, syncMesh } from "./test-helpers.ts";

// Determinism guard: the materialized document must depend only on the
// *set* of events and their DAG structure, not on the iteration order of
// any internal Map or Record used to index them.
//
// This is a regression test for the concern that `Object.entries(...)` or
// `Map` iteration order implicitly leaks batch-arrival order into the
// canonical topological replay. If two peers end up with the same events
// but have indexed them via different insertion orders, they must still
// converge to the same serialized state.

Deno.test("materialize output is independent of the order in which peers learned about events", () => {
  const initial = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "item", name: "a", val: "1" },
        { $tag: "item", name: "b", val: "2" },
        { $tag: "item", name: "c", val: "3" },
      ],
    },
  };

  // Peer A sees events in one order: alice edits, then bob edits, then carol.
  const aliceA = new Denicek("alice", initial);
  const bobA = new Denicek("bob", initial);
  const carolA = new Denicek("carol", initial);
  aliceA.rename("items/*", "name", "title");
  bobA.set("items/*/val", "X");
  carolA.wrapRecord("items/0", "item", "outer");
  syncMesh([aliceA, bobA, carolA]);

  // Peer B sees the same events but in a different arrival order: carol, alice, bob.
  const aliceB = new Denicek("alice", initial);
  const bobB = new Denicek("bob", initial);
  const carolB = new Denicek("carol", initial);
  carolB.wrapRecord("items/0", "item", "outer");
  aliceB.rename("items/*", "name", "title");
  bobB.set("items/*/val", "X");
  syncMesh([carolB, aliceB, bobB]);

  const stateA = JSON.stringify(aliceA.toPlain());
  const stateB = JSON.stringify(aliceB.toPlain());
  assertEquals(stateA, stateB);
  assertEquals(JSON.stringify(bobA.toPlain()), stateA);
  assertEquals(JSON.stringify(carolA.toPlain()), stateA);
  assertEquals(JSON.stringify(bobB.toPlain()), stateB);
  assertEquals(JSON.stringify(carolB.toPlain()), stateB);
});

Deno.test("materialize is stable across repeated calls on the same graph", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "item", name: "a", val: "1" },
        { $tag: "item", name: "b", val: "2" },
      ],
    },
  });
  peer.rename("items/*", "name", "title");
  peer.set("items/*/val", "updated");
  peer.wrapRecord("items/0", "item", "outer");

  const first = JSON.stringify(peer.toPlain());
  for (let i = 0; i < 10; i++) {
    assertEquals(JSON.stringify(peer.toPlain()), first);
  }
});
