/**
 * Advanced CRDT Fuzz Tests - Best Practices Implementation
 *
 * Implements techniques from:
 * - Ditto/wombat.me: stateful property testing with shrinking
 * - ottypes/fuzzer: sync-as-operation, balanced growth/shrink
 * - MET paper: sync order permutation
 *
 * Run: deno test core_fuzz_advanced.ts --allow-all
 */

import fc from "npm:fast-check";
import { assertEquals, assert } from "@std/assert";
import { Denicek, type PlainNode, type PrimitiveValue } from "./core.ts";

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

function sync(a: Denicek, b: Denicek): void {
  const af = a.frontiers, bf = b.frontiers;
  for (const e of a.eventsSince(bf)) b.applyRemote(e);
  for (const e of b.eventsSince(af)) a.applyRemote(e);
}

function syncAll(peers: Denicek[]): void {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < peers.length; i++) {
      for (let j = i + 1; j < peers.length; j++) {
        sync(peers[i]!, peers[j]!);
      }
    }
  }
}

function assertConvergence(peers: Denicek[]): void {
  const states = peers.map(p => JSON.stringify(p.toPlain()));
  for (let i = 1; i < states.length; i++) {
    assertEquals(states[0], states[i], `Peer 0 and ${i} diverged`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// #1: SYNC-AS-OPERATION
// Operations are a union of edits + sync(a,b), all randomly interleaved.
// fast-check provides automatic shrinking on failure.
// ══════════════════════════════════════════════════════════════════════

// Operation ADT: either an edit on a peer, or a sync between two peers
type Op =
  | { kind: "edit"; peer: number; op: EditOp }
  | { kind: "sync"; a: number; b: number };

type EditOp =
  | { type: "pushBack"; target: string; value: PlainNode }
  | { type: "pushFront"; target: string; value: PlainNode }
  | { type: "popBack"; target: string }
  | { type: "popFront"; target: string }
  | { type: "add"; target: string; field: string; value: PlainNode }
  | { type: "delete"; target: string; field: string }
  | { type: "rename"; target: string; from: string; to: string }
  | { type: "set"; target: string; value: PrimitiveValue }
  | { type: "updateTag"; target: string; tag: string }
  | { type: "wrapRecord"; target: string; field: string; tag: string }
  | { type: "wrapList"; target: string; tag: string };

const NUM_PEERS = 3;

function applyEditOp(peer: Denicek, op: EditOp): void {
  switch (op.type) {
    case "pushBack": peer.pushBack(op.target, op.value); break;
    case "pushFront": peer.pushFront(op.target, op.value); break;
    case "popBack": peer.popBack(op.target); break;
    case "popFront": peer.popFront(op.target); break;
    case "add": peer.add(op.target, op.field, op.value); break;
    case "delete": peer.delete(op.target, op.field); break;
    case "rename": peer.rename(op.target, op.from, op.to); break;
    case "set": peer.set(op.target, op.value); break;
    case "updateTag": peer.updateTag(op.target, op.tag); break;
    case "wrapRecord": peer.wrapRecord(op.target, op.field, op.tag); break;
    case "wrapList": peer.wrapList(op.target, op.tag); break;
  }
}

// ── Arbitraries for list-of-records doc ──────────────────────────────

const arbPeerIdx = fc.nat({ max: NUM_PEERS - 1 });

const arbField = fc.constantFrom("a", "b", "c", "d", "e");
const arbTag = fc.constantFrom("t1", "t2", "t3");
const arbVal = fc.constantFrom("v1", "v2", "v3", "v4", "v5");

const arbListEditOp: fc.Arbitrary<EditOp> = fc.oneof(
  // List ops on items
  { weight: 3, arbitrary: arbVal.map(v => ({ type: "pushBack" as const, target: "items", value: v })) },
  { weight: 3, arbitrary: arbVal.map(v => ({ type: "pushFront" as const, target: "items", value: v })) },
  { weight: 2, arbitrary: fc.constant({ type: "popBack" as const, target: "items" }) },
  { weight: 2, arbitrary: fc.constant({ type: "popFront" as const, target: "items" }) },
  // Primitive edits on items/*
  { weight: 2, arbitrary: fc.constant({ type: "set" as const, target: "items/*", value: "UPDATED" as PrimitiveValue }) },
  { weight: 2, arbitrary: fc.constant({ type: "set" as const, target: "items/*", value: "updated" as PrimitiveValue }) },
  // Structural
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "wrapList" as const, target: "items/*", tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "updateTag" as const, target: "items", tag: t })) },
);

const arbListOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("edit" as const), peer: arbPeerIdx, op: arbListEditOp }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("sync" as const), a: arbPeerIdx, b: arbPeerIdx }).filter(o => o.a !== o.b) },
);

// ── Arbitraries for record-with-fields doc ──────────────────────────

const arbRecordEditOp: fc.Arbitrary<EditOp> = fc.oneof(
  // Field ops
  { weight: 3, arbitrary: fc.tuple(arbField, arbVal).map(([f, v]) => ({ type: "add" as const, target: "data", field: f, value: v })) },
  { weight: 2, arbitrary: arbField.map(f => ({ type: "delete" as const, target: "data", field: f })) },
  { weight: 2, arbitrary: fc.tuple(arbField, arbField).filter(([a, b]) => a !== b).map(([f, t]) => ({ type: "rename" as const, target: "data", from: f, to: t })) },
  // Structural
  { weight: 1, arbitrary: fc.tuple(arbField, arbTag).map(([f, t]) => ({ type: "wrapRecord" as const, target: "data", field: f, tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "wrapList" as const, target: "data", tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "updateTag" as const, target: "data", tag: t })) },
);

const arbRecordOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("edit" as const), peer: arbPeerIdx, op: arbRecordEditOp }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("sync" as const), a: arbPeerIdx, b: arbPeerIdx }).filter(o => o.a !== o.b) },
);

// ── Arbitraries for nested list-of-records doc ──────────────────────

const arbNestedEditOp: fc.Arbitrary<EditOp> = fc.oneof(
  // List ops
  { weight: 2, arbitrary: fc.constant({ type: "pushBack" as const, target: "rows", value: { $tag: "row", name: "new", val: "x" } as PlainNode }) },
  { weight: 2, arbitrary: fc.constant({ type: "pushFront" as const, target: "rows", value: { $tag: "row", name: "new", val: "x" } as PlainNode }) },
  { weight: 1, arbitrary: fc.constant({ type: "popBack" as const, target: "rows" }) },
  { weight: 1, arbitrary: fc.constant({ type: "popFront" as const, target: "rows" }) },
  // Wildcard record field edits
  { weight: 2, arbitrary: fc.constant({ type: "set" as const, target: "rows/*/name", value: "UPDATED" as PrimitiveValue }) },
  { weight: 2, arbitrary: fc.constant({ type: "set" as const, target: "rows/*/val", value: "updated" as PrimitiveValue }) },
  // Wildcard field add/delete/rename
  { weight: 2, arbitrary: fc.tuple(arbField, arbVal).map(([f, v]) => ({ type: "add" as const, target: "rows/*", field: f, value: v })) },
  { weight: 1, arbitrary: arbField.map(f => ({ type: "delete" as const, target: "rows/*", field: f })) },
  { weight: 1, arbitrary: fc.tuple(arbField, arbField).filter(([a, b]) => a !== b).map(([f, t]) => ({ type: "rename" as const, target: "rows/*", from: f, to: t })) },
  // Structural wraps on wildcard
  { weight: 1, arbitrary: fc.tuple(arbField, arbTag).map(([f, t]) => ({ type: "wrapRecord" as const, target: "rows/*", field: f, tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "wrapList" as const, target: "rows/*", tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "updateTag" as const, target: "rows/*", tag: t })) },
);

const arbNestedOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("edit" as const), peer: arbPeerIdx, op: arbNestedEditOp }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("sync" as const), a: arbPeerIdx, b: arbPeerIdx }).filter(o => o.a !== o.b) },
);

// ── Generic runner ──────────────────────────────────────────────────

function runOps(doc: PlainNode, ops: Op[]): Denicek[] {
  const peers = Array.from({ length: NUM_PEERS }, (_, i) =>
    new Denicek(`peer${i}`, doc)
  );

  for (const op of ops) {
    if (op.kind === "sync") {
      sync(peers[op.a]!, peers[op.b]!);
    } else {
      try {
        applyEditOp(peers[op.peer]!, op.op);
      } catch {
        // Edit may fail (empty list, missing field, etc.)
      }
    }
  }

  return peers;
}

// ══════════════════════════════════════════════════════════════════════
// TEST SUITE 1: Sync-as-operation with shrinking
// ══════════════════════════════════════════════════════════════════════

Deno.test("Shrink: list ops + interleaved sync converge", () => {
  const doc: PlainNode = {
    $tag: "root",
    items: { $tag: "items", $items: ["a", "b", "c"] },
  };

  fc.assert(
    fc.property(
      fc.array(arbListOp, { minLength: 5, maxLength: 50 }),
      (ops) => {
        const peers = runOps(doc, ops);
        syncAll(peers);
        assertConvergence(peers);
      }
    ),
    { numRuns: 2000 }
  );
});

Deno.test("Shrink: record ops + interleaved sync converge", () => {
  const doc: PlainNode = {
    $tag: "root",
    data: { $tag: "data", a: "1", b: "2", c: "3" },
  };

  fc.assert(
    fc.property(
      fc.array(arbRecordOp, { minLength: 5, maxLength: 50 }),
      (ops) => {
        const peers = runOps(doc, ops);
        syncAll(peers);
        assertConvergence(peers);
      }
    ),
    { numRuns: 2000 }
  );
});

Deno.test("Shrink: nested list-of-records + wildcard + interleaved sync converge", () => {
  const doc: PlainNode = {
    $tag: "root",
    rows: {
      $tag: "rows",
      $items: [
        { $tag: "row", name: "alice", val: "x" },
        { $tag: "row", name: "bob", val: "y" },
        { $tag: "row", name: "carol", val: "z" },
      ],
    },
  };

  fc.assert(
    fc.property(
      fc.array(arbNestedOp, { minLength: 5, maxLength: 50 }),
      (ops) => {
        const peers = runOps(doc, ops);
        syncAll(peers);
        assertConvergence(peers);
      }
    ),
    { numRuns: 2000 }
  );
});

Deno.test("Shrink: long operation sequences converge", () => {
  const doc: PlainNode = {
    $tag: "root",
    items: { $tag: "items", $items: ["a", "b"] },
  };

  fc.assert(
    fc.property(
      fc.array(arbListOp, { minLength: 50, maxLength: 120 }),
      (ops) => {
        const peers = runOps(doc, ops);
        syncAll(peers);
        assertConvergence(peers);
      }
    ),
    { numRuns: 500 }
  );
});

// ══════════════════════════════════════════════════════════════════════
// TEST SUITE 2: Intent preservation
// After sync, non-conflicting edits from each peer must be present.
// ══════════════════════════════════════════════════════════════════════

Deno.test("Intent: non-conflicting adds are all preserved", () => {
  fc.assert(
    fc.property(
      fc.array(arbField, { minLength: NUM_PEERS, maxLength: NUM_PEERS }).filter(
        fields => new Set(fields).size === NUM_PEERS // all distinct
      ),
      fc.array(arbVal, { minLength: NUM_PEERS, maxLength: NUM_PEERS }),
      (fields, values) => {
        const doc: PlainNode = { $tag: "root", data: { $tag: "data" } };
        const peers = Array.from({ length: NUM_PEERS }, (_, i) =>
          new Denicek(`peer${i}`, doc)
        );

        // Each peer adds a distinct field
        for (let i = 0; i < NUM_PEERS; i++) {
          peers[i]!.add("data", fields[i]!, values[i]!);
        }

        syncAll(peers);
        assertConvergence(peers);

        // All distinct fields must be present
        const result = peers[0]!.toPlain() as { data: Record<string, unknown> };
        for (let i = 0; i < NUM_PEERS; i++) {
          assert(
            fields[i]! in result.data,
            `Field '${fields[i]}' from peer ${i} was lost`
          );
        }
      }
    ),
    { numRuns: 1000 }
  );
});

