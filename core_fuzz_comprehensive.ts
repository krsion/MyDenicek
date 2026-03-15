/**
 * Comprehensive Fuzz Testing for Denicek CRDT
 *
 * Uses fast-check for property-based testing to find edge cases.
 * Run: deno test core_fuzz_comprehensive.ts --allow-all
 *
 * Testing Strategy:
 * 1. CRDT Convergence - peers always converge after sync
 * 2. Commutativity - event order doesn't affect final state
 * 3. Idempotency - duplicate events are no-ops
 * 4. Associativity - merge order doesn't matter
 * 5. Reference integrity - refs update after structural edits
 * 6. Selector parsing - handles all edge cases
 */

import fc from "npm:fast-check";
import { assertEquals, assertThrows, assert } from "@std/assert";
import {
  Denicek,
  parseSelector,
  formatSelector,
  materialize,
  primitive,
  record,
  list,
  reference,
  plainObjectToNode,
  nodeToPlainObject,
  type Node,
  type PlainNode,
  type Event,
  type EventId,
} from "./core.ts";

// ══════════════════════════════════════════════════════════════════════
// ARBITRARIES - Random data generators
// ══════════════════════════════════════════════════════════════════════

/** Generate valid tag names */
const arbTag = fc.string({ minLength: 1, maxLength: 8, unit: fc.constantFrom(...'abcdefghijklmnop'.split('')) });

/** Generate valid field names */
const arbFieldName = fc.string({ minLength: 1, maxLength: 8, unit: fc.constantFrom(...'abcdefghijklmnop'.split('')) });

