import { assertEquals, assertThrows } from "@std/assert";
import {
  Denicek,
  type EventGraph,
  materialize,
  primitive,
  record,
} from "./core.ts";

/** Exchange events between two peers so both converge. */
function sync(a: Denicek, b: Denicek): void {
  for (const e of a.drain()) b.applyRemote(e);
  for (const e of b.drain()) a.applyRemote(e);
}

Deno.test("Concurrent add of record -> convergent LWW", () => {
  const alice = new Denicek("alice");
  const bob = new Denicek("bob");

  alice.add("", "title", "From Alice");
  bob.add("", "title", "From Bob");

  sync(alice, bob);

  const expected = { $tag: "root", title: "From Bob" };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
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

  const expected = {
    $tag: "root",
    items: { $tag: "ul", $items: ["A", "B"] },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
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
  bob.edit("person/name", "upper");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    person: { $tag: "person", fullName: "ADA" },
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
  bob.edit("person/name", "upper");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    person: { $tag: "wrapper", inner: { $tag: "person", name: "ADA" } },
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
  bob.edit("person/name", "upper");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    person: { $tag: "people", $items: [{ $tag: "person", name: "ADA" }] },
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

  alice.edit("items/*/status", "replace", "todo/done");
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

Deno.test("merge rejects different initial documents", () => {
  const a = new Denicek("alice", { $tag: "root" });
  const b = new Denicek("bob", { $tag: "other" });
  assertThrows(
    () => a.merge(b),
    Error,
    "Cannot merge cores with different initial documents.",
  );
});

Deno.test("applyRemote rejects conflicting payload", () => {
  const alice = new Denicek("alice");
  alice.add("", "x", "a");
  const [event] = alice.drain();
  const conflicting = {
    ...event,
    edit: {
      ...event.edit,
      node: primitive("b"),
    },
  };
  assertThrows(
    () => alice.applyRemote(conflicting),
    Error,
    "Conflicting payload",
  );
});

Deno.test("applyRemote rejects missing parent", () => {
  const core = new Denicek("alice");
  const event = {
    id: { peer: "bob", seq: 0 },
    parents: [{ peer: "charlie", seq: 99 }],
    edit: {
      kind: "record-add" as const,
      target: [] as string[],
      field: "x",
      node: primitive("a"),
    },
  };
  assertThrows(
    () => core.applyRemote(event),
    Error,
    "Unknown parent",
  );
});

Deno.test("materialize throws on edit targeting non-existent path", () => {
  const core = new Denicek("alice");
  core.add("nonexistent", "x", "a");
  assertThrows(() => core.materialize(), Error, "No nodes match selector");
});

Deno.test("materialize throws on kind mismatch", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: [] as string[] },
  });
  core.add("items", "x", "a");
  assertThrows(() => core.materialize(), Error, "expected record, found 'list'");
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
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: [] as string[] },
  });
  core.popBack("items");
  assertThrows(() => core.materialize(), Error, "list is empty");
});

Deno.test("list-pop-front throws on empty list", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: { $tag: "ul", $items: [] as string[] },
  });
  core.popFront("items");
  assertThrows(() => core.materialize(), Error, "list is empty");
});
