import {
  assertEquals,
  assertThrows,
  Denicek,
  materializedConflicts,
  sync,
  syncMesh,
} from "./test-helpers.ts";

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
      "RecordDeleteEdit removed 'items/*/val' before ApplyPrimitiveEdit could apply.",
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

  alice.remove("items", -1, true);
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
      "Concurrent replay left 'items/*' unavailable before ApplyPrimitiveEdit could replay.",
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
  alice.insert("items", 0, { $tag: "item", name: "new", val: "xxx" }, true);
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
  alice.remove("items", -1, true);
  bob.remove("items", -1, true);
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
  assertThrows(() => core.remove("items", 0, true), Error, "list is empty");
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
  alice.remove("items", 0, true);
  bob.insert("items", 0, { $tag: "item", name: "new" }, true);
  carol.rename("items/*", "name", "title");

  syncMesh([alice, bob, carol]);

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

  syncMesh([alice, bob, carol]);

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
  carol.insert("items", -1, { $tag: "item", name: "b", val: "2" }, true);

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

  syncMesh([alice, bob, carol]);

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

  alice.remove("items/0/sub", 0, true);
  alice.insert("items", -1, {
    $tag: "group",
    sub: { $tag: "sl", $items: ["new"] },
  }, true);
  bob.remove("items/0/sub", -1, true);
  bob.insert("items/0/sub", 0, "front", true);

  sync(alice, bob);
  assertEquals(alice.toPlain(), bob.toPlain());
});