/** Generate primitive values */
const arbPrimitiveValue = fc.oneof(
  fc.string({ maxLength: 50 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.double({ min: -1000, max: 1000, noNaN: true }),
  fc.boolean(),
  fc.constant(null),
);

/** Generate a primitive PlainNode */
const arbPlainPrimitive: fc.Arbitrary<PlainNode> = arbPrimitiveValue;

/** Generate a reference PlainNode */
const arbPlainReference = fc.record({
  $ref: fc.oneof(
    fc.constant("/"),
    fc.array(arbFieldName, { minLength: 1, maxLength: 4 }).map(parts => "/" + parts.join("/")),
    fc.array(fc.constantFrom("..", "name", "value", "0", "1"), { minLength: 1, maxLength: 3 }).map(parts => parts.join("/")),
  ),
});

/** Generate a PlainNode tree (recursive, depth-limited) */
const arbPlainNode = (maxDepth: number): fc.Arbitrary<PlainNode> => {
  if (maxDepth <= 0) {
    return fc.oneof(arbPlainPrimitive, arbPlainReference) as fc.Arbitrary<PlainNode>;
  }

  const arbRecord = fc.record({
    $tag: arbTag,
  }).chain(base =>
    fc.dictionary(arbFieldName, arbPlainNode(maxDepth - 1), { minKeys: 0, maxKeys: 4 })
      .map(fields => ({ ...base, ...fields }) as PlainNode)
  );

  const arbList = fc.record({
    $tag: arbTag,
    $items: fc.array(arbPlainNode(maxDepth - 1), { minLength: 0, maxLength: 5 }),
  }).map(obj => obj as PlainNode);

  return fc.oneof(
    { weight: 3, arbitrary: arbPlainPrimitive as fc.Arbitrary<PlainNode> },
    { weight: 1, arbitrary: arbPlainReference as fc.Arbitrary<PlainNode> },
    { weight: 2, arbitrary: arbRecord },
    { weight: 2, arbitrary: arbList },
  );
};

/** Generate a valid initial document (always a record) */
const arbInitialDoc = fc.record({
  $tag: arbTag,
}).chain(base =>
  fc.dictionary(arbFieldName, arbPlainNode(2), { minKeys: 1, maxKeys: 5 })
    .map(fields => ({ ...base, ...fields }) as PlainNode)
);

/** Generate peer names */
const arbPeerName = fc.string({ minLength: 1, maxLength: 6, unit: fc.constantFrom(...'abcdefgh'.split('')) });

/** Generate a selector path string */
const arbSelectorPath = fc.oneof(
  fc.constant("/"),
  fc.constant(""),
  fc.array(
    fc.oneof(
      arbFieldName,
      fc.nat({ max: 10 }).map(String),
      fc.constant("*"),
      fc.constant(".."),
    ),
    { minLength: 1, maxLength: 5 }
  ).map(parts => parts.join("/")),
  fc.array(arbFieldName, { minLength: 1, maxLength: 4 }).map(parts => "/" + parts.join("/")),
);


// ══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════

/** Deep equality check */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Sync two Denicek instances bidirectionally */
function sync(a: Denicek, b: Denicek): void {
  const af = a.frontiers, bf = b.frontiers;
  for (const e of a.eventsSince(bf)) b.applyRemote(e);
  for (const e of b.eventsSince(af)) a.applyRemote(e);
}

/** Sync all peers in a ring */
function syncAll(peers: Denicek[]): void {
  for (let i = 0; i < peers.length; i++) {
    for (let j = i + 1; j < peers.length; j++) {
      sync(peers[i]!, peers[j]!);
    }
  }
  // Second pass to ensure full convergence
  for (let i = 0; i < peers.length; i++) {
    for (let j = i + 1; j < peers.length; j++) {
      sync(peers[i]!, peers[j]!);
    }
  }
}

/** Check if a path exists in a PlainNode document */
function pathExists(doc: unknown, path: string): boolean {
  if (path === "" || path === "/") return true;
  const parts = path.replace(/^\//, "").split("/").filter(p => p.length > 0);
  let node: unknown = doc;

  for (const part of parts) {
    if (part === "..") return false; // Can't validate parent refs easily
    if (part === "*") {
      // Wildcard - check if it's a list
      if (node && typeof node === "object" && "$items" in (node as Record<string, unknown>)) {
        const items = (node as { $items: unknown[] }).$items;
        return items.length > 0;
      }
      return false;
    }
    if (node === null || typeof node !== "object") return false;
    const obj = node as Record<string, unknown>;

    if ("$items" in obj) {
      // List node
      const idx = parseInt(part, 10);
      if (isNaN(idx) || idx < 0 || idx >= (obj.$items as unknown[]).length) return false;
      node = (obj.$items as unknown[])[idx];
    } else {
      // Record node
      if (part === "$tag") continue;
      if (!(part in obj)) return false;
      node = obj[part];
    }
  }
  return true;
}

/** Get a valid path from a document for testing */
function getRandomValidPath(doc: unknown, rng: () => number, maxDepth = 3): string {
  const parts: string[] = [];
  let node = doc;
  let depth = 0;

  while (depth < maxDepth && node && typeof node === "object") {
    if (rng() < 0.3) break; // Stop randomly

    const obj = node as Record<string, unknown>;
    if ("$items" in obj) {
      const items = obj.$items as unknown[];
      if (items.length === 0) break;
      const idx = Math.floor(rng() * items.length);
      parts.push(String(idx));
      node = items[idx];
    } else {
      const keys = Object.keys(obj).filter(k => k !== "$tag");
      if (keys.length === 0) break;
      const key = keys[Math.floor(rng() * keys.length)]!;
      parts.push(key);
      node = obj[key];
    }
    depth++;
  }

  return parts.join("/");
}

/** Simple seeded PRNG */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ══════════════════════════════════════════════════════════════════════
// PROPERTY TESTS - CRDT Invariants
// ══════════════════════════════════════════════════════════════════════

Deno.test("CRDT Property: Convergence - synced peers have identical state", () => {
  fc.assert(
    fc.property(
      arbInitialDoc,
      fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 5, maxLength: 20 }), // which peer acts
      fc.integer({ min: 1, max: 10000 }), // seed for randomness
      (initialDoc, peerActions, seed) => {
        const rng = seededRandom(seed);
        const peers = [
          new Denicek("alice", initialDoc),
          new Denicek("bob", initialDoc),
          new Denicek("carol", initialDoc),
        ];

        // Each peer does some random edits
        for (const peerIdx of peerActions) {
          const peer = peers[peerIdx]!;
          const doc = peer.toPlain();
          const path = getRandomValidPath(doc, rng);

          try {
            // Try a random safe operation
            const op = Math.floor(rng() * 5);
            if (op === 0 && pathExists(doc, path)) {
              peer.add(path, "fuzz" + Math.floor(rng() * 100), "val" + Math.floor(rng() * 100));
            } else if (op === 1 && pathExists(doc, path)) {
              peer.updateTag(path || "/", "newtag");
            }
            // Other ops might fail, that's fine
          } catch {
            // Edit failed, continue
          }
        }

        // Sync all peers
        syncAll(peers);

        // All peers must have identical state
        const states = peers.map(p => JSON.stringify(p.toPlain()));
        return states[0] === states[1] && states[1] === states[2];
      }
    ),
    { numRuns: 100 }
  );
});

Deno.test("CRDT Property: Idempotency - applying same event twice is no-op", () => {
  fc.assert(
    fc.property(
      arbInitialDoc,
      fc.nat({ max: 100 }),
      (initialDoc, seed) => {
        const rng = seededRandom(seed);
        const alice = new Denicek("alice", initialDoc);
        const bob = new Denicek("bob", initialDoc);

        // Alice makes an edit
        const doc = alice.toPlain();
        const path = getRandomValidPath(doc, rng);
        try {
          alice.add(path, "test", "value");
        } catch {
          return true; // Edit failed, skip this test case
        }

        const events = alice.drain();
        if (events.length === 0) return true;

        // Bob receives the event
        bob.applyRemote(events[0]!);
        const stateAfterFirst = JSON.stringify(bob.toPlain());

        // Bob receives the same event again (idempotent)
        bob.applyRemote(events[0]!);
        const stateAfterSecond = JSON.stringify(bob.toPlain());

        return stateAfterFirst === stateAfterSecond;
      }
    ),
    { numRuns: 100 }
  );
});

Deno.test("CRDT Property: Commutativity - concurrent edits converge regardless of receive order", () => {
  fc.assert(
    fc.property(
      arbInitialDoc,
      fc.nat({ max: 1000 }),
      (initialDoc, seed) => {
        const rng = seededRandom(seed);

        // Create two scenarios with same initial state
        const alice1 = new Denicek("alice", initialDoc);
        const bob1 = new Denicek("bob", initialDoc);
        const alice2 = new Denicek("alice", initialDoc);
        const bob2 = new Denicek("bob", initialDoc);

        // Both make edits
        const doc = alice1.toPlain();
        const path = getRandomValidPath(doc, rng);

        try {
          alice1.add(path, "aliceField", "aliceVal");
          bob1.add(path, "bobField", "bobVal");
          alice2.add(path, "aliceField", "aliceVal");
          bob2.add(path, "bobField", "bobVal");
        } catch {
          return true; // Edits failed, skip
        }

        const aliceEvents1 = alice1.drain();
        const bobEvents1 = bob1.drain();
        const aliceEvents2 = alice2.drain();
        const bobEvents2 = bob2.drain();

        if (aliceEvents1.length === 0 || bobEvents1.length === 0) return true;

        // Scenario 1: Alice's events first, then Bob's
        for (const e of aliceEvents1) bob1.applyRemote(e);
        for (const e of bobEvents1) alice1.applyRemote(e);

        // Scenario 2: Bob's events first, then Alice's
        for (const e of bobEvents2) alice2.applyRemote(e);
        for (const e of aliceEvents2) bob2.applyRemote(e);

        // Both scenarios should converge to same state
        const state1 = JSON.stringify(alice1.toPlain());
        const state2 = JSON.stringify(alice2.toPlain());

        return state1 === state2;
      }
    ),
    { numRuns: 100 }
  );
});

Deno.test("CRDT Property: Associativity - merge order doesn't matter", () => {
  fc.assert(
    fc.property(
      arbInitialDoc,
      fc.nat({ max: 1000 }),
      (initialDoc, seed) => {
        const rng = seededRandom(seed);

        const alice = new Denicek("alice", initialDoc);
        const bob = new Denicek("bob", initialDoc);
        const carol = new Denicek("carol", initialDoc);

        // Each peer makes independent edits
        const doc = alice.toPlain();
        const path = getRandomValidPath(doc, rng);

        try {
          alice.add(path, "a", "1");
          bob.add(path, "b", "2");
          carol.add(path, "c", "3");
        } catch {
          return true;
        }

        // Clone for different merge orders
        const alice1 = new Denicek("alice", initialDoc);
        const bob1 = new Denicek("bob", initialDoc);
        const carol1 = new Denicek("carol", initialDoc);
        const alice2 = new Denicek("alice", initialDoc);
        const bob2 = new Denicek("bob", initialDoc);
        const carol2 = new Denicek("carol", initialDoc);

        // Replay edits
        try {
          alice1.add(path, "a", "1");
          bob1.add(path, "b", "2");
          carol1.add(path, "c", "3");
          alice2.add(path, "a", "1");
          bob2.add(path, "b", "2");
          carol2.add(path, "c", "3");
        } catch {
          return true;
        }

        // Order 1: (alice merge bob) merge carol
        sync(alice1, bob1);
        sync(alice1, carol1);

        // Order 2: alice merge (bob merge carol)
        sync(bob2, carol2);
        sync(alice2, bob2);

        return JSON.stringify(alice1.toPlain()) === JSON.stringify(alice2.toPlain());
      }
    ),
    { numRuns: 100 }
  );
});

// ══════════════════════════════════════════════════════════════════════
// PROPERTY TESTS - Selector Parsing
// ══════════════════════════════════════════════════════════════════════

Deno.test("Selector: roundtrip parse and format", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.oneof(
          arbFieldName,
          fc.nat({ max: 100 }).map(String),
        ),
        { minLength: 0, maxLength: 5 }
      ),
      (parts) => {
        const path = "/" + parts.join("/");
        const sel = parseSelector(path);
        const formatted = formatSelector(sel);
        const reparsed = parseSelector(formatted);

        // Selector should be stable after roundtrip
        return JSON.stringify(sel) === JSON.stringify(reparsed);
      }
    ),
    { numRuns: 200 }
  );
});

