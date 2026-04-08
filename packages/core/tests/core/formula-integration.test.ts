import { assertEquals } from "@std/assert";
import { Denicek, FormulaError } from "../../mod.ts";
import { sync } from "./test-helpers.ts";

// ── 1. evaluateFormulas on a Denicek instance ───────────────────────────

Deno.test("evaluateFormulas: evaluates formula in document", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    a: 10,
    b: 20,
    total: {
      $tag: "x-formula",
      operation: "sum",
      args: { $tag: "args", $items: [{ $ref: "/a" }, { $ref: "/b" }] },
    },
  });
  const results = peer.evaluateFormulas();
  assertEquals(results.get("total"), 30);
});

// ── 2. recomputeFormulas writes results back ────────────────────────────

Deno.test("recomputeFormulas: writes result field back into document", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    a: 10,
    b: 20,
    total: {
      $tag: "x-formula",
      operation: "sum",
      args: { $tag: "args", $items: [{ $ref: "/a" }, { $ref: "/b" }] },
      result: 0,
    },
  });
  peer.recomputeFormulas();
  assertEquals(peer.get("total/result"), [30]);
});

// ── 3. Edit dependency then re-evaluate ─────────────────────────────────

Deno.test("evaluateFormulas: reflects updated dependency values", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    a: 5,
    total: {
      $tag: "x-formula",
      operation: "sum",
      args: { $tag: "args", $items: [{ $ref: "/a" }, 1] },
    },
  });
  assertEquals(peer.evaluateFormulas().get("total"), 6);

  peer.set("a", 100);
  assertEquals(peer.evaluateFormulas().get("total"), 101);
});

// ── 4. Two peers with formulas converge after sync ──────────────────────

Deno.test("evaluateFormulas: both peers see same result after sync", () => {
  const initial = {
    $tag: "root" as const,
    value: 5,
    doubled: {
      $tag: "x-formula",
      operation: "product",
      args: { $tag: "args", $items: [{ $ref: "/value" }, 2] },
    },
  };
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);

  alice.set("value", 10);
  sync(alice, bob);

  assertEquals(alice.evaluateFormulas().get("doubled"), 20);
  assertEquals(bob.evaluateFormulas().get("doubled"), 20);
});

// ── 5. recomputeFormulas with multiple formulas including transitive refs

Deno.test("recomputeFormulas: handles multiple formulas including transitive refs", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    x: 3,
    y: 4,
    sumXY: {
      $tag: "x-formula",
      operation: "sum",
      args: { $tag: "args", $items: [{ $ref: "/x" }, { $ref: "/y" }] },
      result: 0,
    },
    doubled: {
      $tag: "x-formula",
      operation: "product",
      args: {
        $tag: "args",
        $items: [{ $ref: "/sumXY" }, 2],
      },
      result: 0,
    },
  });
  const results = peer.recomputeFormulas();

  assertEquals(results.get("sumXY"), 7);
  assertEquals(results.get("doubled"), 14);
  assertEquals(peer.get("sumXY/result"), [7]);
  assertEquals(peer.get("doubled/result"), [14]);
});

// ── 6. Formula with error does not crash recomputeFormulas ──────────────

Deno.test("recomputeFormulas: skips formulas with errors", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    a: 10,
    good: {
      $tag: "x-formula",
      operation: "sum",
      args: { $tag: "args", $items: [{ $ref: "/a" }, 5] },
      result: 0,
    },
    bad: {
      $tag: "x-formula",
      operation: "sum",
      args: {
        $tag: "args",
        $items: [{ $ref: "/nonexistent" }],
      },
      result: 0,
    },
  });
  const results = peer.recomputeFormulas();

  // Good formula should be written back
  assertEquals(peer.get("good/result"), [15]);

  // Bad formula should return a FormulaError and leave result unchanged
  const badResult = results.get("bad");
  assertEquals(badResult instanceof FormulaError, true);
  assertEquals(peer.get("bad/result"), [0]);
});

// ── 7. evaluateFormulas after pushBack ──────────────────────────────────

Deno.test("evaluateFormulas: formula with wildcard ref updates after pushBack", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "item", value: 1 },
        { $tag: "item", value: 2 },
      ],
    },
    total: {
      $tag: "x-formula",
      operation: "sum",
      args: { $tag: "args", $items: [{ $ref: "/items/*/value" }] },
    },
  });

  assertEquals(peer.evaluateFormulas().get("total"), 3);

  peer.pushBack("items", { $tag: "item", value: 10 });
  assertEquals(peer.evaluateFormulas().get("total"), 13);
});

// ── 8. Undo + formula interaction ───────────────────────────────────────

Deno.test("evaluateFormulas: result reverts after undo of dependency edit", () => {
  const peer = new Denicek("alice", {
    $tag: "root",
    a: 1,
    total: {
      $tag: "x-formula",
      operation: "sum",
      args: { $tag: "args", $items: [{ $ref: "/a" }, 100] },
    },
  });

  assertEquals(peer.evaluateFormulas().get("total"), 101);

  peer.set("a", 50);
  assertEquals(peer.evaluateFormulas().get("total"), 150);

  peer.undo();
  assertEquals(peer.evaluateFormulas().get("total"), 101);
});

// ── 9. recomputeFormulas after concurrent edits from two peers ──────────

Deno.test("recomputeFormulas: concurrent edits from two peers", () => {
  const initial = {
    $tag: "root" as const,
    a: 1,
    b: 1,
    total: {
      $tag: "x-formula",
      operation: "sum",
      args: {
        $tag: "args",
        $items: [{ $ref: "/a" }, { $ref: "/b" }],
      },
      result: 0,
    },
  };
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);

  // Concurrent edits: Alice sets /a, Bob sets /b
  alice.set("a", 10);
  bob.set("b", 20);
  sync(alice, bob);

  const aliceResults = alice.recomputeFormulas();
  const bobResults = bob.recomputeFormulas();

  // Both should see a + b = 30
  assertEquals(aliceResults.get("total"), 30);
  assertEquals(bobResults.get("total"), 30);
  assertEquals(alice.get("total/result"), [30]);
  assertEquals(bob.get("total/result"), [30]);
});
