import { assertEquals, assertThrows } from "@std/assert";
import {
  applyRemoteEvent,
  commitLocal,
  type EventGraph,
  init,
  list,
  materialize,
  merge,
  nodeToPlainObject,
  primitive,
  record,
  reference,
} from "./core.ts";

const toPlain = (eg: EventGraph) => nodeToPlainObject(materialize(eg));

Deno.test("Concurrent add of record -> convergent LWW", () => {
  let alice = init(record("root", {}));
  let bob = init(record("root", {}));

  [alice] = commitLocal(alice, "alice", {
    kind: "record-add",
    target: "",
    field: "title",
    node: primitive("From Alice"),
  });
  [bob] = commitLocal(bob, "bob", {
    kind: "record-add",
    target: "",
    field: "title",
    node: primitive("From Bob"),
  });

  const mergedAB = merge(alice, bob);
  const mergedBA = merge(bob, alice);

  assertEquals(toPlain(mergedAB), toPlain(mergedBA));
  assertEquals(toPlain(mergedAB), {
    $tag: "root",
    title: "From Bob",
  });
});

Deno.test("updates absolute references on structural rename", () => {
  const initial = record("root", {
    person: record("person", { name: primitive("Ada Lovelace") }),
    focus: reference("/person/name"),
  });
  let core = init(initial);

  [core] = commitLocal(core, "alice", {
    kind: "record-rename-field",
    target: "person",
    from: "name",
    to: "fullName",
  });

  assertEquals(toPlain(core), {
    $tag: "root",
    person: { $tag: "person", fullName: "Ada Lovelace" },
    focus: "/person/fullName",
  });
});

Deno.test("applies deletes even when references target the deleted field", () => {
  const initial = record("root", {
    person: record("person", { name: primitive("Ada Lovelace") }),
    focus: reference("/person/name"),
  });
  let core = init(initial);

  [core] = commitLocal(core, "alice", {
    kind: "record-delete",
    target: "person",
    field: "name",
  });

  const plain = toPlain(core) as Record<string, unknown>;
  assertEquals(plain.person, { $tag: "person" });
});

Deno.test("keeps concurrent list push-backs from both peers", () => {
  const initial = record("root", { items: list("ul", []) });
  let alice = init(initial);
  let bob = init(initial);

  [alice] = commitLocal(alice, "alice", {
    kind: "list-push-back",
    target: "items",
    node: primitive("A"),
  });
  [bob] = commitLocal(bob, "bob", {
    kind: "list-push-back",
    target: "items",
    node: primitive("B"),
  });

  const expected = {
    $tag: "root",
    items: { $tag: "ul", $items: ["A", "B"] },
  };
  assertEquals(toPlain(merge(alice, bob)), expected);
  assertEquals(toPlain(merge(bob, alice)), expected);
});

Deno.test("list-pop-front removes first item", () => {
  const initial = record("root", {
    items: list("ul", [primitive("a"), primitive("b"), primitive("c")]),
  });
  let core = init(initial);

  [core] = commitLocal(core, "alice", {
    kind: "list-pop-front",
    target: "items",
  });

  assertEquals(toPlain(core), {
    $tag: "root",
    items: { $tag: "ul", $items: ["b", "c"] },
  });
});

Deno.test("list-pop-back removes last item", () => {
  const initial = record("root", {
    items: list("ul", [primitive("a"), primitive("b"), primitive("c")]),
  });
  let core = init(initial);

  [core] = commitLocal(core, "alice", {
    kind: "list-pop-back",
    target: "items",
  });

  assertEquals(toPlain(core), {
    $tag: "root",
    items: { $tag: "ul", $items: ["a", "b"] },
  });
});

Deno.test("list-push-front inserts at start", () => {
  const initial = record("root", {
    items: list("ul", [primitive("a"), primitive("b"), primitive("c")]),
  });
  let core = init(initial);

  [core] = commitLocal(core, "alice", {
    kind: "list-push-front",
    target: "items",
    node: primitive("z"),
  });

  assertEquals(toPlain(core), {
    $tag: "root",
    items: { $tag: "ul", $items: ["z", "a", "b", "c"] },
  });
});

// ── Selector transform tests ────────────────────────────────────────

Deno.test("transforms selector after concurrent rename", () => {
  const initial = record("root", {
    person: record("person", { name: primitive("Ada") }),
  });
  let alice = init(initial);
  let bob = init(initial);

  [alice] = commitLocal(alice, "alice", {
    kind: "record-rename-field",
    target: "person",
    from: "name",
    to: "fullName",
  });
  [bob] = commitLocal(bob, "bob", {
    kind: "primitive-edit",
    target: "person/name",
    op: "upper",
  });

  const expected = {
    $tag: "root",
    person: { $tag: "person", fullName: "ADA" },
  };
  assertEquals(toPlain(merge(alice, bob)), expected);
  assertEquals(toPlain(merge(bob, alice)), expected);
});

