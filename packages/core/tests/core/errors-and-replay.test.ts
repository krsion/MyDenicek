import {
  assertEquals,
  assertThrows,
  createRecordAddEvent,
  Denicek,
  Edit,
  Event,
  EventGraph,
  EventId,
  Node,
  PrimitiveNode,
  RecordAddEdit,
  RecordDeleteEdit,
  RecordNode,
  registerPrimitiveEdit,
  Selector,
  VectorClock,
} from "./test-helpers.ts";

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
