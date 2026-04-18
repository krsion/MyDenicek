import { Node } from "./nodes/base.ts";
import { ListNode } from "./nodes/list-node.ts";
import { PrimitiveNode } from "./nodes/primitive-node.ts";
import { RecordNode } from "./nodes/record-node.ts";
import { ReferenceNode } from "./nodes/reference-node.ts";
import { type PrimitiveValue, Selector } from "./selector.ts";

// ── FormulaError ────────────────────────────────────────────────────────

/** A formula evaluation error returned as a value, not thrown. */
export class FormulaError {
  /** Creates a FormulaError with the given diagnostic message. */
  constructor(readonly message: string) {}
  /** Returns a human-readable error string prefixed with `#ERR:`. */
  toString(): string {
    return `#ERR: ${this.message}`;
  }
}

// ── Types ───────────────────────────────────────────────────────────────

/** A pure function that computes a primitive value from primitive arguments. */
export type FormulaOperation = (args: PrimitiveValue[]) => PrimitiveValue;
/** The result of evaluating a formula: either a value or a {@link FormulaError}. */
export type FormulaResult = PrimitiveValue | FormulaError;

// ── Type guard ──────────────────────────────────────────────────────────

function isFormulaNode(node: Node): node is RecordNode {
  return node instanceof RecordNode &&
    (node.tag.startsWith("x-formula") || tagEvaluators.has(node.tag));
}

// ── Operation Registry ──────────────────────────────────────────────────

const operations = new Map<string, FormulaOperation>();

/** Register a named formula operation (used with `$tag: "x-formula"` + `operation` field). */
export function registerFormulaOperation(
  name: string,
  fn: FormulaOperation,
): void {
  operations.set(name, fn);
}

function lookupOperation(name: string): FormulaOperation | undefined {
  return operations.get(name);
}

// ── Tag-based Evaluator Registry ────────────────────────────────────────

/**
 * A tag evaluator computes a result from a formula record's own fields.
 * The `evaluate` callback recursively evaluates child nodes.
 */
export type FormulaTagEvaluator = (
  node: RecordNode,
  evaluate: (child: Node, fieldName?: string) => FormulaResult,
) => FormulaResult;

const tagEvaluators = new Map<string, FormulaTagEvaluator>();

/**
 * Register a formula evaluator for a specific `$tag` value.
 *
 * When the engine encounters a node whose `$tag` starts with `"x-formula"`
 * and matches a registered tag, it calls the evaluator instead of the
 * default `operation + args` path.
 *
 * ```ts
 * registerFormulaTagEvaluator("x-formula-plus", (node, evaluate) => {
 *   const left = evaluate(node.left);
 *   const right = evaluate(node.right);
 *   if (left instanceof FormulaError) return left;
 *   if (right instanceof FormulaError) return right;
 *   return Number(left) + Number(right);
 * });
 * ```
 */
export function registerFormulaTagEvaluator(
  tag: string,
  fn: FormulaTagEvaluator,
): void {
  tagEvaluators.set(tag, fn);
}

function lookupTagEvaluator(tag: string): FormulaTagEvaluator | undefined {
  return tagEvaluators.get(tag);
}

// ── Numeric helpers ─────────────────────────────────────────────────────

function coerceNumbers(args: PrimitiveValue[], opName: string): number[] {
  return args.map((a) => {
    const n = Number(a);
    if (Number.isNaN(n)) {
      throw new Error(`${opName}: argument '${String(a)}' is not a number`);
    }
    return n;
  });
}

function requireArity(
  args: PrimitiveValue[],
  expected: number,
  opName: string,
): void {
  if (args.length !== expected) {
    throw new Error(
      `${opName}: expected ${expected} argument(s), got ${args.length}`,
    );
  }
}

// ── Built-in operations ─────────────────────────────────────────────────

registerFormulaOperation("sum", (args) => {
  const nums = coerceNumbers(args, "sum");
  return nums.reduce((a, b) => a + b, 0);
});

registerFormulaOperation("product", (args) => {
  const nums = coerceNumbers(args, "product");
  return nums.reduce((a, b) => a * b, 1);
});

registerFormulaOperation("mod", (args) => {
  requireArity(args, 2, "mod");
  const nums = coerceNumbers(args, "mod");
  return nums[0] % nums[1];
});

registerFormulaOperation("round", (args) => {
  requireArity(args, 1, "round");
  return Math.round(coerceNumbers(args, "round")[0]);
});

