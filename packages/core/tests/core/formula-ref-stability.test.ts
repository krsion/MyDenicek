import { assert, assertEquals } from "@std/assert";
import { Denicek } from "../../mod.ts";

function sync(a: Denicek, b: Denicek): void {
  const aFrontiers = a.frontiers;
  const bFrontiers = b.frontiers;
  for (const event of a.eventsSince(bFrontiers)) b.applyRemote(event);
  for (const event of b.eventsSince(aFrontiers)) a.applyRemote(event);
}

// ── Formula reference survives concurrent rename ─────────────────────

Deno.test("formula $ref is rewritten when concurrent rename changes referenced field", () => {
  const initial = {
    $tag: "root",
    data: {
      $tag: "record",
      input: "hello",
      output: {
        $tag: "x-formula",
        operation: "uppercase",
        args: { $tag: "args", $items: [{ $ref: "../../../input" }] },
      },
    },
  } as const;

  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);

  // Before any concurrent edits, the formula works
  const beforeResults = alice.evaluateFormulas();
  assertEquals(beforeResults.get("data/output"), "HELLO");

  // Alice renames "input" → "source" concurrently with Bob editing the value
  alice.rename("data", "input", "source");
  bob.set("data/input", "world");
  sync(alice, bob);

  // Both peers converge on the same document
  assertEquals(alice.toPlain(), bob.toPlain());

  // The formula's $ref should be rewritten from "../input" to "../source"
  // so the formula still evaluates correctly.
  const afterResults = alice.evaluateFormulas();
  const formulaResult = afterResults.get("data/output");

  // After LWW resolution, the value is either "hello" or "world";
  // the formula should uppercase whichever value won.
  assert(
    formulaResult === "HELLO" || formulaResult === "WORLD",
    `Expected formula to produce an uppercase string, but got: ${formulaResult}`,
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
        args: { $tag: "args", $items: [{ $ref: "../../../input" }] },
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
  const results = alice.evaluateFormulas();
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

// ── Formula reference survives concurrent wrap ───────────────────────

Deno.test("formula $ref is rewritten when concurrent wrap changes path structure", () => {
  const initial = {
    $tag: "root",
    data: {
      $tag: "record",
      input: "hello",
      output: {
        $tag: "x-formula",
        operation: "uppercase",
        args: { $tag: "args", $items: [{ $ref: "../../../input" }] },
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

  // The formula's $ref should be rewritten from "../input" to
  // "../input/value" so it still points to the actual value after wrap.
  const results = alice.evaluateFormulas();
  const formulaResult = results.get("data/output");

  assert(
    typeof formulaResult === "string",
    `Expected formula to produce a string after wrap, got: ${formulaResult}`,
  );
});
