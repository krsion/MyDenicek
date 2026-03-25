/**
 * Unified CRDT property tests
 *
 * Property-based tests using fast-check for automatic shrinking on failure.
 * Combines sync-as-operation, sync-order permutation, out-of-order delivery,
 * intent preservation, and CRDT algebraic properties.
 *
 * Run: deno test tests/core-properties.test.ts --allow-all
 */

import fc from "fast-check";
import { assertEquals, assert } from "@std/assert";
import { Denicek, type PlainNode, type PrimitiveValue } from "../core.ts";

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

function assertConvergence(peers: Denicek[], msg?: string): void {
  const states = peers.map(p => JSON.stringify(p.toPlain()));
  for (let i = 1; i < states.length; i++) {
    assertEquals(states[0], states[i], msg ?? `Peer 0 and ${i} diverged`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// OPERATION MODEL
// ══════════════════════════════════════════════════════════════════════

const NUM_PEERS = 3;

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
  | { type: "wrapList"; target: string; tag: string }
  | { type: "copy"; target: string; source: string };

type Op =
  | { kind: "edit"; peer: number; op: EditOp }
  | { kind: "sync"; a: number; b: number };

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
    case "copy": peer.copy(op.target, op.source); break;
  }
}

function runOps(doc: PlainNode, ops: Op[]): Denicek[] {
  const peers = Array.from({ length: NUM_PEERS }, (_, i) =>
    new Denicek(`peer${i}`, doc)
  );
  for (const op of ops) {
    if (op.kind === "sync") {
      sync(peers[op.a]!, peers[op.b]!);
    } else {
      try { applyEditOp(peers[op.peer]!, op.op); } catch { /* edit may fail */ }
    }
  }
  return peers;
}

// ══════════════════════════════════════════════════════════════════════
// ARBITRARIES
// ══════════════════════════════════════════════════════════════════════

const arbPeer = fc.nat({ max: NUM_PEERS - 1 });
const arbField = fc.constantFrom("a", "b", "c", "d", "e");
const arbTag = fc.constantFrom("t1", "t2", "t3");
const arbVal: fc.Arbitrary<PlainNode> = fc.constantFrom("v1", "v2", "v3", "v4", "v5");
const arbPrimVal: fc.Arbitrary<PrimitiveValue> = fc.constantFrom("v1", "v2", "v3", 42, true);

const arbSyncOp: fc.Arbitrary<Op> = fc.record({
  kind: fc.constant("sync" as const),
  a: arbPeer,
  b: arbPeer,
}).filter(o => o.a !== o.b);

// ── Flat list document ──────────────────────────────────────────────

const FLAT_LIST_DOC: PlainNode = {
  $tag: "root",
  items: { $tag: "items", $items: ["a", "b", "c"] },
};

const arbFlatListEdit: fc.Arbitrary<EditOp> = fc.oneof(
  { weight: 3, arbitrary: arbVal.map(v => ({ type: "pushBack" as const, target: "items", value: v })) },
  { weight: 3, arbitrary: arbVal.map(v => ({ type: "pushFront" as const, target: "items", value: v })) },
  { weight: 2, arbitrary: fc.constant({ type: "popBack" as const, target: "items" }) },
  { weight: 2, arbitrary: fc.constant({ type: "popFront" as const, target: "items" }) },
  { weight: 2, arbitrary: arbPrimVal.map(v => ({ type: "set" as const, target: "items/*", value: v })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "wrapList" as const, target: "items/*", tag: t })) },
  { weight: 1, arbitrary: fc.tuple(arbField, arbTag).map(([f, t]) => ({ type: "wrapRecord" as const, target: "items/*", field: f, tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "updateTag" as const, target: "items", tag: t })) },
  { weight: 1, arbitrary: fc.constant({ type: "copy" as const, target: "items/0", source: "items/1" }) },
);

const arbFlatListOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("edit" as const), peer: arbPeer, op: arbFlatListEdit }) },
  { weight: 3, arbitrary: arbSyncOp },
);

// ── Flat record document ────────────────────────────────────────────

