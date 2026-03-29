import {
  assertEquals,
  assertThrows,
  createRecordAddEvent,
  Denicek,
  Edit,
  encodeRemoteEvent,
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

Deno.test("rejects peer ids containing the event-id separator", () => {
  assertThrows(
    () => new Denicek("alice:west"),
    Error,
    "cannot contain ':'",
  );
});

Deno.test("drain returns encoded remote events", () => {
  const alice = new Denicek("alice");

  alice.add("", "title", "Draft");

  assertEquals(alice.drain(), [{
    id: { peer: "alice", seq: 0 },
    parents: [],
    edit: {
      kind: "RecordAddEdit",
      target: "title",
      node: "Draft",
    },
    clock: { alice: 0 },
  }]);
});

Deno.test("applyRemote rejects conflicting payload", () => {
  const alice = new Denicek("alice");
  alice.add("", "x", "a");
  const [event] = alice.drain();
  // Same id but different edit content
  const conflicting = {
    ...event,
    edit: { kind: "RecordAddEdit" as const, target: "y", node: "b" },
  };
  assertThrows(
    () => alice.applyRemote(conflicting),
    Error,
    "Conflicting payload",
  );
});

Deno.test("applyRemote rejects events whose vector clock does not match their id", () => {
  const alice = new Denicek("alice");
  const invalidClockEvent = encodeRemoteEvent(
    new Event(
      new EventId("bob", 1),
      [],
      new RecordAddEdit(Selector.parse("x"), new PrimitiveNode("b")),
      new VectorClock({ bob: 0 }),
    ),
  );

  assertThrows(
    () => alice.applyRemote(invalidClockEvent),
    Error,
    "must have vector clock entry bob=1",
  );
});

Deno.test("applyRemote rejects events whose vector clock does not dominate parents", () => {
  const alice = new Denicek("alice");
  const parentEvent = encodeRemoteEvent(
    new Event(
      new EventId("parent", 0),
      [],
      new RecordAddEdit(Selector.parse("x"), new PrimitiveNode("a")),
      new VectorClock({ parent: 0 }),
    ),
  );
  alice.applyRemote(parentEvent);
  const childEvent = encodeRemoteEvent(
    new Event(
      new EventId("bob", 0),
      [new EventId("parent", 0)],
      new RecordAddEdit(Selector.parse("y"), new PrimitiveNode("b")),
      new VectorClock({ bob: 0 }),
    ),
  );

  assertThrows(
    () => alice.applyRemote(childEvent),
    Error,
    "must dominate parent",
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

Deno.test("rejects malformed plain-node arrays at the public API boundary", () => {
  assertThrows(
    () => new Denicek("alice", [] as unknown as never),
    Error,
    "Arrays are not valid PlainNode values",
  );
});

Deno.test("rejects cyclic plain nodes before constructing the document", () => {
  const root = { $tag: "root" } as { $tag: string; self?: unknown };
  root.self = root;

  assertThrows(
    () => new Denicek("alice", root as unknown as never),
    Error,
    "must not contain cycles",
  );
});

Deno.test("rejects malformed record tags before constructing the document", () => {
  assertThrows(
    () => new Denicek("alice", { $tag: "" } as unknown as never),
    Error,
    "non-empty string $tag",
  );
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

Deno.test("compact rejects malformed frontier inputs", () => {
  const core = new Denicek("alice");

  assertThrows(
    () => core.compact("alice:0" as unknown as string[]),
    Error,
    "array of event ids",
  );
  assertThrows(
    () => core.compact(["alice:0", 1] as unknown as string[]),
    Error,
    "only contain event id strings",
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

Deno.test("applyRemote rejects malformed remote event envelopes", () => {
  const alice = new Denicek("alice");

  assertThrows(
    () => alice.applyRemote(null as unknown as never),
    Error,
    "Remote events must be objects",
  );
  assertThrows(
    () =>
      alice.applyRemote({
        id: { peer: "bob", seq: 0 },
        parents: "nope",
        edit: { kind: "RecordDeleteEdit", target: "x" },
        clock: { bob: 0 },
      } as unknown as never),
    Error,
    "parents must be an array",
  );
  assertThrows(
    () =>
      alice.applyRemote({
        id: { peer: "bob", seq: 0 },
        parents: [],
        edit: { kind: "RecordDeleteEdit", target: "x" },
        clock: null,
      } as unknown as never),
    Error,
    "clock must be an object",
  );
});

Deno.test("applyRemote rejects malformed remote event ids and edits", () => {
  const alice = new Denicek("alice");

  assertThrows(
    () =>
      alice.applyRemote({
        id: { peer: "", seq: 0 },
        parents: [],
        edit: { kind: "RecordDeleteEdit", target: "x" },
        clock: { bob: 0 },
      } as unknown as never),
    Error,
    "must not be empty",
  );
  assertThrows(
    () =>
      alice.applyRemote({
        id: { peer: "bob", seq: 0 },
        parents: [],
        edit: null,
        clock: { bob: 0 },
      } as unknown as never),
    Error,
    "encoded edit must be an object",
  );
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

Deno.test("Selector.parse rejects non-string, too-long, and unsafe numeric inputs", () => {
  assertThrows(
    () => Selector.parse(42 as unknown as string),
    Error,
    "must be strings",
  );
  assertThrows(
    () => Selector.parse(`a/${"b/".repeat(3000)}`),
    Error,
    "too long",
  );
  assertEquals(
    Selector.parse("items/9007199254740992").segments[1],
    "9007199254740992",
  );
});

Deno.test("VectorClock rejects invalid entries", () => {
  assertThrows(
    () => new VectorClock({ alice: Number.POSITIVE_INFINITY }),
    Error,
    "non-negative safe integer",
  );
  assertThrows(
    () => new VectorClock({ "": 0 }),
    Error,
    "must not be empty",
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

    encodeRemoteEdit(): never {
      throw new Error("DummyEdit should not be serialized in this test.");
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