registerFormulaOperation("floor", (args) => {
  requireArity(args, 1, "floor");
  return Math.floor(coerceNumbers(args, "floor")[0]);
});

registerFormulaOperation("ceil", (args) => {
  requireArity(args, 1, "ceil");
  return Math.ceil(coerceNumbers(args, "ceil")[0]);
});

registerFormulaOperation("abs", (args) => {
  requireArity(args, 1, "abs");
  return Math.abs(coerceNumbers(args, "abs")[0]);
});

registerFormulaOperation("concat", (args) => {
  return args.map((a) => a == null ? "" : String(a)).join("");
});

registerFormulaOperation("uppercase", (args) => {
  requireArity(args, 1, "uppercase");
  return String(args[0]).toUpperCase();
});

registerFormulaOperation("lowercase", (args) => {
  requireArity(args, 1, "lowercase");
  return String(args[0]).toLowerCase();
});

registerFormulaOperation("capitalize", (args) => {
  requireArity(args, 1, "capitalize");
  return String(args[0]).replace(
    /\b\w/g,
    (ch) => ch.toUpperCase(),
  );
});

registerFormulaOperation("trim", (args) => {
  requireArity(args, 1, "trim");
  return String(args[0]).trim();
});

registerFormulaOperation("length", (args) => {
  requireArity(args, 1, "length");
  return String(args[0]).length;
});

registerFormulaOperation("replace", (args) => {
  requireArity(args, 3, "replace");
  return String(args[0]).replace(String(args[1]), String(args[2]));
});

// countChildren is handled specially in the evaluator — the registry entry
// receives the count as a single numeric arg after the evaluator resolves it.
registerFormulaOperation("countChildren", (args) => {
  requireArity(args, 1, "countChildren");
  return coerceNumbers(args, "countChildren")[0];
});

// ── Built-in tag evaluators ─────────────────────────────────────────────

registerFormulaTagEvaluator("x-formula-plus", (node, evaluate) => {
  const left = evaluate(node.fields["left"]!, "left");
  const right = evaluate(node.fields["right"]!, "right");
  if (left instanceof FormulaError) return left;
  if (right instanceof FormulaError) return right;
  return Number(left) + Number(right);
});

registerFormulaTagEvaluator("x-formula-minus", (node, evaluate) => {
  const left = evaluate(node.fields["left"]!, "left");
  const right = evaluate(node.fields["right"]!, "right");
  if (left instanceof FormulaError) return left;
  if (right instanceof FormulaError) return right;
  return Number(left) - Number(right);
});

registerFormulaTagEvaluator("x-formula-times", (node, evaluate) => {
  const left = evaluate(node.fields["left"]!, "left");
  const right = evaluate(node.fields["right"]!, "right");
  if (left instanceof FormulaError) return left;
  if (right instanceof FormulaError) return right;
  return Number(left) * Number(right);
});

registerFormulaTagEvaluator("x-formula-split-first", (node, evaluate) => {
  const source = evaluate(node.fields["source"]!, "source");
  if (source instanceof FormulaError) return source;
  const sepNode = node.fields["separator"];
  const separator = sepNode instanceof PrimitiveNode &&
      typeof sepNode.value === "string"
    ? sepNode.value
    : ", ";
  const str = String(source);
  const idx = str.indexOf(separator);
  return idx >= 0 ? str.slice(0, idx) : str;
});

registerFormulaTagEvaluator("x-formula-split-rest", (node, evaluate) => {
  const source = evaluate(node.fields["source"]!, "source");
  if (source instanceof FormulaError) return source;
  const sepNode = node.fields["separator"];
  const separator = sepNode instanceof PrimitiveNode &&
      typeof sepNode.value === "string"
    ? sepNode.value
    : ", ";
  const str = String(source);
  const idx = str.indexOf(separator);
  return idx >= 0 ? str.slice(idx + separator.length) : "";
});

// Short aliases (used when the $ref must survive CRDT validation)
registerFormulaTagEvaluator("split-first", (node, evaluate) => {
  const source = evaluate(node.fields["source"]!, "source");
  if (source instanceof FormulaError) return source;
  const sepNode = node.fields["separator"];
  const separator = sepNode instanceof PrimitiveNode &&
      typeof sepNode.value === "string"
    ? sepNode.value
    : ", ";
  const str = String(source);
  const idx = str.indexOf(separator);
  return idx >= 0 ? str.slice(0, idx) : str;
});