Deno.test("transforms selector after concurrent wrap-record", () => {
  const initial = record("root", {
    person: record("person", { name: primitive("Ada") }),
    focus: reference("/person/name"),
  });
  let alice = init(initial);
  let bob = init(initial);

  [alice] = commitLocal(alice, "alice", {
    kind: "wrap-record",
    target: "person",
    field: "inner",
    tag: "wrapper",
  });
  [bob] = commitLocal(bob, "bob", {
    kind: "primitive-edit",
    target: "person/name",
    op: "upper",
  });

  const expected = {
    $tag: "root",
    person: { $tag: "wrapper", inner: { $tag: "person", name: "ADA" } },
    focus: "/person/inner/name",
  };
  assertEquals(toPlain(merge(alice, bob)), expected);
  assertEquals(toPlain(merge(bob, alice)), expected);
});

Deno.test("transforms selector after concurrent wrap-list", () => {
  const initial = record("root", {
    person: record("person", { name: primitive("Ada") }),
    focus: reference("/person/name"),
  });
  let alice = init(initial);
  let bob = init(initial);

  [alice] = commitLocal(alice, "alice", {
    kind: "wrap-list",
    target: "person",
    tag: "people",
  });
  [bob] = commitLocal(bob, "bob", {
    kind: "primitive-edit",
    target: "person/name",
    op: "upper",
  });

  const expected = {
    $tag: "root",
    person: { $tag: "people", $items: [{ $tag: "person", name: "ADA" }] },
    focus: "/person/*/name",
  };
  assertEquals(toPlain(merge(alice, bob)), expected);
  assertEquals(toPlain(merge(bob, alice)), expected);
});

Deno.test("wildcard edit affects concurrently inserted item", () => {
  const initial = record("root", {
    items: list("ul", [record("task", { status: primitive("todo") })]),
  });
  let alice = init(initial);
  let bob = init(initial);

  [alice] = commitLocal(alice, "alice", {
    kind: "primitive-edit",
    target: "items/*/status",
    op: "replace",
    args: "todo/done",
  });
  [bob] = commitLocal(bob, "bob", {
    kind: "list-push-back",
    target: "items",
    node: record("task", { status: primitive("todo") }),
  });

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
  assertEquals(toPlain(merge(alice, bob)), expected);
  assertEquals(toPlain(merge(bob, alice)), expected);
});

Deno.test("Conference list", () => {
  const initial = record("div", {
    items: list("ul", [
      record("li", { name: primitive("John Doe") }),
      record("li", { name: primitive("Jane Smith") }),
    ]),
  });
  let alice = init(initial);
  let bob = init(initial);

  [alice] = commitLocal(alice, "alice", {
    kind: "list-push-back",
    target: "items",
    node: record("li", { name: primitive("Alice Johnson") }),
  });

  [bob] = commitLocal(bob, "bob", {
    kind: "update-tag",
    target: "items",
    tag: "table",
  });
  [bob] = commitLocal(bob, "bob", {
    kind: "update-tag",
    target: "items/*",
    tag: "td",
  });
  [bob] = commitLocal(bob, "bob", {
    kind: "wrap-record",
    target: "items/*",
    field: "cell",
    tag: "tr",
  });

  const expected = {
    $tag: "div",
    items: {
      $tag: "table",
      $items: [
        { $tag: "tr", cell: { $tag: "td", name: "John Doe" } },
        { $tag: "tr", cell: { $tag: "td", name: "Jane Smith" } },
        { $tag: "tr", cell: { $tag: "td", name: "Alice Johnson" } },
      ],
    },
  };

  assertEquals(toPlain(merge(alice, bob)), expected);
  assertEquals(toPlain(merge(bob, alice)), expected);

  // Same result when peer IDs are swapped (tiebreaker order reversed)
  let xena = init(initial);
  let adam = init(initial);

  [xena] = commitLocal(xena, "xena", {
    kind: "list-push-back",
    target: "items",
    node: record("li", { name: primitive("Alice Johnson") }),
  });
  [adam] = commitLocal(adam, "adam", {
    kind: "update-tag",
    target: "items",
    tag: "table",
  });
  [adam] = commitLocal(adam, "adam", {
    kind: "update-tag",
    target: "items/*",
    tag: "td",
  });
  [adam] = commitLocal(adam, "adam", {
    kind: "wrap-record",
    target: "items/*",
    field: "cell",
    tag: "tr",
  });

  assertEquals(toPlain(merge(xena, adam)), expected);
  assertEquals(toPlain(merge(adam, xena)), expected);
});