const FLAT_RECORD_DOC: PlainNode = {
  $tag: "root",
  data: { $tag: "data", a: "1", b: "2", c: "3" },
};

const arbFlatRecordEdit: fc.Arbitrary<EditOp> = fc.oneof(
  { weight: 3, arbitrary: fc.tuple(arbField, arbVal).map(([f, v]) => ({ type: "add" as const, target: "data", field: f, value: v })) },
  { weight: 2, arbitrary: arbField.map(f => ({ type: "delete" as const, target: "data", field: f })) },
  { weight: 2, arbitrary: fc.tuple(arbField, arbField).filter(([a, b]) => a !== b).map(([f, t]) => ({ type: "rename" as const, target: "data", from: f, to: t })) },
  { weight: 2, arbitrary: fc.tuple(arbField, arbPrimVal).map(([f, v]) => ({ type: "set" as const, target: `data/${f}`, value: v })) },
  { weight: 1, arbitrary: fc.tuple(arbField, arbTag).map(([f, t]) => ({ type: "wrapRecord" as const, target: "data", field: f, tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "wrapList" as const, target: "data", tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "updateTag" as const, target: "data", tag: t })) },
  { weight: 1, arbitrary: fc.tuple(arbField, arbField).filter(([a, b]) => a !== b).map(([t, s]) => ({ type: "copy" as const, target: `data/${t}`, source: `data/${s}` })) },
);

const arbFlatRecordOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("edit" as const), peer: arbPeer, op: arbFlatRecordEdit }) },
  { weight: 3, arbitrary: arbSyncOp },
);

// ── Nested list-of-records document (the hard one) ──────────────────

const NESTED_DOC: PlainNode = {
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

const arbNestedEdit: fc.Arbitrary<EditOp> = fc.oneof(
  // List-level ops
  { weight: 2, arbitrary: fc.tuple(arbVal, arbVal).map(([n, v]) => ({ type: "pushBack" as const, target: "rows", value: { $tag: "row", name: n, val: v } as PlainNode })) },
  { weight: 2, arbitrary: fc.tuple(arbVal, arbVal).map(([n, v]) => ({ type: "pushFront" as const, target: "rows", value: { $tag: "row", name: n, val: v } as PlainNode })) },
  { weight: 1, arbitrary: fc.constant({ type: "popBack" as const, target: "rows" }) },
  { weight: 1, arbitrary: fc.constant({ type: "popFront" as const, target: "rows" }) },
  // Wildcard primitive edits
  { weight: 2, arbitrary: arbPrimVal.map(v => ({ type: "set" as const, target: "rows/*/name", value: v })) },
  { weight: 2, arbitrary: arbPrimVal.map(v => ({ type: "set" as const, target: "rows/*/val", value: v })) },
  // Wildcard field ops
  { weight: 2, arbitrary: fc.tuple(arbField, arbVal).map(([f, v]) => ({ type: "add" as const, target: "rows/*", field: f, value: v })) },
  { weight: 1, arbitrary: arbField.map(f => ({ type: "delete" as const, target: "rows/*", field: f })) },
  { weight: 1, arbitrary: fc.tuple(arbField, arbField).filter(([a, b]) => a !== b).map(([f, t]) => ({ type: "rename" as const, target: "rows/*", from: f, to: t })) },
  // Structural wraps (wildcard and non-wildcard)
  { weight: 1, arbitrary: fc.tuple(arbField, arbTag).map(([f, t]) => ({ type: "wrapRecord" as const, target: "rows/*", field: f, tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "wrapList" as const, target: "rows/*", tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "updateTag" as const, target: "rows/*", tag: t })) },
  { weight: 1, arbitrary: fc.tuple(arbField, arbTag).map(([f, t]) => ({ type: "wrapRecord" as const, target: "rows", field: f, tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "wrapList" as const, target: "rows", tag: t })) },
);

const arbNestedOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("edit" as const), peer: arbPeer, op: arbNestedEdit }) },
  { weight: 3, arbitrary: arbSyncOp },
);

