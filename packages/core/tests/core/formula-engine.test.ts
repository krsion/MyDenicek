import { assert, assertEquals } from "@std/assert";
import {
  evaluateAllFormulas,
  evaluateFormulaNode,
  FormulaError,
  registerFormulaOperation,
} from "../../mod.ts";
import type { FormulaResult, PlainNode, PlainRecord } from "../../mod.ts";

function assertFormulaError(result: FormulaResult, expectedMessage: string) {
  assert(
    result instanceof FormulaError,
    `expected FormulaError, got ${result}`,
  );
  assertEquals(result.message, expectedMessage);
}

// ── Helpers ─────────────────────────────────────────────────────────────

function makeFormula(operation: string, args: PlainNode[]): PlainRecord {
  return {
    $tag: "x-formula",
    operation,
    args: { $tag: "args", $items: args },
  };
}

function evalStandalone(
  formula: PlainRecord,
  root?: PlainNode,
  path?: string,
): FormulaResult {
  return evaluateFormulaNode(
    formula,
    root ?? formula,
    path ?? "",
  );
}

// ── 1. Built-in math operations ─────────────────────────────────────────

Deno.test("sum with multiple numbers", () => {
  const result = evalStandalone(makeFormula("sum", [1, 2, 3]));
  assertEquals(result, 6);
});

Deno.test("sum with zero args returns 0", () => {
  const result = evalStandalone(makeFormula("sum", []));
  assertEquals(result, 0);
});

Deno.test("product with multiple numbers", () => {
  const result = evalStandalone(makeFormula("product", [2, 3, 4]));
  assertEquals(result, 24);
});

Deno.test("mod(10, 3) returns 1", () => {
  const result = evalStandalone(makeFormula("mod", [10, 3]));
  assertEquals(result, 1);
});

Deno.test("round(3.7) returns 4", () => {
  const result = evalStandalone(makeFormula("round", [3.7]));
  assertEquals(result, 4);
});

Deno.test("floor(3.7) returns 3", () => {
  const result = evalStandalone(makeFormula("floor", [3.7]));
  assertEquals(result, 3);
});

Deno.test("ceil(3.2) returns 4", () => {
  const result = evalStandalone(makeFormula("ceil", [3.2]));
  assertEquals(result, 4);
});

Deno.test("abs(-5) returns 5", () => {
  const result = evalStandalone(makeFormula("abs", [-5]));
  assertEquals(result, 5);
});

// ── 2. Built-in string operations ───────────────────────────────────────

Deno.test("concat joins strings", () => {
  const result = evalStandalone(
    makeFormula("concat", ["hello", " ", "world"]),
  );
  assertEquals(result, "hello world");
});

Deno.test("uppercase converts to upper case", () => {
  const result = evalStandalone(makeFormula("uppercase", ["hello"]));
  assertEquals(result, "HELLO");
});

Deno.test("lowercase converts to lower case", () => {
  const result = evalStandalone(makeFormula("lowercase", ["HELLO"]));
  assertEquals(result, "hello");
});

Deno.test("capitalize capitalises each word", () => {
  const result = evalStandalone(makeFormula("capitalize", ["hello world"]));
  assertEquals(result, "Hello World");
});

Deno.test("trim removes surrounding whitespace", () => {
  const result = evalStandalone(makeFormula("trim", ["  hello  "]));
  assertEquals(result, "hello");
});

Deno.test("length returns string length", () => {
  const result = evalStandalone(makeFormula("length", ["hello"]));
  assertEquals(result, 5);
});

Deno.test("replace substitutes substring", () => {
  const result = evalStandalone(
    makeFormula("replace", ["hello world", "world", "denicek"]),
  );
  assertEquals(result, "hello denicek");
});

// ── 3. Reference resolution ─────────────────────────────────────────────

Deno.test("$ref resolves sibling primitive value", () => {
  const doc: PlainRecord = {
    $tag: "root",
    a: 10,
    b: 20,
    result: makeFormula("sum", [{ $ref: "/a" }, { $ref: "/b" }]),
  };
  const formula = doc.result as PlainRecord;
  const result = evaluateFormulaNode(formula, doc, "result");
  assertEquals(result, 30);
});

Deno.test("$ref with absolute path starting with /", () => {
  const doc: PlainRecord = {
    $tag: "root",
    nested: {
      $tag: "group",
      value: 42,
    } as PlainRecord,
    result: makeFormula("sum", [{ $ref: "/nested/value" }]),
  };
  const formula = doc.result as PlainRecord;
  const result = evaluateFormulaNode(formula, doc, "result");
  assertEquals(result, 42);
});