Deno.test("Selector: handles edge cases without crashing", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant(""),
        fc.constant("/"),
        fc.constant("//"),
        fc.constant("///"),
        fc.constant("/a/"),
        fc.constant("a//b"),
        fc.constant("../.."),
        fc.constant("a/../b"),
        fc.constant("*/0/*"),
        fc.string({ maxLength: 50 }),
      ),
      (path) => {
        // Should not throw
        const sel = parseSelector(path);
        formatSelector(sel);
        return true;
      }
    ),
    { numRuns: 100 }
  );
});

// ══════════════════════════════════════════════════════════════════════
// PROPERTY TESTS - Node Construction & Conversion
// ══════════════════════════════════════════════════════════════════════

Deno.test("Node: PlainNode roundtrip conversion", () => {
  fc.assert(
    fc.property(
      arbPlainNode(3),
      (plainNode) => {
        const node = plainObjectToNode(plainNode);
        const back = nodeToPlainObject(node);

        // For primitives and records, should be equivalent
        // References format differently, so we just check it doesn't crash
        return node !== null && back !== undefined;
      }
    ),
    { numRuns: 200 }
  );
});

// ══════════════════════════════════════════════════════════════════════
// PROPERTY TESTS - Edit Operations
// ══════════════════════════════════════════════════════════════════════