// ── Deep nested document (list of lists of records) ─────────────────

const DEEP_DOC: PlainNode = {
  $tag: "root",
  grid: {
    $tag: "grid",
    $items: [
      { $tag: "row", $items: [
        { $tag: "cell", x: "a1", y: "a2" },
        { $tag: "cell", x: "b1", y: "b2" },
      ]},
      { $tag: "row", $items: [
        { $tag: "cell", x: "c1", y: "c2" },
      ]},
    ],
  },
};

const arbDeepEdit: fc.Arbitrary<EditOp> = fc.oneof(
  // Outer list ops
  { weight: 2, arbitrary: fc.constant({ type: "pushBack" as const, target: "grid", value: { $tag: "row", $items: [{ $tag: "cell", x: "n1", y: "n2" }] } as PlainNode }) },
  { weight: 1, arbitrary: fc.constant({ type: "popBack" as const, target: "grid" }) },
  { weight: 1, arbitrary: fc.constant({ type: "popFront" as const, target: "grid" }) },
  // Inner list ops (specific and wildcard)
  { weight: 2, arbitrary: fc.constant({ type: "pushBack" as const, target: "grid/0", value: { $tag: "cell", x: "new", y: "new" } as PlainNode }) },
  { weight: 1, arbitrary: fc.constant({ type: "popBack" as const, target: "grid/0" }) },
  // Deep wildcard edits (*/* and */*/*)
  { weight: 2, arbitrary: arbPrimVal.map(v => ({ type: "set" as const, target: "grid/*/0", value: v })) },
  { weight: 2, arbitrary: arbPrimVal.map(v => ({ type: "set" as const, target: "grid/*/*/x", value: v })) },
  // Structural ops at various depths
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "wrapList" as const, target: "grid/*", tag: t })) },
  { weight: 1, arbitrary: fc.tuple(arbField, arbTag).map(([f, t]) => ({ type: "wrapRecord" as const, target: "grid/*", field: f, tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "updateTag" as const, target: "grid/*", tag: t })) },
  { weight: 1, arbitrary: fc.tuple(arbField, arbField).filter(([a, b]) => a !== b).map(([f, t]) => ({ type: "rename" as const, target: "grid/*/*", from: f, to: t })) },
);

const arbDeepOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("edit" as const), peer: arbPeer, op: arbDeepEdit }) },
  { weight: 3, arbitrary: arbSyncOp },
);

// ── Reference document ──────────────────────────────────────────────

const REF_DOC: PlainNode = {
  $tag: "root",
  data: { $tag: "data", name: "alice", age: "30", extra: "x" },
  ref: { $ref: "/data/name" },
};

const arbRefEdit: fc.Arbitrary<EditOp> = fc.oneof(
  { weight: 3, arbitrary: fc.tuple(arbField, arbVal).map(([f, v]) => ({ type: "add" as const, target: "data", field: f, value: v })) },
  { weight: 2, arbitrary: arbField.map(f => ({ type: "delete" as const, target: "data", field: f })) },
  { weight: 2, arbitrary: fc.tuple(arbField, arbField).filter(([a, b]) => a !== b).map(([f, t]) => ({ type: "rename" as const, target: "data", from: f, to: t })) },
  { weight: 2, arbitrary: fc.tuple(arbField, arbPrimVal).map(([f, v]) => ({ type: "set" as const, target: `data/${f}`, value: v })) },
  { weight: 1, arbitrary: fc.tuple(arbField, arbTag).map(([f, t]) => ({ type: "wrapRecord" as const, target: "data", field: f, tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "wrapList" as const, target: "data", tag: t })) },
  { weight: 1, arbitrary: arbTag.map(t => ({ type: "updateTag" as const, target: "data", tag: t })) },
);

const arbRefOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("edit" as const), peer: arbPeer, op: arbRefEdit }) },
  { weight: 3, arbitrary: arbSyncOp },
);

// ══════════════════════════════════════════════════════════════════════
// 1. SYNC-AS-OPERATION: random interleaving of edits + syncs
//    fast-check shrinks failing sequences automatically
// ══════════════════════════════════════════════════════════════════════

