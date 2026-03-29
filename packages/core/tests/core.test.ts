import { assertEquals, assertThrows } from "@std/assert";
import { Denicek, registerPrimitiveEdit } from "../mod.ts";
import { Edit, RecordAddEdit, RecordDeleteEdit } from "../core/edits.ts";
import { Event } from "../core/event.ts";
import { EventGraph } from "../core/event-graph.ts";
import { EventId } from "../core/event-id.ts";
import { Node, PrimitiveNode, RecordNode } from "../core/nodes.ts";
import { Selector } from "../core/selector.ts";
import { VectorClock } from "../core/vector-clock.ts";

/** Exchange events between two peers so both converge (frontier-based). */
function sync(a: Denicek, b: Denicek): void {
  const aFrontiers = a.frontiers;
  const bFrontiers = b.frontiers;
  for (const e of a.eventsSince(bFrontiers)) b.applyRemote(e);
  for (const e of b.eventsSince(aFrontiers)) a.applyRemote(e);
}

function materializedConflicts(peer: Denicek): unknown[] {
  peer.materialize();
  return peer.conflicts;
}

function createRecordAddEvent(
  peer: string,
  seq: number,
  parentSeqs: number[],
  field: string,
): Event {
  return new Event(
    new EventId(peer, seq),
    parentSeqs.map((parentSeq) => new EventId(peer, parentSeq)),
    new RecordAddEdit(Selector.parse(field), new PrimitiveNode(field)),
    new VectorClock({ [peer]: seq }),
  );
}

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

  assertThrows(() => front.popFront("items"), Error, "cannot remove 'items/0'");
  assertThrows(() => back.popBack("items"), Error, "cannot remove 'items/1'");
});

Deno.test("rejects remote delete events that would remove referenced nodes", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    person: { $tag: "person", name: "Ada Lovelace" },
    focus: { $ref: "/person/name" },
  });
  const invalidDelete = new Event(
    new EventId("bob", 1),
    [],
    new RecordDeleteEdit(Selector.parse("person")),
    new VectorClock({ bob: 1 }),
  );

  assertThrows(
    () => core.applyRemote(invalidDelete),
    Error,
    "cannot remove 'person'",
  );
  assertEquals(core.eventsSince([]), []);
  assertEquals(core.toPlain(), {
    $tag: "root",
    person: { $tag: "person", name: "Ada Lovelace" },
    focus: { $ref: "/person/name" },
  });
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

  alice.pushBack("items", "A");
  bob.pushBack("items", "B");

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

  core.popFront("items");

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

  core.popBack("items");

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

  core.pushFront("items", "z");

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: { $tag: "ul", $items: ["z", "a", "b", "c"] },
  });
});

// ── Selector transform tests ────────────────────────────────────────

Deno.test("transforms selector after concurrent rename", () => {
  const doc = { $tag: "root", person: { $tag: "person", name: "Ada" } };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.rename("person", "name", "fullName");
  bob.set("person/name", "UPDATED");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    person: { $tag: "person", fullName: "UPDATED" },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("transforms selector after concurrent wrap-record", () => {
  const doc = {
    $tag: "root",
    person: { $tag: "person", name: "Ada" },
    focus: { $ref: "/person/name" },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.wrapRecord("person", "inner", "wrapper");
  bob.set("person/name", "UPDATED");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    person: { $tag: "wrapper", inner: { $tag: "person", name: "UPDATED" } },
    focus: { $ref: "/person/inner/name" },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("transforms selector after concurrent wrap-list", () => {
  const doc = {
    $tag: "root",
    person: { $tag: "person", name: "Ada" },
    focus: { $ref: "/person/name" },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.wrapList("person", "people");
  bob.set("person/name", "UPDATED");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    person: { $tag: "people", $items: [{ $tag: "person", name: "UPDATED" }] },
    focus: { $ref: "/person/*/name" },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("updates absolute references with wildcard when wrapping wildcard targets in a list", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "task", name: "Ada" },
        { $tag: "task", name: "Grace" },
      ],
    },
    focus: { $ref: "/items/0/name" },
  });

  core.wrapList("items/*", "wrapped");

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "wrapped", $items: [{ $tag: "task", name: "Ada" }] },
        { $tag: "wrapped", $items: [{ $tag: "task", name: "Grace" }] },
      ],
    },
    focus: { $ref: "/items/0/*/name" },
  });
});

