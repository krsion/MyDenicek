import { assertEquals, Denicek, sync } from "./test-helpers.ts";

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
