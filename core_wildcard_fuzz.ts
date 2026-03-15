/**
 * Multi-Wildcard Concurrent Scenario Fuzz Tests
 *
 * Tests dangerous scenarios with selectors containing multiple wildcards
 * combined with concurrent inserts/deletes/wraps.
 *
 * Run: deno test core_wildcard_fuzz.ts --allow-all
 */

import { assertEquals, assert } from "@std/assert";
import { Denicek, type PlainNode } from "./core.ts";

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

function sync(a: Denicek, b: Denicek): void {
  const af = a.frontiers, bf = b.frontiers;
  for (const e of a.eventsSince(bf)) b.applyRemote(e);
  for (const e of b.eventsSince(af)) a.applyRemote(e);
}

function syncAll(peers: Denicek[]): void {
  // Multiple passes to ensure full convergence
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < peers.length; i++) {
      for (let j = i + 1; j < peers.length; j++) {
        sync(peers[i]!, peers[j]!);
      }
    }
  }
}

function assertConvergence(peers: Denicek[], msg?: string): void {
  const states = peers.map(p => JSON.stringify(p.toPlain()));
  for (let i = 1; i < states.length; i++) {
    assertEquals(states[0], states[i], msg || `Peer 0 and ${i} diverged`);
  }
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ══════════════════════════════════════════════════════════════════════
// TEST: Nested list with wildcard edits (*/*)
// ══════════════════════════════════════════════════════════════════════

Deno.test("Wildcard: nested list */* with concurrent push", () => {
  // Structure: root -> rows (list) -> each row is a list of cells
  const doc: PlainNode = {
    $tag: "root",
    rows: {
      $tag: "table",
      $items: [
        { $tag: "row", $items: ["a1", "a2"] },
        { $tag: "row", $items: ["b1", "b2"] },
      ],
    },
  };

  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Alice edits all cells via */*
  alice.set("rows/*/*", "UPDATED");

  // Bob pushes a new row
  bob.pushBack("rows", { $tag: "row", $items: ["c1", "c2"] });

  syncAll([alice, bob]);
  assertConvergence([alice, bob]);

  // Verify the edit applied and new row exists
  const result = alice.toPlain() as any;
  assert(result.rows.$items.length === 3, "Should have 3 rows");
});

Deno.test("Wildcard: nested list */* with concurrent pop", () => {
  const doc: PlainNode = {
    $tag: "root",
    rows: {
      $tag: "table",
      $items: [
        { $tag: "row", $items: ["a1", "a2", "a3"] },
        { $tag: "row", $items: ["b1", "b2", "b3"] },
      ],
    },
  };

  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  const carol = new Denicek("carol", doc);

  // Alice edits all cells
  alice.set("rows/*/*", "UPDATED");

  // Bob pops from first row
  bob.popBack("rows/0");

  // Carol pops entire first row
  carol.popFront("rows");

  syncAll([alice, bob, carol]);
  assertConvergence([alice, bob, carol]);
});

Deno.test("Wildcard: */* with concurrent wrap on inner list", () => {
  const doc: PlainNode = {
    $tag: "root",
    matrix: {
      $tag: "matrix",
      $items: [
        { $tag: "row", $items: ["x", "y"] },
        { $tag: "row", $items: ["z", "w"] },
      ],
    },
  };

  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Alice edits all inner items
  alice.set("matrix/*/*", "UPDATED");

  // Bob wraps each row's items
  bob.wrapList("matrix/*", "wrapped");

  syncAll([alice, bob]);
  assertConvergence([alice, bob]);
});

// ══════════════════════════════════════════════════════════════════════
// TEST: Deep wildcard paths (a/*/b/*/c)
// ══════════════════════════════════════════════════════════════════════

Deno.test("Wildcard: deep path items/*/data/* with concurrent edits", () => {
  const doc: PlainNode = {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        {
          $tag: "item",
          data: { $tag: "data", $items: ["v1", "v2"] },
        },
        {
          $tag: "item",
          data: { $tag: "data", $items: ["v3", "v4"] },
        },
      ],
    },
  };

  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  const carol = new Denicek("carol", doc);

  // Alice edits all deeply nested values
  alice.set("items/*/data/*", "UPDATED");

  // Bob pushes to first item's data
  bob.pushBack("items/0/data", "new1");

  // Carol pushes new item
  carol.pushBack("items", {
    $tag: "item",
    data: { $tag: "data", $items: ["v5"] },
  });

  syncAll([alice, bob, carol]);
  assertConvergence([alice, bob, carol]);
});