Deno.test("updates relative references with wildcard when wrapping wildcard targets in a list", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "task", name: "Ada" },
        { $tag: "task", name: "Grace" },
      ],
    },
    focus: { $ref: "../items/0/name" },
  });

  core.wrapList("items/*", "wrapped");

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "wrapped", $items: [{ $tag: "task", name: "Ada" }] },
        { $tag: "wrapped", $items: [{ $tag: "task", name: "Grace" }] },
      ],
    },
    focus: { $ref: "../items/0/*/name" },
  });
});

Deno.test("adds parent segment when wrapping a relative reference node in a record", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [{ $tag: "task", name: "Ada" }],
    },
    focus: { $ref: "../items/0/name" },
  });

  core.wrapRecord("focus", "inner", "wrapper");

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [{ $tag: "task", name: "Ada" }],
    },
    focus: {
      $tag: "wrapper",
      inner: { $ref: "../../items/0/name" },
    },
  });
});

Deno.test("adds parent segment when wrapping a relative reference node in a list", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [{ $tag: "task", name: "Ada" }],
    },
    focus: { $ref: "../items/0/name" },
  });

  core.wrapList("focus", "wrapper");

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [{ $tag: "task", name: "Ada" }],
    },
    focus: {
      $tag: "wrapper",
      $items: [{ $ref: "../../items/0/name" }],
    },
  });
});

Deno.test("wildcard edit affects concurrently inserted item", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: [{ $tag: "task", status: "todo" }] },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.set("items/*/status", "done");
  bob.pushBack("items", { $tag: "task", status: "todo" });

  sync(alice, bob);

  const expected = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "task", status: "done" },
        { $tag: "task", status: "done" },
      ],
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

// ── Edit coverage tests ─────────────────────────────────────────────

Deno.test("copy replaces target with source", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    source: "hello",
    target: "world",
  });

  core.copy("target", "source");

  assertEquals(core.toPlain(), {
    $tag: "root",
    source: "hello",
    target: "hello",
  });
});