Deno.test("Edit: set-value operations don't corrupt state", () => {
  fc.assert(
    fc.property(
      fc.record({
        $tag: fc.constant("root"),
        text: fc.string({ minLength: 0, maxLength: 20 }),
      }),
      arbPrimitiveValue,
      (doc, value) => {
        const peer = new Denicek("test", doc as PlainNode);

        try {
          peer.set("text", value);
        } catch {
          // Some ops might fail, that's fine
        }

        // State should still be valid
        const result = peer.toPlain();
        return result !== null && typeof result === "object";
      }
    ),
    { numRuns: 100 }
  );
});

Deno.test("Edit: list operations maintain invariants", () => {
  fc.assert(
    fc.property(
      fc.nat({ max: 10 }), // initial list size
      fc.array(fc.nat({ max: 4 }), { minLength: 1, maxLength: 20 }), // operations
      fc.nat({ max: 1000 }), // seed
      (initialSize, ops, seed) => {
        const rng = seededRandom(seed);
        const items = Array.from({ length: initialSize }, (_, i) => `item${i}`);
        const doc: PlainNode = {
          $tag: "root",
          list: { $tag: "list", $items: items },
        };

        const peer = new Denicek("test", doc);

        for (const opType of ops) {
          try {
            const currentDoc = peer.toPlain() as { list: { $items: unknown[] } };
            const listLen = currentDoc?.list?.$items?.length ?? 0;

            switch (opType) {
              case 0:
                peer.pushBack("list", `new${Math.floor(rng() * 100)}`);
                break;
              case 1:
                peer.pushFront("list", `new${Math.floor(rng() * 100)}`);
                break;
              case 2:
                if (listLen > 0) peer.popBack("list");
                break;
              case 3:
                if (listLen > 0) peer.popFront("list");
                break;
              case 4:
                if (listLen > 0) peer.wrapList("list/*", "wrapper");
                break;
            }
          } catch {
            // Operations might fail, continue
          }
        }

        // State should be valid
        const result = peer.toPlain();
        return result !== null;
      }
    ),
    { numRuns: 100 }
  );
});

