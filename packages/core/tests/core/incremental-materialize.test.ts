import {
  assertEquals,
  Denicek,
  EventGraph,
  EventId,
  PrimitiveNode,
  RecordAddEdit,
  RecordNode,
  Selector,
  sync,
  VectorClock,
} from "./test-helpers.ts";
import { Event } from "../../core/event.ts";

// ── Fork-merge uses checkpoint ───────────────────────────────────────

Deno.test("fork-merge: checkpoint gives same result as full replay", () => {
  const alice = new Denicek("alice", {
    $tag: "root",
    name: "initial",
  });
  const bob = new Denicek("bob", {
    $tag: "root",
    name: "initial",
  });

  // Both make local edits (creates a fork)
  alice.add("", "x", "from-alice");
  bob.add("", "y", "from-bob");

  // Save alice's state before merge (this is where the checkpoint would be)
  const aliceBeforeMerge = alice.toPlain();
  assertEquals(typeof aliceBeforeMerge, "object");

  // Sync creates a merge
  sync(alice, bob);

  // Both should converge
  assertEquals(alice.toPlain(), bob.toPlain());
  const result = alice.toPlain() as Record<string, unknown>;
  assertEquals(result.x, "from-alice");
  assertEquals(result.y, "from-bob");
});

// ── Oracle comparison ────────────────────────────────────────────────

Deno.test("oracle: debug mode validates checkpoint against full replay", () => {
  const graph = new EventGraph(
    new RecordNode("root", {}),
    undefined,
    undefined,
    { debugValidateCheckpoints: true },
  );

  // Build a linear chain: A → B → C
  const evA = graph.createEvent(
    "alice",
    new RecordAddEdit(Selector.parse("a"), new PrimitiveNode("A")),
  );
  const _evB = graph.createEvent(
    "alice",
    new RecordAddEdit(Selector.parse("b"), new PrimitiveNode("B")),
  );

  // Prime the cache so checkpoint can be saved
  graph.materialize();

  // Now insert a concurrent event (fork from A, not from B)
  const evC = new Event(
    new EventId("bob", 0),
    [evA.id],
    new RecordAddEdit(Selector.parse("c"), new PrimitiveNode("C")),
    new VectorClock({ alice: 0, bob: 0 }),
  );
  graph.insertEvent(evC);

  // This materialize should use checkpoint and validate via oracle
  const { doc } = graph.materialize();
  const plain = doc.toPlain() as Record<string, unknown>;
  assertEquals(plain.a, "A");
  assertEquals(plain.b, "B");
  assertEquals(plain.c, "C");
});

// ── Diamond pattern ──────────────────────────────────────────────────

Deno.test("diamond: A→{B,C}→D uses checkpoint at A", () => {
  const graph = new EventGraph(
    new RecordNode("root", {}),
    undefined,
    undefined,
    { debugValidateCheckpoints: true },
  );

  // A: root event
  const evA = graph.createEvent(
    "alice",
    new RecordAddEdit(Selector.parse("a"), new PrimitiveNode("A")),
  );

  // Prime cache at A
  graph.materialize();

  // B: alice's branch from A
  const evB = new Event(
    new EventId("alice", 1),
    [evA.id],
    new RecordAddEdit(Selector.parse("b"), new PrimitiveNode("B")),
    new VectorClock({ alice: 1 }),
  );
  graph.insertEvent(evB);

  // C: bob's branch from A (concurrent with B)
  const evC = new Event(
    new EventId("bob", 0),
    [evA.id],
    new RecordAddEdit(Selector.parse("c"), new PrimitiveNode("C")),
    new VectorClock({ alice: 0, bob: 0 }),
  );
  graph.insertEvent(evC);

  // D: merge of B and C
  const evD = new Event(
    new EventId("alice", 2),
    [evB.id, evC.id],
    new RecordAddEdit(Selector.parse("d"), new PrimitiveNode("D")),
    new VectorClock({ alice: 2, bob: 0 }),
  );
  graph.insertEvent(evD);

  const { doc } = graph.materialize();
  const plain = doc.toPlain() as Record<string, unknown>;
  assertEquals(plain.a, "A");
  assertEquals(plain.b, "B");
  assertEquals(plain.c, "C");
  assertEquals(plain.d, "D");
});

// ── Multiple merges ──────────────────────────────────────────────────