Deno.test("Intent: non-conflicting push-backs are all preserved", () => {
  fc.assert(
    fc.property(
      fc.array(arbVal, { minLength: NUM_PEERS, maxLength: NUM_PEERS }),
      (values) => {
        const doc: PlainNode = {
          $tag: "root",
          items: { $tag: "items", $items: [] as PlainNode[] },
        };

        const peers = Array.from({ length: NUM_PEERS }, (_, i) =>
          new Denicek(`peer${i}`, doc)
        );

        // Each peer pushes a value
        for (let i = 0; i < NUM_PEERS; i++) {
          peers[i]!.pushBack("items", values[i]!);
        }

        syncAll(peers);
        assertConvergence(peers);

        // All values must be in the list
        const result = peers[0]!.toPlain() as { items: { $items: unknown[] } };
        for (let i = 0; i < NUM_PEERS; i++) {
          assert(
            result.items.$items.includes(values[i]),
            `Value '${values[i]}' from peer ${i} was lost`
          );
        }
      }
    ),
    { numRuns: 1000 }
  );
});

Deno.test("Intent: set on untouched field survives concurrent structural changes", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("UPDATED", "updated") as fc.Arbitrary<PrimitiveValue>,
      (value) => {
        const doc: PlainNode = {
          $tag: "root",
          data: { $tag: "data", name: "alice", other: "untouched" },
        };

        const alice = new Denicek("alice", doc);
        const bob = new Denicek("bob", doc);

        // Alice sets 'name'
        alice.set("data/name", value);

        // Bob adds a new field (non-conflicting)
        bob.add("data", "extra", "value");

        syncAll([alice, bob]);
        assertConvergence([alice, bob]);

        // Alice's set must survive
        const result = alice.toPlain() as { data: Record<string, unknown> };
        assertEquals(result.data.name, value, "Alice's set was lost");
        // Bob's add must survive
        assertEquals(result.data.extra, "value", "Bob's add was lost");
      }
    ),
    { numRuns: 500 }
  );
});

// ══════════════════════════════════════════════════════════════════════
// TEST SUITE 3: Sync order permutation
// For a fixed set of operations, try all delivery orderings.
// ══════════════════════════════════════════════════════════════════════

/**
 * Given N peers that each made local edits, try all N! orderings
 * of pairwise sync and assert they all converge to the same state.
 */
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      result.push([arr[i]!, ...perm]);
    }
  }
  return result;
}

function allSyncOrdersConverge(
  doc: PlainNode,
  edits: ((peer: Denicek) => void)[],
): void {
  // Generate all pairs for syncing
  const peerCount = edits.length;
  const pairs: [number, number][] = [];
  for (let i = 0; i < peerCount; i++) {
    for (let j = i + 1; j < peerCount; j++) {
      pairs.push([i, j]);
    }
  }

  const allPerms = permutations(pairs);
  let referenceState: string | null = null;

  for (const syncOrder of allPerms) {
    const peers = Array.from({ length: peerCount }, (_, i) =>
      new Denicek(`peer${i}`, doc)
    );

    // Apply edits
    for (let i = 0; i < peerCount; i++) {
      try {
        edits[i]!(peers[i]!);
      } catch {
        // Edit may fail
      }
    }

    // Sync in this specific order
    for (const [a, b] of syncOrder) {
      sync(peers[a]!, peers[b]!);
    }
    // Second pass for full convergence
    for (const [a, b] of syncOrder) {
      sync(peers[a]!, peers[b]!);
    }

    assertConvergence(peers);

    const state = JSON.stringify(peers[0]!.toPlain());
    if (referenceState === null) {
      referenceState = state;
    } else {
      assertEquals(state, referenceState,
        `Different sync order produced different state: ${JSON.stringify(syncOrder)}`
      );
    }
  }
}