Deno.test("Converge: flat list ops + interleaved sync", () => {
  fc.assert(
    fc.property(fc.array(arbFlatListOp, { minLength: 5, maxLength: 50 }), (ops) => {
      const peers = runOps(FLAT_LIST_DOC, ops);
      syncAll(peers);
      assertConvergence(peers);
    }),
    { numRuns: 2000 },
  );
});

Deno.test("Converge: flat record ops + interleaved sync", () => {
  fc.assert(
    fc.property(fc.array(arbFlatRecordOp, { minLength: 5, maxLength: 50 }), (ops) => {
      const peers = runOps(FLAT_RECORD_DOC, ops);
      syncAll(peers);
      assertConvergence(peers);
    }),
    { numRuns: 2000 },
  );
});

Deno.test("Converge: nested list-of-records + wildcards + interleaved sync", () => {
  fc.assert(
    fc.property(fc.array(arbNestedOp, { minLength: 5, maxLength: 50 }), (ops) => {
      const peers = runOps(NESTED_DOC, ops);
      syncAll(peers);
      assertConvergence(peers);
    }),
    { numRuns: 2000 },
  );
});

Deno.test("Converge: deep nested (list of lists) + deep wildcards", () => {
  fc.assert(
    fc.property(fc.array(arbDeepOp, { minLength: 5, maxLength: 40 }), (ops) => {
      const peers = runOps(DEEP_DOC, ops);
      syncAll(peers);
      assertConvergence(peers);
    }),
    { numRuns: 2000 },
  );
});

Deno.test("Converge: document with references + structural edits", () => {
  fc.assert(
    fc.property(fc.array(arbRefOp, { minLength: 5, maxLength: 40 }), (ops) => {
      const peers = runOps(REF_DOC, ops);
      syncAll(peers);
      assertConvergence(peers);
    }),
    { numRuns: 2000 },
  );
});

Deno.test("Converge: long operation sequences", () => {
  fc.assert(
    fc.property(fc.array(arbNestedOp, { minLength: 50, maxLength: 120 }), (ops) => {
      const peers = runOps(NESTED_DOC, ops);
      syncAll(peers);
      assertConvergence(peers);
    }),
    { numRuns: 500 },
  );
});

// ══════════════════════════════════════════════════════════════════════
// 2. SYNC ORDER PERMUTATION
//    Same edits, all N! sync pair orderings → same final state
// ══════════════════════════════════════════════════════════════════════

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) result.push([arr[i]!, ...perm]);
  }
  return result;
}

function assertAllSyncOrdersConverge(
  doc: PlainNode,
  edits: ((peer: Denicek) => void)[],
): void {
  const pairs: [number, number][] = [];
  for (let i = 0; i < edits.length; i++)
    for (let j = i + 1; j < edits.length; j++)
      pairs.push([i, j]);

  let referenceState: string | null = null;
  for (const syncOrder of permutations(pairs)) {
    const peers = Array.from({ length: edits.length }, (_, i) =>
      new Denicek(`peer${i}`, doc)
    );
    for (let i = 0; i < edits.length; i++) {
      try { edits[i]!(peers[i]!); } catch { /* edit may fail */ }
    }
    for (const [a, b] of syncOrder) sync(peers[a]!, peers[b]!);
    for (const [a, b] of syncOrder) sync(peers[a]!, peers[b]!);
    assertConvergence(peers);

    const state = JSON.stringify(peers[0]!.toPlain());
    if (referenceState === null) referenceState = state;
    else assertEquals(state, referenceState, `Different sync order produced different state`);
  }
}

Deno.test("SyncOrder: concurrent adds", () => {
  fc.assert(
    fc.property(
      fc.tuple(arbField, arbField, arbField).filter(([a, b, c]) => a !== b && b !== c && a !== c),
      fc.tuple(arbVal, arbVal, arbVal),
      (fields, values) => {
        assertAllSyncOrdersConverge(
          { $tag: "root", data: { $tag: "data" } },
          fields.map((f, i) => (p: Denicek) => p.add("data", f, values[i]!)),
        );
      },
    ),
    { numRuns: 500 },
  );
});