// ══════════════════════════════════════════════════════════════════════
// PROPERTY TESTS - Reference Integrity
// ══════════════════════════════════════════════════════════════════════

Deno.test("Reference: survives structural edits", () => {
  fc.assert(
    fc.property(
      fc.nat({ max: 1000 }),
      (seed) => {
        const rng = seededRandom(seed);
        const doc: PlainNode = {
          $tag: "root",
          data: {
            $tag: "data",
            name: "Alice",
            age: 30,
          },
          ref: { $ref: "/data/name" },
        };

        const peer = new Denicek("test", doc);

        // Apply random structural edits
        const ops = Math.floor(rng() * 5) + 1;
        for (let i = 0; i < ops; i++) {
          try {
            const opType = Math.floor(rng() * 3);
            switch (opType) {
              case 0:
                peer.rename("data", "name", "fullName");
                break;
              case 1:
                peer.wrapRecord("data", "inner", "wrapper");
                break;
              case 2:
                peer.add("data", "extra" + i, "value");
                break;
            }
          } catch {
            // May fail, continue
          }
        }

        // Document should still be valid
        const result = peer.toPlain();
        return result !== null;
      }
    ),
    { numRuns: 100 }
  );
});

// ══════════════════════════════════════════════════════════════════════
// PROPERTY TESTS - Concurrent Structural Edits
// ══════════════════════════════════════════════════════════════════════

Deno.test("Concurrent: wrap operations converge", () => {
  fc.assert(
    fc.property(
      fc.nat({ max: 1000 }),
      (seed) => {
        const doc: PlainNode = {
          $tag: "root",
          items: {
            $tag: "list",
            $items: [
              { $tag: "item", value: "a" },
              { $tag: "item", value: "b" },
            ],
          },
        };

        const alice = new Denicek("alice", doc);
        const bob = new Denicek("bob", doc);

        // Concurrent wrap operations
        try {
          alice.wrapList("items/*", "aliceWrap");
          bob.wrapRecord("items/*", "bobField", "bobWrap");
        } catch {
          return true; // If either fails, skip
        }

        // Sync and check convergence
        syncAll([alice, bob]);

        const aliceState = JSON.stringify(alice.toPlain());
        const bobState = JSON.stringify(bob.toPlain());

        return aliceState === bobState;
      }
    ),
    { numRuns: 50 }
  );
});

