// Fuzz test for CRDT convergence.
// Run: deno run core_fuzz.ts [seeds] [iters]
//
// 3 peers, N seeds, 100 iterations per seed.
// Each iteration: random edit on random peer, sync 2 random peers, assert convergence.

import { Denicek, type PlainNode } from "./core.ts";
import { randomIntegerBetween, randomSeeded, sample } from "@std/random";

// ── Constants ───────────────────────────────────────────────────────

const TAGS = ["li", "div", "span", "td", "p"];
const NAMES = ["title", "label", "heading", "key", "name"];
const VALS = "abcde12345".split("");
const INITIAL_DOC = {
  $tag: "root",
  items: {
    $tag: "ul",
    $items: [
      { $tag: "item", name: "a", val: "1" },
      { $tag: "item", name: "b", val: "2" },
      { $tag: "item", name: "c", val: "3" },
    ],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

// randomSeeded returns a () => number in [0,1). All helpers take that directly.
type R = () => number;
const int = (r: R, a: number, b: number) => randomIntegerBetween(a, b, { prng: r });
const pick = <T>(r: R, arr: readonly T[]) => sample(arr, { prng: r })!;

function weighted<T>(r: R, arr: readonly T[], w: readonly number[]): T {
  let n = int(r, 0, w.reduce((a, b) => a + b, 0) - 1);
  for (let i = 0; i < arr.length; i++) { n -= w[i]!; if (n < 0) return arr[i]!; }
  return arr[arr.length - 1]!;
}

function sync(a: Denicek, b: Denicek): void {
  const af = a.frontiers, bf = b.frontiers;
  for (const e of a.eventsSince(bf)) b.applyRemote(e);
  for (const e of b.eventsSince(af)) a.applyRemote(e);
}

type Obj = Record<string, unknown>;
const isRec = (n: unknown): n is Obj => n !== null && typeof n === "object" && !("$items" in (n as Obj));
const isLst = (n: unknown): n is Obj => n !== null && typeof n === "object" && "$items" in (n as Obj);
const lst = (n: unknown) => (n as Obj).$items as unknown[];
const flds = (n: unknown) => Object.keys(n as Obj).filter(k => k !== "$tag");

// Random walk down the document tree, building a path like "items/2/name" or "items/*/val".
function randomPath(doc: unknown, r: R): { path: string; node: unknown } {
  let path = "", node = doc;
  while (node !== null && typeof node === "object") {
    if (isLst(node)) {
      const it = lst(node);
      if (it.length === 0) break;
      const c = r();
      if (c < 0.15) break;
      if (c < 0.6) { const i = int(r, 0, it.length - 1); path += (path ? "/" : "") + i; node = it[i]; }
      else { path += (path ? "/" : "") + "*"; node = it[0]; }
    } else if (isRec(node)) {
      const fs = flds(node);
      if (fs.length === 0 || r() < 0.2) break;
      const f = pick(r, fs);
      path += (path ? "/" : "") + f;
      node = (node as Obj)[f];
    } else break;
  }
  return { path, node };
}

// Resolve all concrete nodes matching a path (expanding wildcards).
function resolveAll(node: unknown, segs: string[], i: number): unknown[] {
  if (i >= segs.length) return [node];
  if (node === null || typeof node !== "object") return [];
  const s = segs[i]!;
  if (s === "*" && isLst(node)) return lst(node).flatMap(it => resolveAll(it, segs, i + 1));
  if (isLst(node)) { const idx = Number(s); return idx >= 0 && idx < lst(node).length ? resolveAll(lst(node)[idx], segs, i + 1) : []; }
  if (s in (node as Obj)) return resolveAll((node as Obj)[s], segs, i + 1);
  return [];
}

// Check all nodes at a wildcard path satisfy a test.
function allMatch(doc: unknown, path: string, test: (n: unknown) => boolean): boolean {
  const nodes = resolveAll(doc, path.split("/"), 0);
  return nodes.length > 0 && nodes.every(test);
}

// ── Random edit ─────────────────────────────────────────────────────

function applyRandomEdit(peer: Denicek, r: R, pushW: [number, number, number]): string | null {
  const doc = peer.toPlain();
  const { path, node } = randomPath(doc, r);
  const wild = path.includes("*");

  const newItem = (): PlainNode => weighted<PlainNode>(r,
    [{ $tag: pick(r, TAGS), name: pick(r, VALS), val: pick(r, VALS) } as PlainNode,
     { $tag: pick(r, TAGS), $items: [{ $tag: pick(r, TAGS), name: pick(r, VALS) }, pick(r, VALS)] } as PlainNode,
     pick(r, VALS)],
    pushW,
  );

  const op = int(r, 0, 30);
  const p = path || "/";

  if (op < 6 && !wild && isLst(node)) {
    const item = newItem();
    if (r() < 0.5) { peer.pushBack(path, item); return `pushBack(${p})`; }
    else { peer.pushFront(path, item); return `pushFront(${p})`; }
  }
  if (op < 10 && isLst(node) && lst(node).length > 0) {
    const t = path ? `${path}/*` : "*";
    if (r() < 0.5) { const tag = pick(r, TAGS); peer.wrapList(t, tag); return `wrapList(${t}, ${tag})`; }
    else { const f = pick(r, NAMES), tag = pick(r, TAGS); peer.wrapRecord(t, f, tag); return `wrapRecord(${t}, ${f}, ${tag})`; }
  }
  if (op < 14 && !wild && isLst(node) && lst(node).length > 0) {
    if (r() < 0.5) { peer.popBack(path); return `popBack(${p})`; }
    else { peer.popFront(path); return `popFront(${p})`; }
  }
  if (op < 18 && path && (isRec(node) || isLst(node)) && (!wild || allMatch(doc, path, n => isRec(n) || isLst(n)))) {
    const tag = pick(r, TAGS); peer.updateTag(path, tag); return `updateTag(${p}, ${tag})`;
  }
  if (op < 22 && isRec(node) && (!wild || allMatch(doc, path, isRec))) {
    const fs = flds(node); if (fs.length === 0) return null;
    const from = pick(r, fs);
    const to = NAMES.filter(n => n !== from && !fs.includes(n)); if (to.length === 0) return null;
    const t = pick(r, to); peer.rename(path, from, t); return `rename(${p}, ${from}→${t})`;
  }
  if (op < 25 && isRec(node) && (!wild || allMatch(doc, path, isRec))) {
    const unused = NAMES.filter(n => !flds(node).includes(n)); if (unused.length === 0) return null;
    const f = pick(r, unused), v = pick(r, VALS); peer.add(path, f, v); return `add(${p}, ${f}=${v})`;
  }
  if (op < 27 && isRec(node) && flds(node).length > 1 && (!wild || allMatch(doc, path, isRec))) {
    const f = pick(r, flds(node)); peer.delete(path, f); return `delete(${p}, ${f})`;
  }
  if (op < 29 && !wild && isLst(node) && lst(node).length >= 2) {
    const len = lst(node).length;
    const src = int(r, 0, len - 1);
    let dst = int(r, 0, len - 1); if (dst === src) dst = (dst + 1) % len;
    peer.copy(`${path}/${dst}`, `${path}/${src}`); return `copy(${p}/${dst}, ${p}/${src})`;
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────

// First 5 seeds use fixed profiles to guarantee coverage of extremes.
// Remaining seeds get random weights.
const PROFILES: [number, number, number][] = [
  [1, 0, 0], // only records
  [0, 1, 0], // only lists
  [0, 0, 1], // only primitives (tests structural ops on mixed-kind lists)
  [1, 0, 1], // records + primitives
  [1, 1, 1], // balanced
];

const seeds = Number(Deno.args[0]) || 500;
const iters = Number(Deno.args[1]) || 100;
const verbose = Deno.args.includes("-v");
console.log(`Running ${seeds} seeds × ${iters} iterations...`);
const t0 = Date.now();

for (let seed = 0; seed < seeds; seed++) {
  const r = randomSeeded(BigInt(seed));
  let pushW: [number, number, number];
  if (seed < PROFILES.length) {
    pushW = PROFILES[seed]!;
  } else {
    pushW = [Math.round(r() ** 2 * 10), Math.round(r() ** 2 * 10), Math.round(r() ** 2 * 10)];
    if (pushW[0] + pushW[1] + pushW[2] === 0) pushW[int(r, 0, 2)] = 1;
  }

  if (verbose) console.log(`seed=${seed} pushW=[${pushW}]`);
  const names = ["alice", "bob", "carol"];
  const peers = [new Denicek("alice", INITIAL_DOC), new Denicek("bob", INITIAL_DOC), new Denicek("carol", INITIAL_DOC)];

  for (let iter = 0; iter < iters; iter++) {
    const peerIdx = int(r, 0, 2);
    let desc: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      desc = applyRandomEdit(peers[peerIdx]!, r, pushW);
      if (desc) break;
    }
    const a = int(r, 0, 2);
    let b = int(r, 0, 2); if (b === a) b = (b + 1) % 3;

    if (verbose && desc) console.log(`  ${iter}: ${names[peerIdx]} ${desc}  → sync ${names[a]}↔${names[b]}`);

    sync(peers[a]!, peers[b]!);

    const pa = JSON.stringify(peers[a]!.toPlain());
    const pb = JSON.stringify(peers[b]!.toPlain());
    if (pa !== pb) {
      console.error(`FAIL seed=${seed} iter=${iter}: peer ${a} ≠ peer ${b}`);
      Deno.exit(1);
    }
  }
}
console.log(`OK: ${seeds}×${iters}, 0 failures (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
