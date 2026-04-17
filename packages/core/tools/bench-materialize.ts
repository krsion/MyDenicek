// Standalone micro-benchmark for mydenicek event ingest + materialize costs.
// Run: deno run --allow-hrtime tools/bench-materialize.ts
//
// Measures three workloads against event-count N:
//   1. local-append : one peer, pushBack of list items (linear chain, cache-friendly)
//   2. sync-linear  : two peers, A creates all events then syncs to B (ingest path)
//   3. merge-fan    : two peers edit disjoint subtrees concurrently, then sync
//
// Prints a CSV (to stdout) suitable for inclusion in the thesis.

import { Denicek, type PlainNode } from "../mod.ts";

const INITIAL: PlainNode = { $tag: "root", items: { $tag: "ul", $items: [] } };

type Row = {
  workload: string;
  n: number;
  total_ms: number;
  per_event_us: number;
  materialize_ms: number;
};

function now(): number {
  return performance.now();
}

function benchLocalAppend(n: number): Row {
  const dk = new Denicek("p", INITIAL);
  const t0 = now();
  for (let i = 0; i < n; i++) {
    dk.pushBack("items", { $tag: "li", text: `item ${i}` });
  }
  const total = now() - t0;
  const m0 = now();
  dk.materialize();
  const mat = now() - m0;
  return {
    workload: "local-append",
    n,
    total_ms: total,
    per_event_us: (total / n) * 1000,
    materialize_ms: mat,
  };
}

function benchSyncLinear(n: number): Row {
  const a = new Denicek("a", INITIAL);
  const b = new Denicek("b", INITIAL);
  for (let i = 0; i < n; i++) {
    a.pushBack("items", { $tag: "li", text: `item ${i}` });
  }
  const pending = a.eventsSince(b.frontiers);
  const t0 = now();
  for (const e of pending) b.applyRemote(e);
  const total = now() - t0;
  const m0 = now();
  b.materialize();
  const mat = now() - m0;
  return {
    workload: "sync-linear",
    n,
    total_ms: total,
    per_event_us: (total / n) * 1000,
    materialize_ms: mat,
  };
}

function benchMergeFan(n: number): Row {
  const initial: PlainNode = {
    $tag: "root",
    la: { $tag: "ul", $items: [] },
    lb: { $tag: "ul", $items: [] },
  };
  const a = new Denicek("a", initial);
  const b = new Denicek("b", initial);
  for (let i = 0; i < n / 2; i++) {
    a.pushBack("la", { $tag: "li", text: `a${i}` });
    b.pushBack("lb", { $tag: "li", text: `b${i}` });
  }
  const t0 = now();
  const fromA = a.eventsSince(b.frontiers);
  const fromB = b.eventsSince(a.frontiers);
  for (const e of fromA) b.applyRemote(e);
  for (const e of fromB) a.applyRemote(e);
  const total = now() - t0;
  const m0 = now();
  a.materialize();
  const mat = now() - m0;
  return {
    workload: "merge-fan",
    n,
    total_ms: total,
    per_event_us: (total / n) * 1000,
    materialize_ms: mat,
  };
}

function benchMergeForkFromShared(n: number): Row {
  // Realistic scenario: both peers share N events of history, then diverge
  // for a short branch. Checkpointing should help here: resume from the
  // shared prefix instead of replaying all N+branch events.
  const branchSize = Math.min(50, Math.floor(n / 10));
  const sharedSize = n - branchSize * 2;
  const initial: PlainNode = {
    $tag: "root",
    items: { $tag: "ul", $items: [] },
    la: { $tag: "ul", $items: [] },
    lb: { $tag: "ul", $items: [] },
  };
  const a = new Denicek("a", initial);
  const b = new Denicek("b", initial);
  // Build shared linear history
  for (let i = 0; i < sharedSize; i++) {
    a.pushBack("items", { $tag: "li", text: `shared${i}` });
  }
  // Sync shared history to b
  for (const e of a.eventsSince(b.frontiers)) b.applyRemote(e);
  // Prime caches (this is where the checkpoint will be saved)
  a.materialize();
  b.materialize();
  // Both diverge
  for (let i = 0; i < branchSize; i++) {
    a.pushBack("la", { $tag: "li", text: `a${i}` });
    b.pushBack("lb", { $tag: "li", text: `b${i}` });
  }
  // Merge
  const t0 = now();
  const fromA = a.eventsSince(b.frontiers);
  const fromB = b.eventsSince(a.frontiers);
  for (const e of fromA) b.applyRemote(e);
  for (const e of fromB) a.applyRemote(e);
  const total = now() - t0;
  const m0 = now();
  a.materialize();
  const mat = now() - m0;
  return {
    workload: "merge-fork-shared",
    n,
    total_ms: total,
    per_event_us: (total / n) * 1000,
    materialize_ms: mat,
  };
}

function main(): void {
  const sizes = [100, 500, 1000, 2000];
  const rows: Row[] = [];
  for (const n of sizes) {
    rows.push(benchLocalAppend(n));
    rows.push(benchSyncLinear(n));
    rows.push(benchMergeFan(n));
    rows.push(benchMergeForkFromShared(n));
  }
  console.log("workload,n,total_ms,per_event_us,materialize_ms");
  for (const r of rows) {
    console.log(
      `${r.workload},${r.n},${r.total_ms.toFixed(2)},${
        r.per_event_us.toFixed(2)
      },${r.materialize_ms.toFixed(2)}`,
    );
  }
}

if (import.meta.main) main();