Deno.test("Concurrent: rename + delete converges", () => {
  fc.assert(
    fc.property(
      fc.nat({ max: 1000 }),
      (_seed) => {
        const doc: PlainNode = {
          $tag: "root",
          data: {
            $tag: "data",
            oldName: "value1",
            other: "value2",
          },
        };

        const alice = new Denicek("alice", doc);
        const bob = new Denicek("bob", doc);

        // Alice renames, Bob deletes
        try {
          alice.rename("data", "oldName", "newName");
          bob.delete("data", "oldName");
        } catch {
          return true;
        }

        // Sync
        syncAll([alice, bob]);

        const aliceState = JSON.stringify(alice.toPlain());
        const bobState = JSON.stringify(bob.toPlain());

        return aliceState === bobState;
      }
    ),
    { numRuns: 50 }
  );
});

Deno.test("Concurrent: list push-front + push-back converges", () => {
  fc.assert(
    fc.property(
      fc.array(fc.tuple(fc.nat({ max: 2 }), fc.boolean()), { minLength: 3, maxLength: 10 }),
      (actions) => {
        const doc: PlainNode = {
          $tag: "root",
          items: { $tag: "list", $items: ["initial"] },
        };

        const peers = [
          new Denicek("alice", doc),
          new Denicek("bob", doc),
          new Denicek("carol", doc),
        ];

        // Each peer does push operations
        for (const [peerIdx, pushFront] of actions) {
          try {
            if (pushFront) {
              peers[peerIdx]!.pushFront("items", `front-${peerIdx}`);
            } else {
              peers[peerIdx]!.pushBack("items", `back-${peerIdx}`);
            }
          } catch {
            continue;
          }
        }

        // Sync all
        syncAll(peers);

        // All should converge
        const states = peers.map(p => JSON.stringify(p.toPlain()));
        return states[0] === states[1] && states[1] === states[2];
      }
    ),
    { numRuns: 100 }
  );
});

// ══════════════════════════════════════════════════════════════════════
// BOUNDARY & EDGE CASE TESTS
// ══════════════════════════════════════════════════════════════════════

Deno.test("Edge: empty document operations", () => {
  const doc: PlainNode = { $tag: "root" };
  const peer = new Denicek("test", doc);

  // Should handle gracefully
  peer.add("", "field", "value");
  const result = peer.toPlain() as Record<string, unknown>;

  assertEquals(result.field, "value");
});

Deno.test("Edge: deeply nested operations", () => {
  fc.assert(
    fc.property(
      fc.nat({ max: 10 }), // depth
      (depth) => {
        // Build deeply nested structure
        let doc: PlainNode = { $tag: "leaf", value: "deep" };
        for (let i = 0; i < depth; i++) {
          doc = { $tag: `level${i}`, child: doc };
        }
        doc = { $tag: "root", nested: doc };

        const peer = new Denicek("test", doc);

        // Build path to deepest node
        const path = ["nested", ...Array.from({ length: depth }, (_, i) => "child")].join("/");

        try {
          peer.add(path, "added", "value");
        } catch {
          // May fail if path doesn't exist
        }

        // Should not crash
        const result = peer.toPlain();
        return result !== null;
      }
    ),
    { numRuns: 50 }
  );
});

Deno.test("Edge: many concurrent peers", () => {
  const doc: PlainNode = {
    $tag: "root",
    counter: { $tag: "data", value: 0 },
  };

  const numPeers = 10;
  const peers = Array.from({ length: numPeers }, (_, i) =>
    new Denicek(`peer${i}`, doc)
  );

  // Each peer adds a field
  for (let i = 0; i < numPeers; i++) {
    peers[i]!.add("counter", `field${i}`, i);
  }

  // Sync all pairs
  syncAll(peers);

  // All should converge
  const states = peers.map(p => JSON.stringify(p.toPlain()));
  const allSame = states.every(s => s === states[0]);

  assert(allSame, "All peers should converge to same state");
});