Deno.test("concurrent source edit is mirrored onto the copied node", () => {
  const doc = {
    $tag: "root",
    data: {
      $tag: "data",
      source: { $tag: "person", name: "Ada" },
      target: { $tag: "person", name: "Grace" },
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.copy("data/target", "data/source");
  bob.set("data/source/name", "Updated");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    data: {
      $tag: "data",
      source: { $tag: "person", name: "Updated" },
      target: { $tag: "person", name: "Updated" },
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("concurrent structural source edit is mirrored onto the copied node", () => {
  const doc = {
    $tag: "root",
    data: {
      $tag: "data",
      source: { $tag: "person", name: "Ada" },
      target: { $tag: "person", name: "Grace" },
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.copy("data/target", "data/source");
  bob.rename("data/source", "name", "fullName");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    data: {
      $tag: "data",
      source: { $tag: "person", fullName: "Ada" },
      target: { $tag: "person", fullName: "Ada" },
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("concurrent edit to list-copy source item is mirrored onto copied list item", () => {
  const doc = {
    $tag: "root",
    scratch: {
      $tag: "scratch",
      $items: [
        { $tag: "task", title: "draft" },
        { $tag: "task", title: "queued" },
      ],
    },
    items: {
      $tag: "items",
      $items: [{ $tag: "task", title: "stale" }],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.copy("items", "scratch/*");
  bob.set("scratch/1/title", "published");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    scratch: {
      $tag: "scratch",
      $items: [
        { $tag: "task", title: "draft" },
        { $tag: "task", title: "published" },
      ],
    },
    items: {
      $tag: "items",
      $items: [
        { $tag: "task", title: "draft" },
        { $tag: "task", title: "published" },
      ],
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("concurrent wildcard wrap on copy destination wraps copied list items", () => {
  const doc = {
    $tag: "root",
    scratch: {
      $tag: "scratch",
      $items: [
        { $tag: "task", title: "draft" },
        { $tag: "task", title: "queued" },
      ],
    },
    items: {
      $tag: "items",
      $items: [{ $tag: "task", title: "stale" }],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.copy("items", "scratch/*");
  bob.wrapList("items/*", "wrapped");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    scratch: {
      $tag: "scratch",
      $items: [
        { $tag: "task", title: "draft" },
        { $tag: "task", title: "queued" },
      ],
    },
    items: {
      $tag: "items",
      $items: [
        { $tag: "wrapped", $items: [{ $tag: "task", title: "draft" }] },
        { $tag: "wrapped", $items: [{ $tag: "task", title: "queued" }] },
      ],
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("same-list wildcard copy replays before concurrent wildcard wrap", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [{
        $tag: "project",
        subtasks: {
          $tag: "subtasks",
          $items: [
            { $tag: "task", title: "draft" },
            { $tag: "task", title: "queued" },
          ],
        },
      }],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.copy("items", "items/0/subtasks/*");
  bob.wrapList("items/*", "wrapped");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "wrapped", $items: [{ $tag: "task", title: "draft" }] },
        { $tag: "wrapped", $items: [{ $tag: "task", title: "queued" }] },
      ],
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("update-tag changes tag on record", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    item: { $tag: "div", name: "test" },
  });

  core.updateTag("item", "span");

  assertEquals(core.toPlain(), {
    $tag: "root",
    item: { $tag: "span", name: "test" },
  });
});

Deno.test("update-tag changes tag on list", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: ["a"] },
  });

  core.updateTag("items", "ol");

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: { $tag: "ol", $items: ["a"] },
  });
});

// ── Error path tests────────────────────────────────────────────────

Deno.test("applyRemote rejects conflicting payload", () => {
  const alice = new Denicek("alice");
  alice.add("", "x", "a");
  const [event] = alice.drain();
  // Same id but different edit content
  const conflicting = new Event(
    event.id,
    event.parents,
    new RecordAddEdit(Selector.parse("y"), new PrimitiveNode("b")),
    event.clock,
  );
  assertThrows(
    () => alice.applyRemote(conflicting),
    Error,
    "Conflicting payload",
  );
});

Deno.test("toPlain preserves reference objects", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    focus: { $ref: "/person/name" },
  });

  assertEquals(core.toPlain(), {
    $tag: "root",
    focus: { $ref: "/person/name" },
  });
});

Deno.test("rejects reserved field names in initial plain records", () => {
  assertThrows(
    () => new Denicek("alice", { $tag: "root", "*": "nope" }),
    Error,
    "reserved by selector syntax",
  );
});

Deno.test("rejects reserved field names in local add", () => {
  const core = new Denicek("alice");

  assertThrows(
    () => core.add("", "*", "value"),
    Error,
    "reserved by selector syntax",
  );
});

Deno.test("allows negative-looking field names", () => {
  const core = new Denicek("alice");

  core.add("", "-1", "value");

  assertEquals(core.toPlain(), {
    $tag: "root",
    "-1": "value",
  });
});

Deno.test("rejects local add that would overwrite an existing field", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    title: "Original",
  });

  assertThrows(
    () => core.add("", "title", "Replacement"),
    Error,
    "already exists",
  );
});

Deno.test("rejects local rename that would overwrite an existing field", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    first: "Ada",
    second: "Lovelace",
  });

  assertThrows(
    () => core.rename("", "first", "second"),
    Error,
    "already exists",
  );
});

Deno.test("compact requires the current acknowledged frontiers", () => {
  const core = new Denicek("alice");
  core.add("", "title", "Ada");

  assertThrows(
    () => core.compact([]),
    Error,
    "stale frontiers",
  );

  core.compact(core.frontiers);
  assertEquals(core.toPlain(), {
    $tag: "root",
    title: "Ada",
  });
  assertEquals(core.frontiers, []);
});

Deno.test("ingestEvents rejects conflicting duplicate payload against buffered event", () => {
  const graph = new EventGraph(new RecordNode("root", {}));
  const original = new Event(
    new EventId("alice", 0),
    [new EventId("missing", 0)],
    new RecordAddEdit(Selector.parse("x"), new PrimitiveNode("a")),
    new VectorClock({ alice: 0 }),
  );
  const conflicting = new Event(
    new EventId("alice", 0),
    [new EventId("missing", 0)],
    new RecordAddEdit(Selector.parse("y"), new PrimitiveNode("b")),
    new VectorClock({ alice: 0 }),
  );

  graph.ingestEvents([original]);
  assertThrows(
    () => graph.ingestEvents([conflicting]),
    Error,
    "Conflicting payload",
  );
});

Deno.test("applyRemote buffers out-of-order events", () => {
  const alice = new Denicek("alice");
  const bob = new Denicek("bob");

  bob.add("", "x", "first");
  bob.add("", "y", "second");
  const events = bob.drain();

  // Apply in reverse order — second event arrives before first
  alice.applyRemote(events[1]!);
  // Second event is buffered (parent not yet seen)
  assertEquals(alice.toPlain(), { $tag: "root" });

  alice.applyRemote(events[0]!);
  // Now both events flush in causal order
  assertEquals(alice.toPlain(), bob.toPlain());
});

Deno.test("ingestEvents flushes a buffered dependency chain when the missing ancestor arrives", () => {
  const graph = new EventGraph(new RecordNode("root", {}));
  const rootEvent = createRecordAddEvent("alice", 0, [], "rootValue");
  const parentEvent = createRecordAddEvent("alice", 1, [0], "parentValue");
  const childEvent = createRecordAddEvent("alice", 2, [1], "childValue");

  assertEquals(graph.ingestEvents([childEvent]), [childEvent]);
  assertEquals(graph.ingestEvents([parentEvent]), [childEvent, parentEvent]);
  assertEquals(graph.ingestEvents([rootEvent]), []);

  assertEquals(graph.hasEvent(rootEvent.id.format()), true);
  assertEquals(graph.hasEvent(parentEvent.id.format()), true);
  assertEquals(graph.hasEvent(childEvent.id.format()), true);
  assertEquals(graph.materialize().doc.toPlain(), {
    $tag: "root",
    rootValue: "rootValue",
    parentValue: "parentValue",
    childValue: "childValue",
  });
});

Deno.test("ingestEvents keeps children blocked until buffered parents are inserted", () => {
  const graph = new EventGraph(new RecordNode("root", {}));
  const rootEvent = createRecordAddEvent("alice", 0, [], "rootValue");
  const parentEvent = createRecordAddEvent("alice", 1, [0], "parentValue");
  const childEvent = createRecordAddEvent("alice", 2, [1], "childValue");

  assertEquals(graph.ingestEvents([parentEvent]), [parentEvent]);
  assertEquals(graph.ingestEvents([rootEvent, childEvent]), []);

  assertEquals(graph.hasEvent(rootEvent.id.format()), true);
  assertEquals(graph.hasEvent(parentEvent.id.format()), true);
  assertEquals(graph.hasEvent(childEvent.id.format()), true);
  assertEquals(graph.materialize().doc.toPlain(), {
    $tag: "root",
    rootValue: "rootValue",
    parentValue: "parentValue",
    childValue: "childValue",
  });
});

Deno.test("commit throws on edit targeting non-existent path", () => {
  const core = new Denicek("alice");
  assertThrows(
    () => core.add("nonexistent", "x", "a"),
    Error,
    "No nodes match selector",
  );
});

Deno.test("commit throws on kind mismatch", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: [] as string[] },
  });
  assertThrows(
    () => core.add("items", "x", "a"),
    Error,
    "expected record, found 'ListNode'",
  );
});