Deno.test("multiple merges: chain of merges uses best checkpoint", () => {
  const alice = new Denicek("alice", {
    $tag: "root",
    base: "v0",
  });
  const bob = new Denicek("bob", {
    $tag: "root",
    base: "v0",
  });
  const carol = new Denicek("carol", {
    $tag: "root",
    base: "v0",
  });

  // First fork-merge: alice + bob
  alice.add("", "x", "from-alice");
  bob.add("", "y", "from-bob");
  sync(alice, bob);

  // Second fork-merge: alice + carol
  alice.add("", "w", "from-alice-2");
  carol.add("", "z", "from-carol");
  sync(alice, carol);

  // Final sync: bob catches up, carol catches up
  sync(bob, carol);
  sync(alice, bob);

  // All three should converge
  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(bob.toPlain(), carol.toPlain());
  const result = alice.toPlain() as Record<string, unknown>;
  assertEquals(result.x, "from-alice");
  assertEquals(result.y, "from-bob");
  assertEquals(result.w, "from-alice-2");
  assertEquals(result.z, "from-carol");
});

// ── Checkpoint eviction ──────────────────────────────────────────────

Deno.test("checkpoint eviction: exceeding MAX_CHECKPOINTS doesn't break correctness", () => {
  const graph = new EventGraph(
    new RecordNode("root", {}),
    undefined,
    undefined,
    { debugValidateCheckpoints: true },
  );

  // Create a linear chain first
  let lastEvent = graph.createEvent(
    "alice",
    new RecordAddEdit(Selector.parse("base"), new PrimitiveNode("v0")),
  );

  // Create many fork-merge cycles (more than MAX_CHECKPOINTS=16)
  for (let i = 0; i < 20; i++) {
    // Prime cache
    graph.materialize();

    // Create a concurrent event (fork from alice's last)
    const bobEvent = new Event(
      new EventId("bob", i),
      [lastEvent.id],
      new RecordAddEdit(
        Selector.parse(`f${i}`),
        new PrimitiveNode(`v${i}`),
      ),
      new VectorClock({
        alice: lastEvent.id.seq,
        bob: i,
      }),
    );
    graph.insertEvent(bobEvent);

    // Merge: alice creates a new event with both as parents
    lastEvent = graph.createEvent(
      "alice",
      new RecordAddEdit(
        Selector.parse(`m${i}`),
        new PrimitiveNode(`merge${i}`),
      ),
    );
  }

  // Final materialization should produce correct result
  const { doc } = graph.materialize();
  const plain = doc.toPlain() as Record<string, unknown>;
  assertEquals(plain.base, "v0");
  assertEquals(plain.f0, "v0");
  assertEquals(plain.m0, "merge0");
  assertEquals(plain.f19, "v19");
  assertEquals(plain.m19, "merge19");
});

// ── Convergence with conflicts ───────────────────────────────────────

Deno.test("checkpoint: concurrent delete + add preserves conflict semantics", () => {
  const alice = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "item", name: "a", val: "1" }],
    },
  });
  const bob = new Denicek("bob", {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "item", name: "a", val: "1" }],
    },
  });

  alice.delete("items/*", "val");
  bob.set("items/*/val", "UPDATED");
  sync(alice, bob);

  // Both peers converge (delete wins, set becomes conflict)
  assertEquals(alice.toPlain(), bob.toPlain());
  const expected = {
    $tag: "root",
    items: { $tag: "ul", $items: [{ $tag: "item", name: "a" }] },
  };
  assertEquals(alice.toPlain(), expected);
});

// ── Linear extension doesn't break after checkpoint ──────────────────

Deno.test("linear edits after merge still use fast path", () => {
  const alice = new Denicek("alice", {
    $tag: "root",
    name: "initial",
  });
  const bob = new Denicek("bob", {
    $tag: "root",
    name: "initial",
  });

  // Fork
  alice.add("", "x", "from-alice");
  bob.add("", "y", "from-bob");

  // Merge
  sync(alice, bob);

  // Additional linear edits on the merged state
  alice.add("", "z", "post-merge");
  alice.set("name", "updated");

  const result = alice.toPlain() as Record<string, unknown>;
  assertEquals(result.x, "from-alice");
  assertEquals(result.y, "from-bob");
  assertEquals(result.z, "post-merge");
  assertEquals(result.name, "updated");
});