Deno.test("SyncOrder: concurrent list pushes", () => {
  fc.assert(
    fc.property(fc.tuple(arbVal, arbVal, arbVal), (values) => {
      assertAllSyncOrdersConverge(
        { $tag: "root", items: { $tag: "items", $items: ["initial"] } },
        [
          (p) => p.pushBack("items", values[0]!),
          (p) => p.pushFront("items", values[1]!),
          (p) => p.pushBack("items", values[2]!),
        ],
      );
    }),
    { numRuns: 500 },
  );
});

Deno.test("SyncOrder: concurrent structural ops (rename + wrap + add)", () => {
  assertAllSyncOrdersConverge(
    { $tag: "root", data: { $tag: "data", name: "alice", age: "30" } },
    [
      (p) => p.rename("data", "name", "fullName"),
      (p) => p.wrapRecord("data", "inner", "wrapper"),
      (p) => p.add("data", "extra", "value"),
    ],
  );
});

Deno.test("SyncOrder: wildcard edits + structural changes", () => {
  fc.assert(
    fc.property(arbTag, (tag) => {
      assertAllSyncOrdersConverge(
        { $tag: "root", items: { $tag: "items", $items: [
          { $tag: "item", val: "a" },
          { $tag: "item", val: "b" },
        ]}},
        [
          (p) => p.set("items/*/val", "UPDATED"),
          (p) => p.wrapList("items/*", tag),
          (p) => p.pushBack("items", { $tag: "item", val: "c" }),
        ],
      );
    }),
    { numRuns: 500 },
  );
});

Deno.test("SyncOrder: add + delete + rename on same record", () => {
  fc.assert(
    fc.property(
      arbField.filter(f => f !== "a" && f !== "b"),
      arbVal,
      (newField, newVal) => {
        assertAllSyncOrdersConverge(
          { $tag: "root", data: { $tag: "data", a: "1", b: "2", c: "3" } },
          [
            (p) => p.add("data", newField, newVal),
            (p) => p.delete("data", "a"),
            (p) => p.rename("data", "b", "beta"),
          ],
        );
      },
    ),
    { numRuns: 500 },
  );
});

Deno.test("SyncOrder: push + pop + wildcard edit", () => {
  assertAllSyncOrdersConverge(
    { $tag: "root", items: { $tag: "items", $items: ["a", "b", "c", "d"] } },
    [
      (p) => p.pushFront("items", "front"),
      (p) => p.popBack("items"),
      (p) => p.set("items/*", "UPDATED"),
    ],
  );
});

Deno.test("SyncOrder: concurrent wraps on same target", () => {
  fc.assert(
    fc.property(
      fc.tuple(arbField, arbTag),
      fc.tuple(arbField, arbTag),
      arbTag,
      ([f1, t1], [f2, t2], t3) => {
        assertAllSyncOrdersConverge(
          { $tag: "root", data: { $tag: "data", val: "x" } },
          [
            (p) => p.wrapRecord("data", f1, t1),
            (p) => p.wrapRecord("data", f2, t2),
            (p) => p.wrapList("data", t3),
          ],
        );
      },
    ),
    { numRuns: 500 },
  );
});

Deno.test("SyncOrder: concurrent copy + edit + add", () => {
  fc.assert(
    fc.property(arbVal, (val) => {
      assertAllSyncOrdersConverge(
        { $tag: "root", data: { $tag: "data", a: "original", b: "old" } },
        [
          (p) => p.copy("data/b", "data/a"),
          (p) => p.set("data/a", "UPDATED"),
          (p) => p.add("data", "c", val),
        ],
      );
    }),
    { numRuns: 500 },
  );
});

// ══════════════════════════════════════════════════════════════════════
// 3. OUT-OF-ORDER EVENT DELIVERY
//    Events shuffled before delivery → still converges
// ══════════════════════════════════════════════════════════════════════