Deno.test("$ref with relative path using ..", () => {
  const doc: PlainRecord = {
    $tag: "root",
    value: 7,
    group: {
      $tag: "group",
      formula: makeFormula("sum", [{ $ref: "../../value" }]),
    } as PlainRecord,
  };
  const innerGroup = doc.group as PlainRecord;
  const formula = innerGroup.formula as PlainRecord;
  const result = evaluateFormulaNode(formula, doc, "group/formula");
  assertEquals(result, 7);
});

Deno.test("$ref with wildcard expands to multiple values", () => {
  const doc: PlainRecord = {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "item", value: 1 } as PlainRecord,
        { $tag: "item", value: 2 } as PlainRecord,
        { $tag: "item", value: 3 } as PlainRecord,
      ],
    },
    result: makeFormula("sum", [{ $ref: "/items/*/value" }]),
  };
  const formula = doc.result as PlainRecord;
  const result = evaluateFormulaNode(formula, doc, "result");
  assertEquals(result, 6);
});

Deno.test("sum over wildcard-expanded refs", () => {
  const doc: PlainRecord = {
    $tag: "root",
    scores: {
      $tag: "scores",
      $items: [10, 20, 30],
    },
    total: makeFormula("sum", [{ $ref: "/scores" }]),
  };
  const formula = doc.total as PlainRecord;
  const result = evaluateFormulaNode(formula, doc, "total");
  assertEquals(result, 60);
});

// ── 4. countChildren ────────────────────────────────────────────────────

Deno.test("countChildren with $ref to a list", () => {
  const doc: PlainRecord = {
    $tag: "root",
    items: {
      $tag: "items",
      $items: ["a", "b", "c"],
    },
    count: makeFormula("countChildren", [{ $ref: "/items" }]),
  };
  const formula = doc.count as PlainRecord;
  const result = evaluateFormulaNode(formula, doc, "count");
  assertEquals(result, 3);
});

Deno.test("countChildren with wildcard ref counts matched items", () => {
  const doc: PlainRecord = {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "item", name: "a" } as PlainRecord,
        { $tag: "item", name: "b" } as PlainRecord,
      ],
    },
    count: makeFormula("countChildren", [{ $ref: "/items/*/name" }]),
  };
  const formula = doc.count as PlainRecord;
  const result = evaluateFormulaNode(formula, doc, "count");
  assertEquals(result, 2);
});

// ── 5. Nested formulas ──────────────────────────────────────────────────

Deno.test("nested formula as argument", () => {
  const inner = makeFormula("sum", [1, 2]);
  const outer = makeFormula("product", [inner, 10]);
  const result = evalStandalone(outer);
  assertEquals(result, 30);
});

Deno.test("formula referencing another formula via $ref", () => {
  const doc: PlainRecord = {
    $tag: "root",
    partial: makeFormula("sum", [3, 4]),
    total: makeFormula("product", [{ $ref: "/partial" }, 2]),
  };
  const formula = doc.total as PlainRecord;
  const result = evaluateFormulaNode(formula, doc, "total");
  assertEquals(result, 14);
});

// ── 6. Error cases ──────────────────────────────────────────────────────

Deno.test("missing operation field returns FormulaError", () => {
  const formula: PlainRecord = {
    $tag: "x-formula",
    args: { $tag: "args", $items: [] },
  };
  const result = evalStandalone(formula);
  assertFormulaError(result, "formula missing 'operation' field");
});

Deno.test("unknown operation returns FormulaError", () => {
  const result = evalStandalone(makeFormula("foo", [1]));
  assertFormulaError(result, "unknown operation 'foo'");
});

Deno.test("wrong arity returns FormulaError", () => {
  const result = evalStandalone(makeFormula("round", [1, 2]));
  assertFormulaError(result, "round: expected 1 argument(s), got 2");
});

Deno.test("non-numeric arg to math op returns FormulaError", () => {
  const result = evalStandalone(makeFormula("sum", ["not-a-number"]));
  assertFormulaError(result, "sum: argument 'not-a-number' is not a number");
});