Deno.test("SyncOrder: concurrent adds converge regardless of sync order", () => {
  fc.assert(
    fc.property(
      fc.tuple(arbField, arbField, arbField).filter(([a, b, c]) => a !== b && b !== c && a !== c),
      fc.tuple(arbVal, arbVal, arbVal),
      (fields, values) => {
        const doc: PlainNode = { $tag: "root", data: { $tag: "data" } };
        allSyncOrdersConverge(doc, [
          (p) => p.add("data", fields[0], values[0]),
          (p) => p.add("data", fields[1], values[1]),
          (p) => p.add("data", fields[2], values[2]),
        ]);
      }
    ),
    { numRuns: 500 }
  );
});

Deno.test("SyncOrder: concurrent list pushes converge regardless of sync order", () => {
  fc.assert(
    fc.property(
      fc.tuple(arbVal, arbVal, arbVal),
      (values) => {
        const doc: PlainNode = {
          $tag: "root",
          items: { $tag: "items", $items: ["initial"] },
        };
        allSyncOrdersConverge(doc, [
          (p) => p.pushBack("items", values[0]),
          (p) => p.pushFront("items", values[1]),
          (p) => p.pushBack("items", values[2]),
        ]);
      }
    ),
    { numRuns: 500 }
  );
});

Deno.test("SyncOrder: concurrent structural ops converge regardless of sync order", () => {
  const doc: PlainNode = {
    $tag: "root",
    data: { $tag: "data", name: "alice", age: "30" },
  };

  allSyncOrdersConverge(doc, [
    (p) => p.rename("data", "name", "fullName"),
    (p) => p.wrapRecord("data", "inner", "wrapper"),
    (p) => p.add("data", "extra", "value"),
  ]);
});

Deno.test("SyncOrder: concurrent wildcard edits + structural changes converge", () => {
  fc.assert(
    fc.property(
      arbTag,
      (tag) => {
        const doc: PlainNode = {
          $tag: "root",
          items: {
            $tag: "items",
            $items: [
              { $tag: "item", val: "a" },
              { $tag: "item", val: "b" },
            ],
          },
        };

        allSyncOrdersConverge(doc, [
          (p) => p.set("items/*/val", "UPDATED"),
          (p) => p.wrapList("items/*", tag),
          (p) => p.pushBack("items", { $tag: "item", val: "c" }),
        ]);
      }
    ),
    { numRuns: 500 }
  );
});

Deno.test("SyncOrder: add + delete + rename on same record converge", () => {
  fc.assert(
    fc.property(
      arbField.filter(f => f !== "a" && f !== "b"),
      arbVal,
      (newField, newVal) => {
        const doc: PlainNode = {
          $tag: "root",
          data: { $tag: "data", a: "1", b: "2", c: "3" },
        };

        allSyncOrdersConverge(doc, [
          (p) => p.add("data", newField, newVal),
          (p) => p.delete("data", "a"),
          (p) => p.rename("data", "b", "beta"),
        ]);
      }
    ),
    { numRuns: 500 }
  );
});

Deno.test("SyncOrder: push + pop + wildcard edit converge", () => {
  const doc: PlainNode = {
    $tag: "root",
    items: { $tag: "items", $items: ["a", "b", "c", "d"] },
  };

  allSyncOrdersConverge(doc, [
    (p) => p.pushFront("items", "front"),
    (p) => p.popBack("items"),
    (p) => p.set("items/*", "UPDATED"),
  ]);
});