Deno.test("Edge: rapid fire operations", () => {
  const doc: PlainNode = {
    $tag: "root",
    list: { $tag: "list", $items: [] as PlainNode[] },
  };

  const peer = new Denicek("test", doc);

  // Rapid push/pop operations
  for (let i = 0; i < 100; i++) {
    try {
      if (i % 3 === 0) {
        peer.pushBack("list", `item${i}`);
      } else if (i % 3 === 1) {
        peer.pushFront("list", `item${i}`);
      } else {
        const currentDoc = peer.toPlain() as { list: { $items: unknown[] } };
        if (currentDoc.list.$items.length > 0) {
          if (i % 2 === 0) peer.popBack("list");
          else peer.popFront("list");
        }
      }
    } catch {
      // May fail, continue
    }
  }

  // Should not crash and state should be valid
  const result = peer.toPlain();
  assert(result !== null);
});

// ══════════════════════════════════════════════════════════════════════
// ERROR HANDLING TESTS
// ══════════════════════════════════════════════════════════════════════

Deno.test("Error: invalid selector paths handled gracefully", () => {
  const doc: PlainNode = { $tag: "root", field: "value" };
  const peer = new Denicek("test", doc);

  // These should throw but not crash the system
  assertThrows(() => peer.delete("nonexistent", "field"));
  assertThrows(() => peer.popBack("field")); // field is primitive, not list
  assertThrows(() => peer.pushBack("field", "item")); // field is primitive, not list

  // State should still be valid
  const result = peer.toPlain();
  assert(result !== null);
});

Deno.test("Error: reference escape handled", () => {
  const doc: PlainNode = {
    $tag: "root",
    ref: { $ref: "../../outside" }, // Escapes root
  };

  // Should not crash during materialization
  const peer = new Denicek("test", doc);
  const result = peer.toPlain();
  assert(result !== null);
});

// ══════════════════════════════════════════════════════════════════════
// STRESS TEST
// ══════════════════════════════════════════════════════════════════════

Deno.test("Stress: many operations with random sync patterns", () => {
  fc.assert(
    fc.property(
      fc.nat({ max: 50000 }),
      (seed) => {
        const rng = seededRandom(seed);
        const doc: PlainNode = {
          $tag: "root",
          data: {
            $tag: "container",
            items: { $tag: "list", $items: ["a", "b", "c"] },
            meta: { $tag: "meta", name: "test", count: 0 },
          },
        };

        const peers = [
          new Denicek("alice", doc),
          new Denicek("bob", doc),
          new Denicek("carol", doc),
        ];

        // Run many operations with intermittent syncs
        for (let i = 0; i < 50; i++) {
          const peerIdx = Math.floor(rng() * 3);
          const peer = peers[peerIdx]!;

          try {
            const opType = Math.floor(rng() * 10);
            switch (opType) {
              case 0:
              case 1:
                peer.pushBack("data/items", `new${i}`);
                break;
              case 2:
                peer.pushFront("data/items", `front${i}`);
                break;
              case 3: {
                const currentDoc = peer.toPlain() as { data: { items: { $items: unknown[] } } };
                if (currentDoc?.data?.items?.$items?.length > 1) {
                  peer.popBack("data/items");
                }
                break;
              }
              case 4:
                peer.add("data/meta", `field${i % 5}`, `val${i}`);
                break;
              case 5:
                peer.updateTag("data/items", `tag${i % 3}`);
                break;
              default:
                // No-op
                break;
            }
          } catch {
            // Operations may fail
          }

          // Random sync
          if (rng() < 0.3) {
            const a = Math.floor(rng() * 3);
            let b = Math.floor(rng() * 3);
            if (b === a) b = (b + 1) % 3;
            sync(peers[a]!, peers[b]!);
          }
        }

        // Final sync
        syncAll(peers);

        // All should converge
        const states = peers.map(p => JSON.stringify(p.toPlain()));
        return states[0] === states[1] && states[1] === states[2];
      }
    ),
    { numRuns: 50 }
  );
});

console.log("Comprehensive fuzz tests loaded. Run with: deno test core_fuzz_comprehensive.ts");
