import { assertEquals, Denicek, sync } from "./test-helpers.ts";

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