Deno.test("fromPlain rejects null", () => {
  assertThrows(
    () => Node.fromPlain(JSON.parse("null")),
    Error,
    "Null is not a valid PlainNode.",
  );
});

Deno.test("applies registered primitive edit locally", () => {
  registerPrimitiveEdit("test-capitalize-local", (value) => {
    if (typeof value !== "string") {
      throw new Error("test-capitalize-local expects a string.");
    }
    return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`;
  });

  const core = new Denicek("alice", {
    $tag: "root",
    name: "bob",
  });

  core.applyPrimitiveEdit("name", "test-capitalize-local");

  assertEquals(core.toPlain(), {
    $tag: "root",
    name: "Bob",
  });
});

Deno.test("throws when registering a primitive edit with an empty name", () => {
  assertThrows(
    () => registerPrimitiveEdit("   ", (value) => value),
    Error,
    "must not be empty",
  );
});

Deno.test("get returns all matched plain nodes without materializing the whole document in caller code", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: ["first", "second"] },
  });

  assertEquals(core.get("items/0"), ["first"]);
  assertEquals(core.get("items/1"), ["second"]);
  assertEquals(core.get("items/2"), []);
  assertEquals(core.get("items/*"), ["first", "second"]);
});

Deno.test("replays registered primitive edit against a different primitive value", () => {
  Denicek.registerPrimitiveEdit("test-capitalize-remote", (value) => {
    if (typeof value !== "string") {
      throw new Error("test-capitalize-remote expects a string.");
    }
    return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`;
  });

  const source = new Denicek("source", {
    $tag: "root",
    name: "bob",
  });
  const target = new Denicek("target", {
    $tag: "root",
    name: "alice",
  });

  source.applyPrimitiveEdit("name", "test-capitalize-remote");
  const [event] = source.drain();
  target.applyRemote(event);

  assertEquals(target.toPlain(), {
    $tag: "root",
    name: "Alice",
  });
});