registerFormulaTagEvaluator("split-rest", (node, evaluate) => {
  const source = evaluate(node.fields["source"]!, "source");
  if (source instanceof FormulaError) return source;
  const sepNode = node.fields["separator"];
  const separator = sepNode instanceof PrimitiveNode &&
      typeof sepNode.value === "string"
    ? sepNode.value
    : ", ";
  const str = String(source);
  const idx = str.indexOf(separator);
  return idx >= 0 ? str.slice(idx + separator.length) : "";
});

// ── Child evaluation (transparent reference resolution) ─────────────────

/**
 * Evaluate a child node, transparently resolving references.
 * Callers never need to distinguish between a reference and an inline
 * value — references are navigated, and formula targets are evaluated,
 * before any type checking occurs.
 */
function evaluateChild(
  child: Node,
  root: Node,
  contextPath: Selector,
  visiting: Set<string>,
  depth: number,
): FormulaResult {
  if (child instanceof PrimitiveNode) return child.value;
  if (child instanceof ReferenceNode) {
    const targetPath = ReferenceNode.resolveReference(
      contextPath,
      child.selector,
    );
    if (targetPath === null) {
      return new FormulaError(
        `reference '${child.selector.format()}' could not be resolved`,
      );
    }
    const targets = root.navigate(targetPath);
    if (targets.length === 0) {
      return new FormulaError(
        `reference '${child.selector.format()}' not found`,
      );
    }
    if (targets.length > 1) {
      return new FormulaError(
        `reference '${child.selector.format()}' resolved to ${targets.length} values, expected 1`,
      );
    }
    const target = targets[0]!;
    if (target instanceof PrimitiveNode) return target.value;
    if (isFormulaNode(target)) {
      return evaluateFormulaNode(
        target as RecordNode,
        root,
        targetPath,
        visiting,
        depth + 1,
      );
    }
    return new FormulaError(
      `reference '${child.selector.format()}' resolved to non-primitive value`,
    );
  }
  if (isFormulaNode(child)) {
    return evaluateFormulaNode(
      child as RecordNode,
      root,
      contextPath,
      visiting,
      depth + 1,
    );
  }
  return new FormulaError("non-primitive, non-formula child");
}

// ── Evaluator ───────────────────────────────────────────────────────────

const MAX_DEPTH = 100;

/** Evaluate a single formula node given the full document root. */
export function evaluateFormulaNode(
  formula: RecordNode,
  root: Node,
  formulaPath: Selector,
  visiting: Set<string> = new Set(),
  depth: number = 0,
): FormulaResult {
  if (depth > MAX_DEPTH) {
    return new FormulaError("max depth exceeded");
  }

  const pathKey = formulaPath.format();
  if (visiting.has(pathKey)) {
    return new FormulaError("circular reference");
  }
  visiting.add(pathKey);

  const result = evaluateFormulaInner(
    formula,
    root,
    formulaPath,
    visiting,
    depth,
  );

  visiting.delete(pathKey);
  return result;
}

/**
 * Inner evaluation logic separated so the visiting-set cleanup in the
 * outer function always runs regardless of early returns.
 */