// ══════════════════════════════════════════════════════════════════════
// TEST SUITE 4: Out-of-order event delivery
// Events are shuffled before delivery to test causal buffering.
// ══════════════════════════════════════════════════════════════════════

Deno.test("OutOfOrder: shuffled event delivery still converges", () => {
  fc.assert(
    fc.property(
      fc.array(arbRecordOp.filter(o => o.kind === "edit"), { minLength: 3, maxLength: 15 }),
      fc.nat({ max: 99999 }),
      (ops, seed) => {
        const doc: PlainNode = {
          $tag: "root",
          data: { $tag: "data", a: "1", b: "2", c: "3" },
        };

        // Apply ops to separate peers (no sync yet)
        const peers = Array.from({ length: NUM_PEERS }, (_, i) =>
          new Denicek(`peer${i}`, doc)
        );

        for (const op of ops) {
          if (op.kind === "edit") {
            try { applyEditOp(peers[op.peer]!, op.op); } catch { /* skip */ }
          }
        }

        // Collect all events from all peers
        const allEvents: { from: number; event: ReturnType<Denicek["drain"]>[number] }[] = [];
        for (let i = 0; i < NUM_PEERS; i++) {
          for (const ev of peers[i]!.drain()) {
            allEvents.push({ from: i, event: ev });
          }
        }

        // Create fresh peers and deliver events in shuffled order
        const receivers = Array.from({ length: NUM_PEERS }, (_, i) =>
          new Denicek(`peer${i}`, doc)
        );

        // Re-apply local events first (each peer's own events)
        for (const { from, event } of allEvents) {
          receivers[from]!.applyRemote(event);
        }

        // Shuffle remote events using seeded random
        let s = seed;
        const shuffled = [...allEvents];
        for (let i = shuffled.length - 1; i > 0; i--) {
          s = (s * 1103515245 + 12345) & 0x7fffffff;
          const j = s % (i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
        }

        // Deliver all events (shuffled) to all peers
        for (const { event } of shuffled) {
          for (let i = 0; i < NUM_PEERS; i++) {
            receivers[i]!.applyRemote(event);
          }
        }

        assertConvergence(receivers);
      }
    ),
    { numRuns: 1000 }
  );
});

// ══════════════════════════════════════════════════════════════════════
// TEST SUITE 5: Conflicting structural ops
// Multiple peers do structural ops on the same path.
// ══════════════════════════════════════════════════════════════════════

Deno.test("SyncOrder: concurrent rename + rename on same field", () => {
  fc.assert(
    fc.property(
      arbField,
      arbField,
      (to1, to2) => {
        const doc: PlainNode = {
          $tag: "root",
          data: { $tag: "data", a: "alice", b: "x" },
        };

        allSyncOrdersConverge(doc, [
          (p) => p.rename("data", "a", to1),
          (p) => p.rename("data", "a", to2),
          (p) => p.set("data/b", "UPDATED"),
        ]);
      }
    ),
    { numRuns: 500 }
  );
});

Deno.test("SyncOrder: concurrent wrap + wrap on same target", () => {
  fc.assert(
    fc.property(
      fc.tuple(arbField, arbTag),
      fc.tuple(arbField, arbTag),
      arbTag,
      ([f1, t1], [f2, t2], t3) => {
        const doc: PlainNode = {
          $tag: "root",
          data: { $tag: "data", val: "x" },
        };

        allSyncOrdersConverge(doc, [
          (p) => p.wrapRecord("data", f1, t1),
          (p) => p.wrapRecord("data", f2, t2),
          (p) => p.wrapList("data", t3),
        ]);
      }
    ),
    { numRuns: 500 }
  );
});

Deno.test("SyncOrder: concurrent delete + rename + wrap on same field", () => {
  fc.assert(
    fc.property(
      arbField,
      fc.tuple(arbField, arbTag),
      (newName, [wf, wt]) => {
        const doc: PlainNode = {
          $tag: "root",
          data: { $tag: "data", a: "x", b: "y" },
        };

        allSyncOrdersConverge(doc, [
          (p) => p.delete("data", "a"),
          (p) => p.rename("data", "a", newName),
          (p) => p.wrapRecord("data", wf, wt),
        ]);
      }
    ),
    { numRuns: 500 }
  );
});

Deno.test("SyncOrder: concurrent copy + edit + add", () => {
  fc.assert(
    fc.property(
      arbVal,
      (val) => {
        const doc: PlainNode = {
          $tag: "root",
          data: { $tag: "data", a: "original", b: "old" },
        };

        allSyncOrdersConverge(doc, [
          (p) => p.copy("data/b", "data/a"),
          (p) => p.set("data/a", "UPDATED"),
          (p) => p.add("data", "c", val),
        ]);
      }
    ),
    { numRuns: 500 }
  );
});

// ══════════════════════════════════════════════════════════════════════
// TEST SUITE 6: Mixed wildcard structural + sync-as-op (the big one)
// ══════════════════════════════════════════════════════════════════════

const arbMixedEditOp: fc.Arbitrary<EditOp> = fc.oneof(
  // List ops
  { weight: 2, arbitrary: arbVal.map(v => ({ type: "pushBack" as const, target: "rows", value: { $tag: "row", a: v, b: "init" } as PlainNode })) },
  { weight: 2, arbitrary: arbVal.map(v => ({ type: "pushFront" as const, target: "rows", value: { $tag: "row", a: v, b: "init" } as PlainNode })) },
  { weight: 1, arbitrary: fc.constant({ type: "popBack" as const, target: "rows" }) },
  { weight: 1, arbitrary: fc.constant({ type: "popFront" as const, target: "rows" }) },
  // Wildcard primitive edits
  { weight: 2, arbitrary: fc.constant({ type: "set" as const, target: "rows/*/a", value: "UPDATED" as PrimitiveValue }) },
  { weight: 2, arbitrary: fc.constant({ type: "set" as const, target: "rows/*/b", value: "updated" as PrimitiveValue }) },
  // Wildcard field ops
  { weight: 2, arbitrary: fc.tuple(arbField, arbVal).map(([f, v]) => ({ type: "add" as const, target: "rows/*", field: f, value: v })) },
  { weight: 1, arbitrary: arbField.map(f => ({ type: "delete" as const, target: "rows/*", field: f })) },
  { weight: 1, arbitrary: fc.tuple(arbField, arbField).filter(([x, y]) => x !== y).map(([f, t]) => ({ type: "rename" as const, target: "rows/*", from: f, to: t })) },
  // Structural wraps
  { weight: 1, arbitrary: fc.tuple(arbField, arbTag).map(([f, t]) => ({ type: "wrapRecord" as const, target: "rows/*", field: f, tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "wrapList" as const, target: "rows/*", tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "updateTag" as const, target: "rows/*", tag: t })) },
  // Non-wildcard structural ops
  { weight: 1, arbitrary: fc.tuple(arbField, arbTag).map(([f, t]) => ({ type: "wrapRecord" as const, target: "rows", field: f, tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "wrapList" as const, target: "rows", tag: t })) },
);

const arbMixedOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("edit" as const), peer: arbPeerIdx, op: arbMixedEditOp }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("sync" as const), a: arbPeerIdx, b: arbPeerIdx }).filter(o => o.a !== o.b) },
);

Deno.test("Shrink: mixed wildcard + structural + sync-as-op converge", () => {
  const doc: PlainNode = {
    $tag: "root",
    rows: {
      $tag: "rows",
      $items: [
        { $tag: "row", a: "x", b: "y" },
        { $tag: "row", a: "z", b: "w" },
      ],
    },
  };

  fc.assert(
    fc.property(
      fc.array(arbMixedOp, { minLength: 5, maxLength: 60 }),
      (ops) => {
        const peers = runOps(doc, ops);
        syncAll(peers);
        assertConvergence(peers);
      }
    ),
    { numRuns: 2000 }
  );
});

console.log("Advanced fuzz tests loaded.");
