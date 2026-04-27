// Micro-benchmarks for mydenicek event ingest + materialize costs.
// Run: deno bench --allow-all tools/bench-materialize.ts
//
// Uses Deno's built-in benchmarking framework with automatic warmup
// and statistical reporting (min, max, mean, percentiles).

import { Denicek, type PlainNode } from "../mod.ts";

const INITIAL: PlainNode = {
  $tag: "root",
  items: { $tag: "ul", $items: [] },
};

function setupLocalAppend(n: number): () => void {
  return () => {
    const dk = new Denicek("p", INITIAL);
    for (let i = 0; i < n; i++) {
      dk.insert("items", -1, { $tag: "li", text: `item ${i}` }, true);
    }
    dk.materialize();
  };
}

function setupSyncLinear(n: number): () => void {
  return () => {
    const a = new Denicek("a", INITIAL);
    const b = new Denicek("b", INITIAL);
    for (let i = 0; i < n; i++) {
      a.insert("items", -1, { $tag: "li", text: `item ${i}` }, true);
    }
    const pending = a.eventsSince(b.frontiers);
    for (const e of pending) b.applyRemote(e);
    b.materialize();
  };
}

function setupConcurrentSync(n: number): () => void {
  const initial: PlainNode = {
    $tag: "root",
    la: { $tag: "ul", $items: [] },
    lb: { $tag: "ul", $items: [] },
  };
  return () => {
    const a = new Denicek("a", initial);
    const b = new Denicek("b", initial);
    for (let i = 0; i < n / 2; i++) {
      a.insert("la", -1, { $tag: "li", text: `a${i}` }, true);
      b.insert("lb", -1, { $tag: "li", text: `b${i}` }, true);
    }
    const fromA = a.eventsSince(b.frontiers);
    const fromB = b.eventsSince(a.frontiers);
    for (const e of fromA) b.applyRemote(e);
    for (const e of fromB) a.applyRemote(e);
    a.materialize();
  };
}

for (const n of [100, 2000]) {
  Deno.bench({
    name: `local-append N=${n}`,
    fn: setupLocalAppend(n),
  });

  Deno.bench({
    name: `sync-linear N=${n}`,
    fn: setupSyncLinear(n),
  });

  Deno.bench({
    name: `concurrent-sync N=${n}`,
    fn: setupConcurrentSync(n),
    ...(n >= 2000 ? { n: 5 } : {}),
  });
}