Deno.test("Wildcard: triple wildcard */*/* with concurrent modifications", () => {
  const doc: PlainNode = {
    $tag: "root",
    cube: {
      $tag: "cube",
      $items: [
        {
          $tag: "plane",
          $items: [
            { $tag: "row", $items: ["1", "2"] },
            { $tag: "row", $items: ["3", "4"] },
          ],
        },
        {
          $tag: "plane",
          $items: [
            { $tag: "row", $items: ["5", "6"] },
          ],
        },
      ],
    },
  };

  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Alice edits all values via triple wildcard
  alice.set("cube/*/*/*", "UPDATED");

  // Bob modifies structure at various levels
  bob.pushFront("cube/0/0", "0");
  bob.popBack("cube/1");

  syncAll([alice, bob]);
  assertConvergence([alice, bob]);
});

// ══════════════════════════════════════════════════════════════════════
// TEST: Wildcard with concurrent index shifts
// ══════════════════════════════════════════════════════════════════════

Deno.test("Wildcard: */0 with concurrent push-front shifting indices", () => {
  const doc: PlainNode = {
    $tag: "root",
    lists: {
      $tag: "lists",
      $items: [
        { $tag: "list", $items: ["a", "b", "c"] },
        { $tag: "list", $items: ["d", "e", "f"] },
      ],
    },
  };

  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Alice edits first item of each list (*/0)
  alice.set("lists/*/0", "UPDATED");

  // Bob push-fronts to each list, shifting indices
  bob.pushFront("lists/0", "NEW");
  bob.pushFront("lists/1", "NEW");

  syncAll([alice, bob]);
  assertConvergence([alice, bob]);
});

Deno.test("Wildcard: concurrent push-front + wildcard edit + pop-back", () => {
  const doc: PlainNode = {
    $tag: "root",
    data: {
      $tag: "list",
      $items: [
        { $tag: "inner", $items: ["x", "y", "z"] },
        { $tag: "inner", $items: ["a", "b", "c"] },
      ],
    },
  };

  const peers = [
    new Denicek("alice", doc),
    new Denicek("bob", doc),
    new Denicek("carol", doc),
    new Denicek("dave", doc),
  ];

  // Each peer does a different operation
  peers[0]!.set("data/*/*", "UPDATED");
  peers[1]!.pushFront("data/0", "front");
  peers[2]!.popBack("data/1");
  peers[3]!.pushBack("data", { $tag: "inner", $items: ["new"] });

  syncAll(peers);
  assertConvergence(peers);
});

// ══════════════════════════════════════════════════════════════════════
// TEST: Wildcard wrap operations
// ══════════════════════════════════════════════════════════════════════

Deno.test("Wildcard: concurrent wrapList on */ + wrapRecord on */*", () => {
  const doc: PlainNode = {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "item", value: "a" },
        { $tag: "item", value: "b" },
      ],
    },
  };

  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Alice wraps each item in a list
  alice.wrapList("items/*", "listWrap");

  // Bob wraps each item's value in a record
  bob.wrapRecord("items/*/value", "inner", "recWrap");

  syncAll([alice, bob]);
  assertConvergence([alice, bob]);
});

Deno.test("Wildcard: three concurrent wraps on same wildcard path", () => {
  const doc: PlainNode = {
    $tag: "root",
    items: {
      $tag: "items",
      $items: ["a", "b", "c"],
    },
  };

  const peers = [
    new Denicek("alice", doc),
    new Denicek("bob", doc),
    new Denicek("carol", doc),
  ];

  // All three wrap the same wildcard target differently
  peers[0]!.wrapList("items/*", "wrapA");
  peers[1]!.wrapList("items/*", "wrapB");
  peers[2]!.wrapRecord("items/*", "field", "wrapC");

  syncAll(peers);
  assertConvergence(peers);
});

// ══════════════════════════════════════════════════════════════════════
// TEST: Wildcard delete scenarios
// ══════════════════════════════════════════════════════════════════════

Deno.test("Wildcard: edit on */* while deleting parent list items", () => {
  const doc: PlainNode = {
    $tag: "root",
    grid: {
      $tag: "grid",
      $items: [
        { $tag: "row", $items: ["1", "2", "3"] },
        { $tag: "row", $items: ["4", "5", "6"] },
        { $tag: "row", $items: ["7", "8", "9"] },
      ],
    },
  };

  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Alice edits all cells
  alice.set("grid/*/*", "UPDATED");

  // Bob deletes middle row
  bob.popBack("grid");
  bob.popFront("grid");

  syncAll([alice, bob]);
  assertConvergence([alice, bob]);
});

Deno.test("Wildcard: delete field that wildcard would match", () => {
  const doc: PlainNode = {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "item", name: "first", value: "a" },
        { $tag: "item", name: "second", value: "b" },
      ],
    },
  };

  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Alice edits all values via wildcard
  alice.set("items/*/value", "UPDATED");

  // Bob deletes the value field from first item
  bob.delete("items/0", "value");

  syncAll([alice, bob]);
  assertConvergence([alice, bob]);
});

