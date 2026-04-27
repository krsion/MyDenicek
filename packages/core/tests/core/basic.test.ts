import {
  assertEquals,
  assertThrows,
  Denicek,
  encodeRemoteEvent,
  Event,
  EventId,
  materializedConflicts,
  RecordDeleteEdit,
  Selector,
  sync,
  VectorClock,
} from "./test-helpers.ts";

Deno.test("Concurrent add of record -> convergent LWW", () => {
  const alice = new Denicek("alice");
  const bob = new Denicek("bob");

  alice.add("", "title", "From Alice");
  bob.add("", "title", "From Bob");

  sync(alice, bob);

  // Both peers converge to the same value (winner determined by hash tiebreak)
  assertEquals(alice.toPlain(), bob.toPlain());
  const result = alice.toPlain() as Record<string, unknown>;
  assertEquals(result.$tag, "root");
  assertEquals(typeof result.title, "string");
});

Deno.test("updates absolute references on structural rename", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    person: { $tag: "person", name: "Ada Lovelace" },
    focus: { $ref: "/person/name" },
  });

  core.rename("person", "name", "fullName");

  assertEquals(core.toPlain(), {
    $tag: "root",
    person: { $tag: "person", fullName: "Ada Lovelace" },
    focus: { $ref: "/person/fullName" },
  });
});

Deno.test("rejects deletes that would remove a referenced subtree", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    person: { $tag: "person", name: "Ada Lovelace" },
    focus: { $ref: "/person/name" },
  });

  assertThrows(
    () => core.delete("", "person"),
    Error,
    "cannot remove 'person'",
  );
  assertEquals(core.toPlain(), {
    $tag: "root",
    person: { $tag: "person", name: "Ada Lovelace" },
    focus: { $ref: "/person/name" },
  });
});

Deno.test("rejects list pops that would remove referenced items", () => {
  const front = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "item", name: "a" }, { $tag: "item", name: "b" }],
    },
    focus: { $ref: "/items/0/name" },
  });
  const back = new Denicek("bob", {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "item", name: "a" }, { $tag: "item", name: "b" }],
    },
    focus: { $ref: "/items/1/name" },
  });

  assertThrows(
    () => front.remove("items", 0, true),
    Error,
    "cannot remove 'items/0'",
  );
  assertThrows(
    () => back.remove("items", -1, true),
    Error,
    "cannot remove 'items/1'",
  );
});

Deno.test("remote delete of referenced node is accepted and resolved at materialize", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    person: { $tag: "person", name: "Ada Lovelace" },
    focus: { $ref: "/person/name" },
  });
  const remoteDelete = new Event(
    new EventId("bob", 1),
    [],
    new RecordDeleteEdit(Selector.parse("person")),
    new VectorClock({ bob: 1 }),
  );

  // Remote events are accepted without edit validation (we trust peers).
  // The conflict is resolved during materialization.
  core.applyRemote(encodeRemoteEvent(remoteDelete));
  assertEquals(core.eventsSince([]).length, 1);
});

Deno.test("ingests concurrent delete of a newly referenced node and no-ops the delete", () => {
  const doc = {
    $tag: "root",
    person: { $tag: "person", name: "Ada Lovelace" },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.add("", "focus", { $ref: "/person/name" });
  bob.delete("", "person");
  sync(alice, bob);

  const expected = {
    $tag: "root",
    person: { $tag: "person", name: "Ada Lovelace" },
    focus: { $ref: "/person/name" },
  };
  const expectedConflicts = [{
    $tag: "conflict",
    kind: "NoOpEdit",
    target: "person",
    data:
      "Concurrent replay left 'person' protected before RecordDeleteEdit could replay.",
  }];
  const expectedEventIds = ["alice:0", "bob:0"];

  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
  assertEquals(materializedConflicts(alice), expectedConflicts);
  assertEquals(materializedConflicts(bob), expectedConflicts);
  assertEquals(
    alice.inspectEvents().map((event) => event.id).sort(),
    expectedEventIds,
  );
  assertEquals(
    bob.inspectEvents().map((event) => event.id).sort(),
    expectedEventIds,
  );
});

Deno.test("ingests concurrent reference creation and no-ops it when the delete replays first", () => {
  const doc = {
    $tag: "root",
    person: { $tag: "person", name: "Ada Lovelace" },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.delete("", "person");
  bob.add("", "focus", { $ref: "/person/name" });
  sync(alice, bob);

  const expected = { $tag: "root" };
  const expectedConflicts = [{
    $tag: "conflict",
    kind: "NoOpEdit",
    target: "focus",
    data:
      "Concurrent replay left 'focus' referencing a missing target before RecordAddEdit could replay.",
  }];
  const expectedEventIds = ["alice:0", "bob:0"];

  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
  assertEquals(materializedConflicts(alice), expectedConflicts);
  assertEquals(materializedConflicts(bob), expectedConflicts);
  assertEquals(
    alice.inspectEvents().map((event) => event.id).sort(),
    expectedEventIds,
  );
  assertEquals(
    bob.inspectEvents().map((event) => event.id).sort(),
    expectedEventIds,
  );
});

Deno.test("keeps concurrent list push-backs from both peers", () => {
  const doc = { $tag: "root", items: { $tag: "ul", $items: [] as string[] } };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.insert("items", -1, "A", true);
  bob.insert("items", -1, "B", true);

  sync(alice, bob);

  // Both items present, order determined by hash tiebreak
  assertEquals(alice.toPlain(), bob.toPlain());
  const items = ((alice.toPlain() as Record<string, unknown>).items as Record<
    string,
    unknown
  >).$items as string[];
  assertEquals(items.sort(), ["A", "B"]);
});

Deno.test("list-pop-front removes first item", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: ["a", "b", "c"] },
  });

  core.remove("items", 0, true);

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: { $tag: "ul", $items: ["b", "c"] },
  });
});

Deno.test("list-pop-back removes last item", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: ["a", "b", "c"] },
  });

  core.remove("items", -1, true);

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: { $tag: "ul", $items: ["a", "b"] },
  });
});

Deno.test("list-push-front inserts at start", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: ["a", "b", "c"] },
  });

  core.insert("items", 0, "z", true);

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: { $tag: "ul", $items: ["z", "a", "b", "c"] },
  });
});
