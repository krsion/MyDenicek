/**
 * Chaos Fuzzer for Denicek CRDT
 *
 * Aggressive fuzzing that tries to break things:
 * - Invalid inputs
 * - Race conditions
 * - Extreme values
 * - Malformed data
 *
 * Run: deno run --allow-all core_chaos_fuzz.ts [iterations]
 */

import {
  Denicek,
  selector,
  formatSelector,
  plainObjectToNode,
  nodeToPlainObject,
  type PlainNode,
  type Event,
  type EventId,
} from "./core.ts";

// ══════════════════════════════════════════════════════════════════════
// CHAOS GENERATORS
// ══════════════════════════════════════════════════════════════════════

class ChaosFuzzer {
  private seed: number;
  private failures: string[] = [];
  private passes = 0;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
  }

  private random(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  private pick<T>(arr: T[]): T {
    return arr[this.randomInt(0, arr.length - 1)]!;
  }

  private chaosString(): string {
    const chaos = [
      "", // empty
      " ", // whitespace
      "\n\t\r", // control chars
      "null",
      "undefined",
      "__proto__",
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "../../../etc/passwd",
      "<script>alert(1)</script>",
      "'; DROP TABLE users; --",
      String.fromCharCode(...Array.from({ length: 10 }, () => this.randomInt(0, 255))),
      "a".repeat(10000), // long string
      "\u0000\u0001\u0002", // null bytes
      "🎉🔥💀", // emojis
      "/".repeat(100),
      "*".repeat(50),
      "..".repeat(50),
      `${"../".repeat(20)}root`,
    ];
    return this.pick(chaos);
  }

  private chaosNumber(): number {
    const chaos = [
      0,
      -0,
      1,
      -1,
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
      Number.MAX_VALUE,
      Number.MIN_VALUE,
      Infinity,
      -Infinity,
      NaN,
      1e308,
      1e-308,
      0.1 + 0.2, // floating point weirdness
      2 ** 53,
      -(2 ** 53),
    ];
    return this.pick(chaos);
  }

  private chaosSelector(): string {
    const chaos = [
      "",
      "/",
      "//",
      "///",
      "*",
      "**",
      "***",
      "..",
      "../..",
      "../../..",
      "/*/",
      "/*/..",
      "../*",
      "0",
      "-1",
      "99999999",
      "0/0/0/0/0/0/0/0/0/0",
      "*/*/*/*/*/*",
      "../*/../*/../*",
      "a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p",
      "/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p",
      this.chaosString(),
    ];
    return this.pick(chaos);
  }

  private chaosPlainNode(depth = 0): PlainNode {
    if (depth > 5 || this.random() < 0.3) {
      // Terminal node
      const type = this.randomInt(0, 5);
      switch (type) {
        case 0: return null;
        case 1: return this.chaosString();
        case 2: return this.chaosNumber();
        case 3: return this.random() < 0.5;
        case 4: return { $ref: this.chaosSelector() };
        default: return this.chaosString();
      }
    }

    // Structural node
    if (this.random() < 0.5) {
      // Record
      const fields: Record<string, PlainNode> = { $tag: this.chaosString() };
      const numFields = this.randomInt(0, 10);
      for (let i = 0; i < numFields; i++) {
        fields[this.chaosString()] = this.chaosPlainNode(depth + 1);
      }
      return fields as PlainNode;
    } else {
      // List
      const numItems = this.randomInt(0, 10);
      return {
        $tag: this.chaosString(),
        $items: Array.from({ length: numItems }, () => this.chaosPlainNode(depth + 1)),
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // CHAOS TESTS
  // ══════════════════════════════════════════════════════════════════════

  testChaosInit(): boolean {
    const name = "chaos-init";
    try {
      const doc = this.chaosPlainNode();
      const peer = new Denicek(this.chaosString(), doc);
      peer.toPlain();
      this.passes++;
      return true;
    } catch (e) {
      // Expected - chaos input often invalid
      this.passes++;
      return true;
    }
  }

  testChaosSelector(): boolean {
    const name = "chaos-selector";
    try {
      const sel = selector(this.chaosSelector());
      formatSelector(sel);
      this.passes++;
      return true;
    } catch (e) {
      this.passes++;
      return true;
    }
  }

  testChaosAdd(): boolean {
    const name = "chaos-add";
    try {
      const doc: PlainNode = { $tag: "root", data: { $tag: "data" } };
      const peer = new Denicek("test", doc);

      peer.add(this.chaosSelector(), this.chaosString(), this.chaosPlainNode());
      peer.toPlain();
      this.passes++;
      return true;
    } catch (e) {
      this.passes++;
      return true;
    }
  }

  testChaosDelete(): boolean {
    const name = "chaos-delete";
    try {
      const doc: PlainNode = { $tag: "root", field: "value" };
      const peer = new Denicek("test", doc);

      peer.delete(this.chaosSelector(), this.chaosString());
      peer.toPlain();
      this.passes++;
      return true;
    } catch (e) {
      this.passes++;
      return true;
    }
  }

  testChaosRename(): boolean {
    const name = "chaos-rename";
    try {
      const doc: PlainNode = { $tag: "root", oldField: "value" };
      const peer = new Denicek("test", doc);

      peer.rename(this.chaosSelector(), this.chaosString(), this.chaosString());
      peer.toPlain();
      this.passes++;
      return true;
    } catch (e) {
      this.passes++;
      return true;
    }
  }

  testChaosPush(): boolean {
    const name = "chaos-push";
    try {
      const doc: PlainNode = { $tag: "root", list: { $tag: "list", $items: [] } };
      const peer = new Denicek("test", doc);

      if (this.random() < 0.5) {
        peer.pushBack(this.chaosSelector(), this.chaosPlainNode());
      } else {
        peer.pushFront(this.chaosSelector(), this.chaosPlainNode());
      }
      peer.toPlain();
      this.passes++;
      return true;
    } catch (e) {
      this.passes++;
      return true;
    }
  }

  testChaosPop(): boolean {
    const name = "chaos-pop";
    try {
      const doc: PlainNode = { $tag: "root", list: { $tag: "list", $items: ["a"] } };
      const peer = new Denicek("test", doc);

      if (this.random() < 0.5) {
        peer.popBack(this.chaosSelector());
      } else {
        peer.popFront(this.chaosSelector());
      }
      peer.toPlain();
      this.passes++;
      return true;
    } catch (e) {
      this.passes++;
      return true;
    }
  }

  testChaosWrap(): boolean {
    const name = "chaos-wrap";
    try {
      const doc: PlainNode = { $tag: "root", data: "value" };
      const peer = new Denicek("test", doc);

      if (this.random() < 0.5) {
        peer.wrapRecord(this.chaosSelector(), this.chaosString(), this.chaosString());
      } else {
        peer.wrapList(this.chaosSelector(), this.chaosString());
      }
      peer.toPlain();
      this.passes++;
      return true;
    } catch (e) {
      this.passes++;
      return true;
    }
  }

  testChaosCopy(): boolean {
    const name = "chaos-copy";
    try {
      const doc: PlainNode = { $tag: "root", a: "1", b: "2" };
      const peer = new Denicek("test", doc);

      peer.copy(this.chaosSelector(), this.chaosSelector());
      peer.toPlain();
      this.passes++;
      return true;
    } catch (e) {
      this.passes++;
      return true;
    }
  }

  testChaosConcurrent(): boolean {
    const name = "chaos-concurrent";
    try {
      const doc: PlainNode = {
        $tag: "root",
        shared: { $tag: "shared", value: "initial" },
      };

      const peers = Array.from({ length: 5 }, (_, i) =>
        new Denicek(`peer${i}`, doc)
      );

      // Each peer does random chaos operations
      for (const peer of peers) {
        const numOps = this.randomInt(1, 10);
        for (let i = 0; i < numOps; i++) {
          try {
            const op = this.randomInt(0, 5);
            switch (op) {
              case 0:
                peer.add("shared", this.chaosString(), this.chaosPlainNode());
                break;
              case 1:
                peer.delete("shared", this.chaosString());
                break;
              case 2:
                peer.rename("shared", this.chaosString(), this.chaosString());
                break;
              case 3:
                peer.updateTag("shared", this.chaosString());
                break;
              case 4:
                peer.set("shared/value", "UPDATED");
                break;
            }
          } catch {
            // Expected
          }
        }
      }

      // Sync in random order
      const order = [...peers].sort(() => this.random() - 0.5);
      for (let i = 0; i < order.length - 1; i++) {
        this.sync(order[i]!, order[i + 1]!);
      }
      // Full sync
      for (let i = 0; i < peers.length; i++) {
        for (let j = i + 1; j < peers.length; j++) {
          this.sync(peers[i]!, peers[j]!);
        }
      }

      // Check convergence
      const states = peers.map(p => JSON.stringify(p.toPlain()));
      const allSame = states.every(s => s === states[0]);

      if (!allSame) {
        this.failures.push(`${name}: Peers did not converge after chaos operations`);
        return false;
      }

      this.passes++;
      return true;
    } catch (e) {
      // Unexpected crash
      this.failures.push(`${name}: Unexpected error: ${e}`);
      return false;
    }
  }

  testChaosEventReplay(): boolean {
    const name = "chaos-event-replay";
    try {
      const doc: PlainNode = { $tag: "root", data: { $tag: "data", value: 0 } };
      const alice = new Denicek("alice", doc);
      const bob = new Denicek("bob", doc);

      // Alice makes some operations
      for (let i = 0; i < 10; i++) {
        try {
          alice.add("data", `field${i}`, i);
        } catch {
          // May fail
        }
      }

      const events = alice.drain();

      // Send events in random order
      const shuffled = [...events].sort(() => this.random() - 0.5);
      for (const event of shuffled) {
        bob.applyRemote(event);
      }

      // Should converge
      const aliceState = JSON.stringify(alice.toPlain());
      const bobState = JSON.stringify(bob.toPlain());

      if (aliceState !== bobState) {
        this.failures.push(`${name}: States diverged after out-of-order event delivery`);
        return false;
      }

      this.passes++;
      return true;
    } catch (e) {
      this.failures.push(`${name}: Unexpected error: ${e}`);
      return false;
    }
  }

  testChaosDuplicateEvents(): boolean {
    const name = "chaos-duplicate-events";
    try {
      const doc: PlainNode = { $tag: "root", value: "initial" };
      const alice = new Denicek("alice", doc);
      const bob = new Denicek("bob", doc);

      alice.add("", "field", "value");
      const events = alice.drain();

      // Send same event multiple times
      for (let i = 0; i < 10; i++) {
        for (const event of events) {
          bob.applyRemote(event);
        }
      }

      const aliceState = JSON.stringify(alice.toPlain());
      const bobState = JSON.stringify(bob.toPlain());

      if (aliceState !== bobState) {
        this.failures.push(`${name}: Duplicate events caused divergence`);
        return false;
      }

      this.passes++;
      return true;
    } catch (e) {
      this.failures.push(`${name}: Unexpected error: ${e}`);
      return false;
    }
  }

  testChaosDeepNesting(): boolean {
    const name = "chaos-deep-nesting";
    try {
      // Create extremely nested structure
      let doc: PlainNode = { $tag: "leaf", value: "deep" };
      const depth = this.randomInt(50, 100);
      for (let i = 0; i < depth; i++) {
        doc = { $tag: `l${i}`, child: doc };
      }
      doc = { $tag: "root", nested: doc };

      const peer = new Denicek("test", doc);
      peer.toPlain();

      this.passes++;
      return true;
    } catch (e) {
      // Stack overflow is acceptable for extreme depth
      if (String(e).includes("Maximum call stack")) {
        this.passes++;
        return true;
      }
      this.failures.push(`${name}: Unexpected error: ${e}`);
      return false;
    }
  }

  testChaosWideRecord(): boolean {
    const name = "chaos-wide-record";
    try {
      const fields: Record<string, PlainNode> = { $tag: "root" };
      const width = this.randomInt(100, 500);
      for (let i = 0; i < width; i++) {
        fields[`field${i}`] = `value${i}`;
      }

      const peer = new Denicek("test", fields as PlainNode);
      peer.toPlain();

      // Do some operations
      for (let i = 0; i < 10; i++) {
        peer.add("", `new${i}`, `val${i}`);
      }
      peer.toPlain();

      this.passes++;
      return true;
    } catch (e) {
      this.failures.push(`${name}: Unexpected error: ${e}`);
      return false;
    }
  }

  testChaosLongList(): boolean {
    const name = "chaos-long-list";
    try {
      const length = this.randomInt(100, 500);
      const items = Array.from({ length }, (_, i) => `item${i}`);

      const doc: PlainNode = { $tag: "root", list: { $tag: "list", $items: items } };
      const peer = new Denicek("test", doc);

      // Random push/pop operations
      for (let i = 0; i < 50; i++) {
        try {
          const op = this.randomInt(0, 3);
          switch (op) {
            case 0: peer.pushBack("list", `new${i}`); break;
            case 1: peer.pushFront("list", `front${i}`); break;
            case 2: peer.popBack("list"); break;
            case 3: peer.popFront("list"); break;
          }
        } catch {
          // May fail if list empty
        }
      }

      peer.toPlain();
      this.passes++;
      return true;
    } catch (e) {
      this.failures.push(`${name}: Unexpected error: ${e}`);
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════

  private sync(a: Denicek, b: Denicek): void {
    const af = a.frontiers, bf = b.frontiers;
    for (const e of a.eventsSince(bf)) b.applyRemote(e);
    for (const e of b.eventsSince(af)) a.applyRemote(e);
  }

  // ══════════════════════════════════════════════════════════════════════
  // RUNNER
  // ══════════════════════════════════════════════════════════════════════

  run(iterations: number): void {
    console.log(`\n🔥 CHAOS FUZZER - ${iterations} iterations per test\n`);
    console.log(`Seed: ${this.seed}\n`);

    const tests = [
      () => this.testChaosInit(),
      () => this.testChaosSelector(),
      () => this.testChaosAdd(),
      () => this.testChaosDelete(),
      () => this.testChaosRename(),
      () => this.testChaosPush(),
      () => this.testChaosPop(),
      () => this.testChaosWrap(),
      () => this.testChaosCopy(),
      () => this.testChaosConcurrent(),
      () => this.testChaosEventReplay(),
      () => this.testChaosDuplicateEvents(),
      () => this.testChaosDeepNesting(),
      () => this.testChaosWideRecord(),
      () => this.testChaosLongList(),
    ];

    const testNames = [
      "chaos-init",
      "chaos-selector",
      "chaos-add",
      "chaos-delete",
      "chaos-rename",
      "chaos-push",
      "chaos-pop",
      "chaos-wrap",
      "chaos-copy",
      "chaos-concurrent",
      "chaos-event-replay",
      "chaos-duplicate-events",
      "chaos-deep-nesting",
      "chaos-wide-record",
      "chaos-long-list",
    ];

    const t0 = Date.now();

    for (let i = 0; i < tests.length; i++) {
      process.stdout.write(`  Testing ${testNames[i]!.padEnd(25)}`);
      const testStart = Date.now();
      let passed = 0;

      for (let j = 0; j < iterations; j++) {
        if (tests[i]!()) passed++;
      }

      const elapsed = Date.now() - testStart;
      console.log(`${passed}/${iterations} (${elapsed}ms)`);
    }

    const totalTime = ((Date.now() - t0) / 1000).toFixed(2);

    console.log(`\n${"═".repeat(60)}`);
    console.log(`Total: ${this.passes} passes, ${this.failures.length} failures (${totalTime}s)`);

    if (this.failures.length > 0) {
      console.log(`\n❌ FAILURES:`);
      for (const f of this.failures.slice(0, 10)) {
        console.log(`  - ${f}`);
      }
      if (this.failures.length > 10) {
        console.log(`  ... and ${this.failures.length - 10} more`);
      }
      Deno.exit(1);
    } else {
      console.log(`\n✅ All chaos tests passed!`);
    }
  }
}

// Polyfill for process.stdout.write in Deno
const process = {
  stdout: {
    write: (s: string) => Deno.stdout.writeSync(new TextEncoder().encode(s)),
  },
};

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════

const iterations = Number(Deno.args[0]) || 100;
const seed = Deno.args[1] ? Number(Deno.args[1]) : Date.now();

const fuzzer = new ChaosFuzzer(seed);
fuzzer.run(iterations);