Deno.test("OutOfOrder: shuffled event delivery still converges", () => {
  fc.assert(
    fc.property(
      fc.array(arbFlatRecordOp.filter(o => o.kind === "edit"), { minLength: 3, maxLength: 15 }),
      fc.nat({ max: 99999 }),
      (ops, seed) => {
        const peers = Array.from({ length: NUM_PEERS }, (_, i) =>
          new Denicek(`peer${i}`, FLAT_RECORD_DOC)
        );
        for (const op of ops) {
          if (op.kind === "edit") {
            try { applyEditOp(peers[op.peer]!, op.op); } catch { /* skip */ }
          }
        }

        const allEvents: { from: number; event: ReturnType<Denicek["drain"]>[number] }[] = [];
        for (let i = 0; i < NUM_PEERS; i++) {
          for (const ev of peers[i]!.drain()) allEvents.push({ from: i, event: ev });
        }

        const receivers = Array.from({ length: NUM_PEERS }, (_, i) =>
          new Denicek(`peer${i}`, FLAT_RECORD_DOC)
        );

        // Re-apply own events
        for (const { from, event } of allEvents) receivers[from]!.applyRemote(event);

        // Shuffle and deliver all events to all peers
        let s = seed;
        const shuffled = [...allEvents];
        for (let i = shuffled.length - 1; i > 0; i--) {
          s = (s * 1103515245 + 12345) & 0x7fffffff;
          const j = s % (i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
        }
        for (const { event } of shuffled) {
          for (let i = 0; i < NUM_PEERS; i++) receivers[i]!.applyRemote(event);
        }

        assertConvergence(receivers);
      },
    ),
    { numRuns: 1000 },
  );
});

// ══════════════════════════════════════════════════════════════════════
// 4. CRDT ALGEBRAIC PROPERTIES
// ══════════════════════════════════════════════════════════════════════

Deno.test("Property: idempotency — duplicate events are no-ops", () => {
  fc.assert(
    fc.property(
      fc.array(arbFlatRecordOp.filter(o => o.kind === "edit"), { minLength: 1, maxLength: 10 }),
      (ops) => {
        const alice = new Denicek("alice", FLAT_RECORD_DOC);
        const bob = new Denicek("bob", FLAT_RECORD_DOC);

        for (const op of ops) {
          if (op.kind === "edit" && op.peer === 0) {
            try { applyEditOp(alice, op.op); } catch { /* skip */ }
          }
        }
        const events = alice.drain();
        if (events.length === 0) return;

        for (const e of events) bob.applyRemote(e);
        const stateOnce = JSON.stringify(bob.toPlain());

        // Apply same events again
        for (const e of events) bob.applyRemote(e);
        assertEquals(JSON.stringify(bob.toPlain()), stateOnce);
      },
    ),
    { numRuns: 1000 },
  );
});

Deno.test("Property: commutativity — receive order doesn't matter", () => {
  fc.assert(
    fc.property(fc.nat({ max: 10000 }), (seed) => {
      const alice1 = new Denicek("alice", FLAT_RECORD_DOC);
      const bob1 = new Denicek("bob", FLAT_RECORD_DOC);
      const alice2 = new Denicek("alice", FLAT_RECORD_DOC);
      const bob2 = new Denicek("bob", FLAT_RECORD_DOC);

      // Both make the same edits on their clones
      let s = seed;
      const field1 = ["a", "b", "c", "d", "e"][s % 5]!; s = (s * 7 + 3) % 99991;
      const field2 = ["a", "b", "c", "d", "e"][s % 5]!;

      try {
        alice1.add("data", field1, "fromAlice");
        bob1.add("data", field2, "fromBob");
        alice2.add("data", field1, "fromAlice");
        bob2.add("data", field2, "fromBob");
      } catch { return; }

      // Order 1: alice first
      sync(alice1, bob1);
      // Order 2: bob first
      sync(bob2, alice2);

      assertEquals(JSON.stringify(alice1.toPlain()), JSON.stringify(alice2.toPlain()));
    }),
    { numRuns: 1000 },
  );
});

Deno.test("Property: associativity — merge order doesn't matter", () => {
  fc.assert(
    fc.property(
      fc.tuple(arbField, arbField, arbField).filter(([a, b, c]) => a !== b && b !== c && a !== c),
      (fields) => {
        const doc: PlainNode = { $tag: "root", data: { $tag: "data" } };

        // Order 1: (A merge B) merge C
        const a1 = new Denicek("a", doc), b1 = new Denicek("b", doc), c1 = new Denicek("c", doc);
        a1.add("data", fields[0], "1"); b1.add("data", fields[1], "2"); c1.add("data", fields[2], "3");
        sync(a1, b1);
        sync(a1, c1);

        // Order 2: A merge (B merge C)
        const a2 = new Denicek("a", doc), b2 = new Denicek("b", doc), c2 = new Denicek("c", doc);
        a2.add("data", fields[0], "1"); b2.add("data", fields[1], "2"); c2.add("data", fields[2], "3");
        sync(b2, c2);
        sync(a2, b2);

        assertEquals(JSON.stringify(a1.toPlain()), JSON.stringify(a2.toPlain()));
      },
    ),
    { numRuns: 1000 },
  );
});

// ══════════════════════════════════════════════════════════════════════
// 5. INTENT PRESERVATION
//    Non-conflicting edits must survive after sync
// ══════════════════════════════════════════════════════════════════════

Deno.test("Intent: non-conflicting adds are all preserved", () => {
  fc.assert(
    fc.property(
      fc.tuple(arbField, arbField, arbField).filter(([a, b, c]) => new Set([a, b, c]).size === 3),
      fc.tuple(arbVal, arbVal, arbVal),
      (fields, values) => {
        const doc: PlainNode = { $tag: "root", data: { $tag: "data" } };
        const peers = Array.from({ length: NUM_PEERS }, (_, i) =>
          new Denicek(`peer${i}`, doc)
        );
        for (let i = 0; i < NUM_PEERS; i++) peers[i]!.add("data", fields[i]!, values[i]!);

        syncAll(peers);
        assertConvergence(peers);

        const result = peers[0]!.toPlain() as { data: Record<string, unknown> };
        for (let i = 0; i < NUM_PEERS; i++) {
          assert(fields[i]! in result.data, `Field '${fields[i]}' from peer ${i} was lost`);
        }
      },
    ),
    { numRuns: 1000 },
  );
});

Deno.test("Intent: non-conflicting push-backs are all preserved", () => {
  fc.assert(
    fc.property(fc.tuple(arbVal, arbVal, arbVal), (values) => {
      const doc: PlainNode = { $tag: "root", items: { $tag: "items", $items: [] as PlainNode[] } };
      const peers = Array.from({ length: NUM_PEERS }, (_, i) =>
        new Denicek(`peer${i}`, doc)
      );
      for (let i = 0; i < NUM_PEERS; i++) peers[i]!.pushBack("items", values[i]!);

      syncAll(peers);
      assertConvergence(peers);

      const result = peers[0]!.toPlain() as { items: { $items: unknown[] } };
      for (let i = 0; i < NUM_PEERS; i++) {
        assert(result.items.$items.includes(values[i]!), `Value from peer ${i} was lost`);
      }
    }),
    { numRuns: 1000 },
  );
});

Deno.test("Intent: set on untouched field survives concurrent structural changes", () => {
  fc.assert(
    fc.property(arbPrimVal, (value) => {
      const doc: PlainNode = {
        $tag: "root",
        data: { $tag: "data", name: "alice", other: "untouched" },
      };
      const alice = new Denicek("alice", doc);
      const bob = new Denicek("bob", doc);

      alice.set("data/name", value);
      bob.add("data", "extra", "value");

      syncAll([alice, bob]);
      assertConvergence([alice, bob]);

      const result = alice.toPlain() as { data: Record<string, unknown> };
      assertEquals(result.data.name, value, "Alice's set was lost");
      assertEquals(result.data.extra, "value", "Bob's add was lost");
    }),
    { numRuns: 500 },
  );
});