Deno.test("replays a primitive edit selected by event id onto another target", () => {
  Denicek.registerPrimitiveEdit("test-capitalize-from-event", (value) => {
    if (typeof value !== "string") {
      throw new Error("test-capitalize-from-event expects a string.");
    }
    return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`;
  });

  const source = new Denicek("source", {
    $tag: "root",
    items: { $tag: "ul", $items: ["aLPHA", "bRAVO", "cHARLIE"] },
  });
  const target = new Denicek("target", {
    $tag: "root",
    items: { $tag: "ul", $items: ["aLPHA", "bRAVO", "cHARLIE"] },
  });

  const capitalizeEventId = source.applyPrimitiveEdit(
    "items/0",
    "test-capitalize-from-event",
  );
  for (const event of source.drain()) {
    target.applyRemote(event);
  }

  target.replayEditFromEventId(capitalizeEventId, "items/1");
  target.replayEditFromEventId(capitalizeEventId, "items/2");

  assertEquals(target.toPlain(), {
    $tag: "root",
    items: { $tag: "ul", $items: ["Alpha", "Bravo", "Charlie"] },
  });
});

Deno.test("replays a non-primitive edit selected by event id at its original target", () => {
  const source = new Denicek("source", {
    $tag: "root",
    items: { $tag: "ul", $items: ["first", "second"] },
  });
  const target = new Denicek("target", {
    $tag: "root",
    items: { $tag: "ul", $items: ["first", "second"] },
  });

  const setValueEventId = source.set("items/0", "updated");
  for (const event of source.drain()) {
    target.applyRemote(event);
  }

  target.repeatEditFromEventId(setValueEventId);

  assertEquals(target.toPlain(), {
    $tag: "root",
    items: { $tag: "ul", $items: ["updated", "second"] },
  });
});

Deno.test("repeats a recorded structural edit through later local wrap and rename changes", () => {
  const core = new Denicek("alice", {
    $tag: "app",
    formula: 1,
  });

  const wrapEventId = core.wrapRecord("formula", "formula", "x-formula-plus");
  const renameEventId = core.rename("formula", "formula", "left");
  const addRightEventId = core.add("formula", "right", 1);

  core.wrapRecord("formula", "formula", "x-formula-plus");
  core.rename("formula", "formula", "left");
  core.add("formula", "right", 1);

  core.repeatEditFromEventId(wrapEventId);
  core.repeatEditFromEventId(renameEventId);
  core.repeatEditFromEventId(addRightEventId);

  assertEquals(core.toPlain(), {
    $tag: "app",
    formula: {
      $tag: "x-formula-plus",
      left: {
        $tag: "x-formula-plus",
        formula: {
          $tag: "x-formula-plus",
          left: 1,
          right: 1,
        },
      },
      right: 1,
    },
  });
});

Deno.test("throws when replaying an edit from an unknown event id", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    name: "bob",
  });

  assertThrows(
    () => core.replayEditFromEventId("alice:99", "name"),
    Error,
    "Unknown event",
  );
  assertThrows(
    () => core.repeatEditFromEventId("alice:99"),
    Error,
    "Unknown event",
  );
});

Deno.test("throws when applying an unknown primitive edit", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    name: "bob",
  });

  assertThrows(
    () => core.applyPrimitiveEdit("name", "missing-primitive-edit"),
    Error,
    "Unknown primitive edit",
  );
});

Deno.test("default edit transform throws unless removal handling is explicit", () => {
  class DummyEdit extends Edit {
    readonly isStructural = false;
    // Edit subclasses must expose a stable kind string.
    readonly kind = "DummyEdit";

    constructor(readonly target: Selector) {
      super();
    }

    apply(_doc: Node): void {}

    canApply(_doc: Node): boolean {
      return true;
    }

    transformSelector(sel: Selector) {
      return { kind: "mapped", selector: sel } as const;
    }

    equals(other: Edit): boolean {
      return other instanceof DummyEdit && this.target.equals(other.target);
    }

    withTarget(target: Selector): DummyEdit {
      return new DummyEdit(target);
    }
  }

  const edit = new DummyEdit(Selector.parse("item/name"));
  const prior = new RecordDeleteEdit(Selector.parse("item"));

  assertThrows(
    () => edit.transform(prior),
    Error,
    "must explicitly handle removal",
  );
});

Deno.test("materialize throws on cycle", () => {
  const events = new Map<string, Event>();
  events.set(
    "a:0",
    new Event(
      new EventId("a", 0),
      [new EventId("b", 0)],
      new RecordAddEdit(Selector.parse("x"), new PrimitiveNode("a")),
      new VectorClock({ a: 0 }),
    ),
  );
  events.set(
    "b:0",
    new Event(
      new EventId("b", 0),
      [new EventId("a", 0)],
      new RecordAddEdit(Selector.parse("y"), new PrimitiveNode("b")),
      new VectorClock({ b: 0 }),
    ),
  );
  const graph = new EventGraph(
    new RecordNode("root", {}),
    events,
    [new EventId("a", 0), new EventId("b", 0)],
  );
  assertThrows(() => graph.materialize(), Error, "cycle");
});

Deno.test("materialize throws on invalid replay state", () => {
  const graph = new EventGraph(
    new RecordNode("root", {}),
    new Map([
      [
        "alice:0",
        new Event(
          new EventId("alice", 0),
          [],
          new RecordAddEdit(
            Selector.parse("missing/x"),
            new PrimitiveNode("a"),
          ),
          new VectorClock({ alice: 0 }),
        ),
      ],
    ]),
    [new EventId("alice", 0)],
  );

  assertThrows(() => graph.materialize(), Error, "No nodes match selector");
});

Deno.test("commit throws on pop-back from empty list", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: [] as string[] },
  });
  assertThrows(() => core.popBack("items"), Error, "list is empty");
});

// ── Known bugs: concurrent delete + field-targeting edits ──────────

Deno.test("concurrent delete + edit: delete wins, edit is no-op", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "item", name: "a", val: "1" }],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  alice.delete("items/*", "val");
  bob.set("items/*/val", "UPDATED");
  sync(alice, bob);

  // Delete wins; the concurrent set on the deleted field should be a no-op
  const expected = {
    $tag: "root",
    items: { $tag: "ul", $items: [{ $tag: "item", name: "a" }] },
  };
  const expectedConflicts = [{
    $tag: "conflict",
    kind: "NoOpEdit",
    target: "items/*/val",
    data:
      "RecordDeleteEdit removed 'items/*/val' before SetValueEdit could apply.",
  }];
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
  assertEquals(materializedConflicts(alice), expectedConflicts);
  assertEquals(materializedConflicts(bob), expectedConflicts);
});

Deno.test("concurrent wildcard edit on emptied list becomes no-op", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: ["only"] },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.popBack("items");
  bob.set("items/*", "UPDATED");
  sync(alice, bob);

  const expected = {
    $tag: "root",
    items: { $tag: "ul", $items: [] as string[] },
  };
  const expectedConflicts = [{
    $tag: "conflict",
    kind: "NoOpEdit",
    target: "items/*",
    data:
      "Concurrent replay left 'items/*' unavailable before SetValueEdit could replay.",
  }];
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
  assertEquals(materializedConflicts(alice), expectedConflicts);
  assertEquals(materializedConflicts(bob), expectedConflicts);
});

Deno.test("concurrent copy overwrite makes nested record edit a no-op", () => {
  const doc = {
    $tag: "root",
    data: { $tag: "data", a: "1", b: "2" },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.wrapRecord("data", "b", "t1");
  alice.add("data", "d", "v1");
  alice.copy("data/b", "data/d");
  bob.delete("data", "a");
  sync(alice, bob);

  const expected = {
    $tag: "root",
    data: { $tag: "t1", b: "v1", d: "v1" },
  };
  const expectedConflicts = [{
    $tag: "conflict",
    kind: "NoOpEdit",
    target: "data/b/a",
    data:
      "Concurrent replay left 'data/b/a' unavailable before RecordDeleteEdit could replay.",
  }];
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
  assertEquals(materializedConflicts(alice), expectedConflicts);
  assertEquals(materializedConflicts(bob), expectedConflicts);
});

Deno.test("concurrent push-front shifts index-based selectors", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "item", name: "first", val: "abc" },
        { $tag: "item", name: "second", val: "def" },
      ],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  alice.pushFront("items", { $tag: "item", name: "new", val: "xxx" });
  bob.set("items/0/val", "UPDATED");
  sync(alice, bob);

  // Bob's set on index 0 should shift to index 1 after alice's push-front
  const expected = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "item", name: "new", val: "xxx" },
        { $tag: "item", name: "first", val: "UPDATED" },
        { $tag: "item", name: "second", val: "def" },
      ],
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("concurrent double pop-back on single-item list converges", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: ["only"] },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  alice.popBack("items");
  bob.popBack("items");
  sync(alice, bob);

  // Both peers saw the same last item, so the shared intent is one removal.
  const expected = {
    $tag: "root",
    items: { $tag: "ul", $items: [] as unknown[] },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("commit throws on pop-front from empty list", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: [] as string[] },
  });
  assertThrows(() => core.popFront("items"), Error, "list is empty");
});

// ── Adversarial concurrent scenarios ────────────────────────────────

Deno.test("concurrent rename to same target name", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "r", a: "1", b: "2", c: "3" }],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  // Both rename different fields to "title"
  alice.rename("items/*", "a", "title");
  bob.rename("items/*", "b", "title");
  sync(alice, bob);
  assertEquals(alice.toPlain(), bob.toPlain());
});

Deno.test("concurrent add of same field name", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "r", name: "x" }],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  alice.add("items/*", "extra", "from-alice");
  bob.add("items/*", "extra", "from-bob");
  sync(alice, bob);
  assertEquals(alice.toPlain(), bob.toPlain());
});

Deno.test("concurrent wraps at different depths", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "item", name: "a", sub: { $tag: "sl", $items: ["x", "y"] } },
      ],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  alice.wrapRecord("items/*", "outer", "wrap1");
  bob.wrapList("items/0/sub/*", "inner");
  sync(alice, bob);
  assertEquals(alice.toPlain(), bob.toPlain());
});

Deno.test("concurrent rename + wrap on same path", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "r", name: "a", val: "1" }],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  alice.rename("items/*", "name", "title");
  bob.wrapRecord("items/*", "inner", "w");
  sync(alice, bob);
  assertEquals(alice.toPlain(), bob.toPlain());
});

Deno.test("concurrent delete + rename of same field", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "r", name: "a", val: "1" }],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  alice.delete("items/*", "name");
  bob.rename("items/*", "name", "title");
  sync(alice, bob);
  assertEquals(alice.toPlain(), bob.toPlain());
});

Deno.test("concurrent pop-front + push-front + rename", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "item", name: "a" },
        { $tag: "item", name: "b" },
      ],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  const carol = new Denicek("carol", doc);
  alice.popFront("items");
  bob.pushFront("items", { $tag: "item", name: "new" });
  carol.rename("items/*", "name", "title");

  // Mesh sync
  const frontiers = [alice.frontiers, bob.frontiers, carol.frontiers];
  const peers = [alice, bob, carol];
  const diffs = peers.map((p, i) => {
    const events: Event[] = [];
    for (let j = 0; j < 3; j++) {
      if (i !== j) events.push(...p.eventsSince(frontiers[j]!));
    }
    return events;
  });
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (i !== j) { for (const e of diffs[j]!) peers[i]!.applyRemote(e); }
    }
  }

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(bob.toPlain(), carol.toPlain());
});

Deno.test("3 concurrent wraps on same target", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "item", name: "a" }],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  const carol = new Denicek("carol", doc);
  alice.wrapList("items/*", "w1");
  bob.wrapRecord("items/*", "inner", "w2");
  carol.wrapList("items/*", "w3");

  const frontiers = [alice.frontiers, bob.frontiers, carol.frontiers];
  const peers = [alice, bob, carol];
  const diffs = peers.map((p, i) => {
    const events: Event[] = [];
    for (let j = 0; j < 3; j++) {
      if (i !== j) events.push(...p.eventsSince(frontiers[j]!));
    }
    return events;
  });
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (i !== j) { for (const e of diffs[j]!) peers[i]!.applyRemote(e); }
    }
  }

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(bob.toPlain(), carol.toPlain());
});

Deno.test("transitive convergence: A↔B, B↔C, then A↔C", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: [{ $tag: "item", name: "a", val: "1" }] },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  const carol = new Denicek("carol", doc);

  alice.rename("items/*", "name", "title");
  bob.wrapRecord("items/*", "inner", "w");
  carol.pushBack("items", { $tag: "item", name: "b", val: "2" });

  // Chain sync: A↔B, then B↔C — A and C never directly sync
  sync(alice, bob);
  sync(bob, carol);
  // Now sync A↔C — all three should converge
  sync(alice, carol);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(bob.toPlain(), carol.toPlain());
});

Deno.test("concurrent rename to same name + edit on that field", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "r", a: "hello", b: "world" }],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  const carol = new Denicek("carol", doc);

  alice.rename("items/*", "a", "title");
  bob.rename("items/*", "b", "title");
  carol.set("items/*/a", "UPDATED");

  const frontiers = [alice.frontiers, bob.frontiers, carol.frontiers];
  const peers = [alice, bob, carol];
  const diffs = peers.map((p, i) => {
    const events: Event[] = [];
    for (let j = 0; j < 3; j++) {
      if (i !== j) events.push(...p.eventsSince(frontiers[j]!));
    }
    return events;
  });
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (i !== j) { for (const e of diffs[j]!) peers[i]!.applyRemote(e); }
    }
  }

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(bob.toPlain(), carol.toPlain());
});

Deno.test("nested list: concurrent push + pop at different levels", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        {
          $tag: "group",
          sub: { $tag: "sl", $items: ["x", "y", "z"] },
        },
      ],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.popFront("items/0/sub");
  alice.pushBack("items", {
    $tag: "group",
    sub: { $tag: "sl", $items: ["new"] },
  });
  bob.popBack("items/0/sub");
  bob.pushFront("items/0/sub", "front");

  sync(alice, bob);
  assertEquals(alice.toPlain(), bob.toPlain());
});
