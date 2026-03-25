import { assertEquals, assertThrows } from "@std/assert";
import {
  Denicek,
} from "../mod.ts";
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

function createRecordAddEvent(peer: string, seq: number, parentSeqs: number[], field: string): Event {
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
    focus: "/person/fullName",
  });
});

Deno.test("applies deletes even when references target the deleted field", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    person: { $tag: "person", name: "Ada Lovelace" },
    focus: { $ref: "/person/name" },
  });

  core.delete("person", "name");

  const plain = core.toPlain() as Record<string, unknown>;
  assertEquals(plain.person, { $tag: "person" });
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
  const items = ((alice.toPlain() as Record<string, unknown>).items as Record<string, unknown>).$items as string[];
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
    focus: "/person/inner/name",
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
    focus: "/person/*/name",
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
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

Deno.test("Conference list", () => {
  const doc = {
    $tag: "div",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "li", name: "John Doe" },
        { $tag: "li", name: "Jane Smith" },
      ],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.pushBack("items", { $tag: "li", name: "Alice Johnson" });

  bob.updateTag("items", "table");
  bob.updateTag("items/*", "td");
  bob.wrapList("items/*", "tr");

  sync(alice, bob);

  const expected = {
    $tag: "div",
    items: {
      $tag: "table",
      $items: [
        { $tag: "tr", $items: [{ $tag: "td", name: "John Doe" }] },
        { $tag: "tr", $items: [{ $tag: "td", name: "Jane Smith" }] },
        { $tag: "tr", $items: [{ $tag: "td", name: "Alice Johnson" }] },
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
  assertThrows(() => core.add("nonexistent", "x", "a"), Error, "No nodes match selector");
});

Deno.test("commit throws on kind mismatch", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: [] as string[] },
  });
  assertThrows(() => core.add("items", "x", "a"), Error, "expected record, found 'ListNode'");
});

Deno.test("fromPlain rejects null", () => {
  assertThrows(() => Node.fromPlain(JSON.parse("null")), Error, "Null is not a valid PlainNode.");
});

Deno.test("default edit transform throws unless removal handling is explicit", () => {
  class DummyEdit extends Edit {
    readonly isStructural = false;

    constructor(readonly target: Selector) { super(); }

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
  events.set("a:0", new Event(
    new EventId("a", 0),
    [new EventId("b", 0)],
    new RecordAddEdit(Selector.parse("x"), new PrimitiveNode("a")),
    new VectorClock({ a: 0 }),
  ));
  events.set("b:0", new Event(
    new EventId("b", 0),
    [new EventId("a", 0)],
    new RecordAddEdit(Selector.parse("y"), new PrimitiveNode("b")),
    new VectorClock({ b: 0 }),
  ));
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
          new RecordAddEdit(Selector.parse("missing/x"), new PrimitiveNode("a")),
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
    data: "RecordDeleteEdit removed 'items/*/val' before SetValueEdit could apply.",
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
    data: "Concurrent replay left 'items/*' unavailable before SetValueEdit could replay.",
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
    data: "Concurrent replay left 'data/b/a' unavailable before RecordDeleteEdit could replay.",
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
  const expected = { $tag: "root", items: { $tag: "ul", $items: [] as unknown[] } };
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
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (i !== j) for (const e of diffs[j]!) peers[i]!.applyRemote(e);

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
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (i !== j) for (const e of diffs[j]!) peers[i]!.applyRemote(e);

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
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (i !== j) for (const e of diffs[j]!) peers[i]!.applyRemote(e);

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
  alice.pushBack("items", { $tag: "group", sub: { $tag: "sl", $items: ["new"] } });
  bob.popBack("items/0/sub");
  bob.pushFront("items/0/sub", "front");

  sync(alice, bob);
  assertEquals(alice.toPlain(), bob.toPlain());
});