// ══════════════════════════════════════════════════════════════════════
// TEST: Stress test with random wildcard operations
// ══════════════════════════════════════════════════════════════════════

Deno.test("Wildcard: stress test - many concurrent wildcard operations (500 seeds)", () => {
  for (let seed = 0; seed < 500; seed++) {
    const rng = seededRandom(seed);

    const doc: PlainNode = {
      $tag: "root",
      matrix: {
        $tag: "matrix",
        $items: [
          { $tag: "row", $items: ["a", "b", "c"] },
          { $tag: "row", $items: ["d", "e", "f"] },
          { $tag: "row", $items: ["g", "h", "i"] },
        ],
      },
    };

    const peers = Array.from({ length: 4 }, (_, i) =>
      new Denicek(`peer${i}`, doc)
    );

    // Each peer does random operations
    for (const peer of peers) {
      const numOps = Math.floor(rng() * 4) + 1;
      for (let i = 0; i < numOps; i++) {
        try {
          const op = Math.floor(rng() * 10);
          switch (op) {
            case 0:
              peer.set("matrix/*/*", "UPDATED");
              break;
            case 1:
              peer.set("matrix/*/0", "updated");
              break;
            case 2:
              peer.pushBack("matrix/0", "X");
              break;
            case 3:
              peer.pushFront("matrix/1", "Y");
              break;
            case 4:
              peer.popBack("matrix/2");
              break;
            case 5:
              peer.wrapList("matrix/*", "wrap");
              break;
            case 6:
              peer.pushBack("matrix", { $tag: "row", $items: ["new"] });
              break;
            case 7:
              peer.popFront("matrix");
              break;
            case 8:
              peer.wrapRecord("matrix/*", "inner", "wrapRec");
              break;
            case 9:
              peer.updateTag("matrix/*", "renamed");
              break;
          }
        } catch {
          // Some operations may fail (empty list, etc.)
        }
      }
    }

    syncAll(peers);

    try {
      assertConvergence(peers, `Seed ${seed} failed`);
    } catch (e) {
      console.log(`FAILED at seed ${seed}`);
      console.log("States:");
      peers.forEach((p, i) => console.log(`  Peer ${i}:`, JSON.stringify(p.toPlain())));
      throw e;
    }
  }
});

Deno.test("Wildcard: stress test - deep wildcards with structural changes (200 seeds)", () => {
  for (let seed = 0; seed < 200; seed++) {
    const rng = seededRandom(seed + 1000);

    const doc: PlainNode = {
      $tag: "root",
      data: {
        $tag: "data",
        $items: [
          {
            $tag: "group",
            items: {
              $tag: "items",
              $items: ["a", "b"],
            },
          },
          {
            $tag: "group",
            items: {
              $tag: "items",
              $items: ["c", "d"],
            },
          },
        ],
      },
    };

    const peers = Array.from({ length: 3 }, (_, i) =>
      new Denicek(`peer${i}`, doc)
    );

    for (const peer of peers) {
      try {
        const op = Math.floor(rng() * 8);
        switch (op) {
          case 0:
            peer.set("data/*/items/*", "UPDATED");
            break;
          case 1:
            peer.pushBack("data/0/items", "new");
            break;
          case 2:
            peer.wrapList("data/*/items", "wrapper");
            break;
          case 3:
            peer.popBack("data");
            break;
          case 4:
            peer.rename("data/0", "items", "renamed");
            break;
          case 5:
            peer.wrapRecord("data/*", "inner", "wrap");
            break;
          case 6:
            peer.pushFront("data/1/items", "frontNew");
            break;
          case 7:
            peer.wrapList("data/*/items/*", "deepWrap");
            break;
        }
      } catch {
        // May fail
      }
    }

    syncAll(peers);
    assertConvergence(peers, `Seed ${seed} diverged`);
  }
});

