import { assert, assertEquals } from "@std/assert";
import { Denicek, evaluateAllFormulas, FormulaError } from "../../mod.ts";

function sync(a: Denicek, b: Denicek): void {
  const aFrontiers = a.frontiers;
  const bFrontiers = b.frontiers;
  for (const event of a.eventsSince(bFrontiers)) b.applyRemote(event);
  for (const event of b.eventsSince(aFrontiers)) a.applyRemote(event);
}

// ── Formula reference breaks on concurrent rename (known limitation) ───

Deno.test("formula $ref breaks when concurrent rename changes referenced field", () => {
  // This test documents a known limitation: formula references ($ref paths)
  // are not retargeted through concurrent structural edits. The OT
  // selector-rewriting rules transform edit selectors, not values already
  // stored in the document tree. See thesis §6.7 (Limitations).

  const initial = {
    $tag: "root",
    data: {
      $tag: "record",
      input: "hello",
      output: {
        $tag: "x-formula",
        operation: "uppercase",
        args: { $tag: "args", $items: [{ $ref: "../input" }] },
      },
    },
  } as const;

  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);

  // Before any concurrent edits, the formula works
  const beforeResults = evaluateAllFormulas(alice.toPlain());
  assertEquals(beforeResults.get("data/output"), "HELLO");

  // Alice renames "input" → "source" concurrently with Bob editing the value
  alice.rename("data", "input", "source");
  bob.set("data/input", "world");
  sync(alice, bob);

  // Both peers converge on the same document
  assertEquals(alice.toPlain(), bob.toPlain());

  // The formula still references "../input" which no longer exists.
  // This is the known limitation: $ref paths are not rewritten by OT.
  const afterResults = evaluateAllFormulas(alice.toPlain());
  const formulaResult = afterResults.get("data/output");

  // The formula either returns a FormulaError or the old reference fails.
  // Document the actual behavior — this is a known limitation, not a bug.
  assert(
    formulaResult instanceof FormulaError ||
      formulaResult !== "WORLD",
    `Expected formula to break after rename, but got: ${formulaResult}`,
  );
});

// ── Formula reference survives when source is edited (not renamed) ─────

Deno.test("formula $ref works when concurrent edit changes referenced value", () => {
  const initial = {
    $tag: "root",
    data: {
      $tag: "record",
      input: "hello",
      output: {
        $tag: "x-formula",
        operation: "uppercase",
        args: { $tag: "args", $items: [{ $ref: "../input" }] },
      },
    },
  } as const;

  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);

  // Alice sets the value, Bob also sets it concurrently
  alice.set("data/input", "alice-value");
  bob.set("data/input", "bob-value");
  sync(alice, bob);

  // Both peers converge
  assertEquals(alice.toPlain(), bob.toPlain());

  // Formula still works — the $ref path is still valid
  const results = evaluateAllFormulas(alice.toPlain());
  const formulaResult = results.get("data/output");
  assert(
    typeof formulaResult === "string",
    `Expected formula to produce a string, got: ${formulaResult}`,
  );
  // LWW resolves to one of the two values; formula uppercases it
  assert(
    formulaResult === "ALICE-VALUE" || formulaResult === "BOB-VALUE",
    `Expected uppercase of one LWW winner, got: ${formulaResult}`,
  );
});

// ── Formula reference breaks on concurrent wrap (known limitation) ─────

Deno.test("formula $ref breaks when concurrent wrap changes path structure", () => {
  const initial = {
    $tag: "root",
    data: {
      $tag: "record",
      input: "hello",
      output: {
        $tag: "x-formula",
        operation: "uppercase",
        args: { $tag: "args", $items: [{ $ref: "../input" }] },
      },
    },
  } as const;

  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);

  // Alice wraps "input" in a record, Bob edits the value concurrently
  alice.wrapRecord("data/input", "value", "wrapper");
  bob.set("data/input", "world");
  sync(alice, bob);

  // Both peers converge
  assertEquals(alice.toPlain(), bob.toPlain());

  // The formula references "../input" but after wrap, the value is at
  // "../input/value". The $ref is not rewritten — known limitation.
  const results = evaluateAllFormulas(alice.toPlain());
  const formulaResult = results.get("data/output");

  // The formula may evaluate the wrapper record (not a string) or error
  assert(
    formulaResult instanceof FormulaError ||
      typeof formulaResult !== "string" ||
      formulaResult !== "WORLD",
    `Expected formula to break or produce non-string after wrap, got: ${formulaResult}`,
  );
});