// ── Edit coverage tests ─────────────────────────────────────────────

Deno.test("copy replaces target with source", () => {
  const initial = record("root", {
    source: primitive("hello"),
    target: primitive("world"),
  });
  let core = init(initial);

  [core] = commitLocal(core, "alice", {
    kind: "copy",
    target: "target",
    source: "source",
  });

  assertEquals(toPlain(core), {
    $tag: "root",
    source: "hello",
    target: "hello",
  });
});

Deno.test("update-tag changes tag on record", () => {
  const initial = record("root", {
    item: record("div", { name: primitive("test") }),
  });
  let core = init(initial);

  [core] = commitLocal(core, "alice", {
    kind: "update-tag",
    target: "item",
    tag: "span",
  });

  assertEquals(toPlain(core), {
    $tag: "root",
    item: { $tag: "span", name: "test" },
  });
});

Deno.test("update-tag changes tag on list", () => {
  const initial = record("root", {
    items: list("ul", [primitive("a")]),
  });
  let core = init(initial);

  [core] = commitLocal(core, "alice", {
    kind: "update-tag",
    target: "items",
    tag: "ol",
  });

  assertEquals(toPlain(core), {
    $tag: "root",
    items: { $tag: "ol", $items: ["a"] },
  });
});

// ── Error path tests────────────────────────────────────────────────

Deno.test("merge rejects different initial documents", () => {
  const a = init(record("root", {}));
  const b = init(record("other", {}));
  assertThrows(
    () => merge(a, b),
    Error,
    "Cannot merge cores with different initial documents.",
  );
});

Deno.test("applyRemoteEvent rejects conflicting payload", () => {
  const core = init(record("root", {}));
  const [updated, event] = commitLocal(core, "alice", {
    kind: "record-add",
    target: "",
    field: "x",
    node: primitive("a"),
  });
  const conflicting = {
    ...event,
    edit: {
      kind: "record-add" as const,
      target: [] as string[],
      field: "x",
      node: primitive("b"),
    },
  };
  assertThrows(
    () => applyRemoteEvent(updated, conflicting),
    Error,
    "Conflicting payload",
  );
});

Deno.test("applyRemoteEvent rejects missing parent", () => {
  const core = init(record("root", {}));
  const event = {
    id: { peer: "alice", seq: 0 },
    parents: [{ peer: "bob", seq: 99 }],
    edit: {
      kind: "record-add" as const,
      target: [] as string[],
      field: "x",
      node: primitive("a"),
    },
  };
  assertThrows(
    () => applyRemoteEvent(core, event),
    Error,
    "Unknown parent",
  );
});

Deno.test("materialize throws on edit targeting non-existent path", () => {
  let core = init(record("root", {}));
  [core] = commitLocal(core, "alice", {
    kind: "record-add",
    target: "nonexistent",
    field: "x",
    node: primitive("a"),
  });
  assertThrows(() => materialize(core), Error, "No nodes match selector");
});

Deno.test("materialize throws on kind mismatch", () => {
  const initial = record("root", { items: list("ul", []) });
  let core = init(initial);
  [core] = commitLocal(core, "alice", {
    kind: "record-add",
    target: "items",
    field: "x",
    node: primitive("a"),
  });
  assertThrows(() => materialize(core), Error, "expected record, found 'list'");
});

Deno.test("materialize throws on cycle", () => {
  const graph: EventGraph = {
    initial: record("root", {}),
    events: {
      "a:0": {
        id: { peer: "a", seq: 0 },
        parents: [{ peer: "b", seq: 0 }],
        edit: {
          kind: "record-add",
          target: [],
          field: "x",
          node: primitive("a"),
        },
      },
      "b:0": {
        id: { peer: "b", seq: 0 },
        parents: [{ peer: "a", seq: 0 }],
        edit: {
          kind: "record-add",
          target: [],
          field: "y",
          node: primitive("b"),
        },
      },
    },
    frontiers: [
      { peer: "a", seq: 0 },
      { peer: "b", seq: 0 },
    ],
  };
  assertThrows(() => materialize(graph), Error, "cycle");
});

Deno.test("list-pop-back throws on empty list", () => {
  const initial = record("root", { items: list("ul", []) });
  let core = init(initial);
  [core] = commitLocal(core, "alice", {
    kind: "list-pop-back",
    target: "items",
  });
  assertThrows(() => materialize(core), Error, "list is empty");
});

Deno.test("list-pop-front throws on empty list", () => {
  const initial = record("root", { items: list("ul", []) });
  let core = init(initial);
  [core] = commitLocal(core, "alice", {
    kind: "list-pop-front",
    target: "items",
  });
  assertThrows(() => materialize(core), Error, "list is empty");
});