Deno.test("circular reference returns FormulaError", () => {
  // formulaA at "a" refs "b", formulaB at "b" refs "a"
  const formulaA: PlainRecord = makeFormula("sum", [{ $ref: "/b" }]);
  const formulaB: PlainRecord = makeFormula("sum", [{ $ref: "/a" }]);
  const doc: PlainRecord = {
    $tag: "root",
    a: formulaA,
    b: formulaB,
  };
  const result = evaluateFormulaNode(formulaA, doc, "a");
  assertFormulaError(result, "circular reference");
});

Deno.test("reference to non-existent path returns FormulaError", () => {
  const doc: PlainRecord = {
    $tag: "root",
    result: makeFormula("sum", [{ $ref: "/missing/path" }]),
  };
  const formula = doc.result as PlainRecord;
  const result = evaluateFormulaNode(formula, doc, "result");
  assertFormulaError(result, "reference '/missing/path' not found");
});

Deno.test("max depth exceeded returns FormulaError", () => {
  // Build a chain of 102 nested formulas to exceed MAX_DEPTH (100)
  let current: PlainNode = 1;
  for (let i = 0; i < 102; i++) {
    current = makeFormula("sum", [current]);
  }
  const result = evalStandalone(current as PlainRecord);
  assertFormulaError(result, "max depth exceeded");
});

Deno.test("FormulaError toString formats as #ERR", () => {
  const err = new FormulaError("test message");
  assertEquals(err.toString(), "#ERR: test message");
});

// ── 7. evaluateAllFormulas ──────────────────────────────────────────────

Deno.test("evaluateAllFormulas finds and evaluates all formulas", () => {
  const doc: PlainRecord = {
    $tag: "root",
    a: 10,
    b: 20,
    sumAB: makeFormula("sum", [{ $ref: "/a" }, { $ref: "/b" }]),
    doubled: makeFormula("product", [{ $ref: "/a" }, 2]),
  };
  const results = evaluateAllFormulas(doc);
  assertEquals(results.get("sumAB"), 30);
  assertEquals(results.get("doubled"), 20);
  assertEquals(results.size, 2);
});

Deno.test("evaluateAllFormulas result keys match paths", () => {
  const doc: PlainRecord = {
    $tag: "root",
    group: {
      $tag: "group",
      inner: makeFormula("sum", [1, 2]),
    } as PlainRecord,
  };
  const results = evaluateAllFormulas(doc);
  assertEquals(results.has("group/inner"), true);
  assertEquals(results.get("group/inner"), 3);
});

Deno.test("evaluateAllFormulas handles nested document structures", () => {
  const doc: PlainRecord = {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        makeFormula("sum", [5, 5]),
        makeFormula("product", [3, 3]),
      ],
    },
  };
  const results = evaluateAllFormulas(doc);
  assertEquals(results.get("items/0"), 10);
  assertEquals(results.get("items/1"), 9);
});

// ── 8. Custom operations ────────────────────────────────────────────────

Deno.test("registerFormulaOperation allows custom operations", () => {
  registerFormulaOperation("double", (args) => {
    if (args.length !== 1) {
      throw new Error(`double: expected 1 argument, got ${args.length}`);
    }
    return Number(args[0]) * 2;
  });

  const result = evalStandalone(makeFormula("double", [21]));
  assertEquals(result, 42);
});

Deno.test("custom operation error is wrapped in FormulaError", () => {
  // "double" registered above with arity check
  const result = evalStandalone(makeFormula("double", [1, 2]));
  assert(result instanceof FormulaError, "expected FormulaError");
});

// ── Edge cases ──────────────────────────────────────────────────────────

Deno.test("product with zero args returns 1 (identity)", () => {
  const result = evalStandalone(makeFormula("product", []));
  assertEquals(result, 1);
});

Deno.test("formula with no args field treats args as empty", () => {
  const formula: PlainRecord = {
    $tag: "x-formula",
    operation: "sum",
  };
  const result = evalStandalone(formula);
  assertEquals(result, 0);
});

Deno.test("concat coerces numbers to strings", () => {
  const result = evalStandalone(makeFormula("concat", ["count: ", 42]));
  assertEquals(result, "count: 42");
});

Deno.test("reference to record field returns FormulaError for non-primitive", () => {
  const doc: PlainRecord = {
    $tag: "root",
    nested: {
      $tag: "nested",
      child: "value",
    } as PlainRecord,
    result: makeFormula("sum", [{ $ref: "/nested" }]),
  };
  const formula = doc.result as PlainRecord;
  const result = evaluateFormulaNode(formula, doc, "result");
  assert(result instanceof FormulaError, "expected FormulaError");
});