function evaluateFormulaInner(
  formula: RecordNode,
  root: Node,
  formulaPath: Selector,
  visiting: Set<string>,
  depth: number,
): FormulaResult {
  const tag = formula.tag;

  // Check for a tag-based evaluator first
  const tagEvaluator = lookupTagEvaluator(tag);
  if (tagEvaluator) {
    return tagEvaluator(formula, (child: Node, fieldName?: string) => {
      const childPath = fieldName
        ? new Selector([...formulaPath.segments, fieldName])
        : formulaPath;
      return evaluateChild(child, root, childPath, visiting, depth);
    });
  }

  // Default path: operation + args
  const opField = formula.fields["operation"];
  if (!(opField instanceof PrimitiveNode) || typeof opField.value !== "string") {
    return new FormulaError("formula missing 'operation' field");
  }
  const opName = opField.value;

  // Collect raw argument nodes
  const argsField = formula.fields["args"];
  let argNodes: readonly Node[];
  if (argsField === undefined) {
    argNodes = [];
  } else if (argsField instanceof ListNode) {
    argNodes = argsField.items;
  } else {
    return new FormulaError("formula 'args' must be a list node");
  }

  // Resolve each argument into primitive values
  const resolvedArgs: PrimitiveValue[] = [];

  for (let i = 0; i < argNodes.length; i++) {
    const argNode = argNodes[i]!;
    const argTreePath = new Selector([...formulaPath.segments, "args", i]);
    const result = resolveArgument(
      argNode,
      root,
      argTreePath,
      opName,
      visiting,
      depth,
    );
    if (result instanceof FormulaError) return result;
    for (const v of result) {
      resolvedArgs.push(v);
    }
  }

  // Look up and invoke the operation
  const op = lookupOperation(opName);
  if (!op) {
    return new FormulaError(`unknown operation '${opName}'`);
  }

  try {
    return op(resolvedArgs);
  } catch (err: unknown) {
    return new FormulaError(
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Resolve a single argument node into one or more primitive values.
 * References are resolved first — argument processing never sees raw refs.
 * Returns an array because wildcard refs can expand to multiple values.
 */
function resolveArgument(
  argNode: Node,
  root: Node,
  argPath: Selector,
  opName: string,
  visiting: Set<string>,
  depth: number,
): PrimitiveValue[] | FormulaError {
  if (argNode instanceof ReferenceNode) {
    return resolveRefArgument(
      argNode,
      root,
      argPath,
      opName,
      visiting,
      depth,
    );
  }

  if (argNode instanceof PrimitiveNode) {
    return [argNode.value];
  }

  if (isFormulaNode(argNode)) {
    const result = evaluateFormulaNode(
      argNode as RecordNode,
      root,
      argPath,
      visiting,
      depth + 1,
    );
    if (result instanceof FormulaError) return result;
    return [result];
  }

  if (argNode instanceof ListNode) {
    if (opName === "countChildren") {
      return [argNode.items.length];
    }
    return new FormulaError("cannot use list node as formula argument");
  }

  return new FormulaError("unsupported argument type");
}

/**
 * Resolve a reference argument. If the reference points to a formula,
 * evaluate it recursively. Wildcards expand to multiple values.
 */
function resolveRefArgument(
  ref: ReferenceNode,
  root: Node,
  contextPath: Selector,
  opName: string,
  visiting: Set<string>,
  depth: number,
): PrimitiveValue[] | FormulaError {
  const targetPath = ReferenceNode.resolveReference(
    contextPath,
    ref.selector,
  );
  if (targetPath === null) {
    return new FormulaError(
      `reference '${ref.selector.format()}' could not be resolved`,
    );
  }

  const targets = root.navigate(targetPath);

  if (targets.length === 0) {
    return new FormulaError(
      `reference '${ref.selector.format()}' not found`,
    );
  }

  // countChildren: return the count of resolved targets for wildcards,
  // or the items length for a list node
  if (opName === "countChildren") {
    if (targets.length === 1 && targets[0] instanceof ListNode) {
      return [(targets[0] as ListNode).items.length];
    }
    return [targets.length];
  }

  const values: PrimitiveValue[] = [];
  for (const target of targets) {
    if (isFormulaNode(target)) {
      const result = evaluateFormulaNode(
        target as RecordNode,
        root,
        targetPath,
        visiting,
        depth + 1,
      );
      if (result instanceof FormulaError) return result;
      values.push(result);
    } else if (target instanceof PrimitiveNode) {
      values.push(target.value);
    } else if (target instanceof ListNode) {
      for (const item of target.items) {
        if (item instanceof PrimitiveNode) {
          values.push(item.value);
        } else {
          return new FormulaError(
            `reference '${ref.selector.format()}' resolved to non-primitive list item`,
          );
        }
      }
    } else {
      return new FormulaError(
        `reference '${ref.selector.format()}' resolved to non-primitive value`,
      );
    }
  }

  return values;
}

// ── Evaluate all formulas ───────────────────────────────────────────────

/**
 * Walk the entire Node tree, find every formula node, evaluate it,
 * and return a map from path to result.
 */
export function evaluateAllFormulas(
  root: Node,
): Map<string, FormulaResult> {
  const results = new Map<string, FormulaResult>();
  const visiting = new Set<string>();

  root.forEach((path, node) => {
    if (isFormulaNode(node)) {
      const pathKey = path.format();
      if (!results.has(pathKey)) {
        results.set(
          pathKey,
          evaluateFormulaNode(
            node as RecordNode,
            root,
            path,
            visiting,
            0,
          ),
        );
      }
    }
  });

  return results;
}