Deno.test("Wildcard: stress test - interleaved sync with wildcard ops (200 seeds)", () => {
  for (let seed = 0; seed < 200; seed++) {
    const rng = seededRandom(seed + 5000);

    const doc: PlainNode = {
      $tag: "root",
      items: {
        $tag: "items",
        $items: [
          { $tag: "row", name: "r1", cells: { $tag: "cells", $items: ["a", "b"] } },
          { $tag: "row", name: "r2", cells: { $tag: "cells", $items: ["c", "d"] } },
          { $tag: "row", name: "r3", cells: { $tag: "cells", $items: ["e", "f"] } },
        ],
      },
    };

    const peers = Array.from({ length: 3 }, (_, i) =>
      new Denicek(`peer${i}`, doc)
    );

    // Multiple rounds of ops + partial syncs
    for (let round = 0; round < 3; round++) {
      for (const peer of peers) {
        try {
          const op = Math.floor(rng() * 12);
          switch (op) {
            case 0: peer.set("items/*/cells/*", "UPDATED"); break;
            case 1: peer.set("items/*/name", "updated"); break;
            case 2: peer.pushBack("items/0/cells", "new"); break;
            case 3: peer.pushFront("items/1/cells", "front"); break;
            case 4: peer.popBack("items/2/cells"); break;
            case 5: peer.wrapList("items/*", "listW"); break;
            case 6: peer.wrapRecord("items/*/cells", "w", "recW"); break;
            case 7: peer.pushBack("items", { $tag: "row", name: "new", cells: { $tag: "cells", $items: ["x"] } }); break;
            case 8: peer.popFront("items"); break;
            case 9: peer.rename("items/0", "name", "label"); break;
            case 10: peer.wrapList("items/*/cells/*", "cellW"); break;
            case 11: peer.updateTag("items/*", "newTag"); break;
          }
        } catch {
          // May fail
        }
      }

      // Partial sync between random pair after each round
      const a = Math.floor(rng() * 3);
      const b = (a + 1 + Math.floor(rng() * 2)) % 3;
      sync(peers[a]!, peers[b]!);
    }

    // Full sync
    syncAll(peers);

    try {
      assertConvergence(peers, `Seed ${seed} failed`);
    } catch (e) {
      console.log(`INTERLEAVED SYNC FAILED at seed ${seed}`);
      console.log("States:");
      peers.forEach((p, i) => console.log(`  Peer ${i}:`, JSON.stringify(p.toPlain())));
      throw e;
    }
  }
});

Deno.test("Wildcard: stress test - records with wildcard field access (200 seeds)", () => {
  for (let seed = 0; seed < 200; seed++) {
    const rng = seededRandom(seed + 9000);

    const doc: PlainNode = {
      $tag: "root",
      groups: {
        $tag: "groups",
        $items: [
          { $tag: "group", a: "v1", b: "v2", c: { $tag: "inner", x: "deep1" } },
          { $tag: "group", a: "v3", b: "v4", c: { $tag: "inner", x: "deep2" } },
        ],
      },
    };

    const peers = Array.from({ length: 3 }, (_, i) =>
      new Denicek(`peer${i}`, doc)
    );

    for (const peer of peers) {
      const numOps = Math.floor(rng() * 3) + 1;
      for (let j = 0; j < numOps; j++) {
        try {
          const op = Math.floor(rng() * 10);
          switch (op) {
            case 0: peer.set("groups/*/a", "UPDATED"); break;
            case 1: peer.set("groups/*/b", "updated"); break;
            case 2: peer.set("groups/*/c/x", "UPDATED"); break;
            case 3: peer.add("groups/0", "newField", "val"); break;
            case 4: peer.delete("groups/1", "b"); break;
            case 5: peer.rename("groups/0", "a", "alpha"); break;
            case 6: peer.wrapRecord("groups/*", "wrapped", "wrapper"); break;
            case 7: peer.wrapRecord("groups/*/c", "deep", "deepW"); break;
            case 8: peer.pushBack("groups", { $tag: "group", a: "new", b: "new", c: { $tag: "inner", x: "new" } }); break;
            case 9: peer.popFront("groups"); break;
          }
        } catch {
          // May fail
        }
      }
    }

    syncAll(peers);
    assertConvergence(peers, `Seed ${seed} diverged`);
  }
});

// ══════════════════════════════════════════════════════════════════════
// TEST: Edge cases
// ══════════════════════════════════════════════════════════════════════

Deno.test("Wildcard: empty list with wildcard selector", () => {
  const doc: PlainNode = {
    $tag: "root",
    items: { $tag: "items", $items: [] as PlainNode[] },
  };

  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Alice tries to edit empty list with wildcard (should be no-op or throw)
  try {
    alice.set("items/*", "UPDATED");
  } catch {
    // Expected - no matches
  }

  // Bob adds items
  bob.pushBack("items", "a");
  bob.pushBack("items", "b");

  syncAll([alice, bob]);
  assertConvergence([alice, bob]);
});

Deno.test("Wildcard: single item list with */*", () => {
  const doc: PlainNode = {
    $tag: "root",
    outer: {
      $tag: "outer",
      $items: [
        { $tag: "inner", $items: ["only"] },
      ],
    },
  };

  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.set("outer/*/*", "UPDATED");
  bob.popBack("outer/0");

  syncAll([alice, bob]);
  assertConvergence([alice, bob]);
});

console.log("Multi-wildcard concurrent fuzz tests loaded.");
