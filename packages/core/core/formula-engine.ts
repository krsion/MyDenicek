import type {
  PlainList,
  PlainNode,
  PlainRecord,
  PlainRef,
} from "./nodes/plain.ts";
import type { PrimitiveValue } from "./selector.ts";

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

// ── Type guards ─────────────────────────────────────────────────────────

function isPlainRef(node: PlainNode): node is PlainRef {
  return typeof node === "object" && node !== null && "$ref" in node &&
    typeof (node as PlainRef).$ref === "string";
}

function isPlainList(node: PlainNode): node is PlainList {
  return typeof node === "object" && node !== null && "$tag" in node &&
    "$items" in node;
}

function isPlainRecord(node: PlainNode): node is PlainRecord {
  return typeof node === "object" && node !== null && "$tag" in node &&
    !("$items" in node);
}

function isFormulaNode(node: PlainNode): node is PlainRecord {
  if (!isPlainRecord(node) || typeof node.$tag !== "string") return false;
  const tag = node.$tag as string;
  return tag.startsWith("x-formula") || tagEvaluators.has(tag);
}

function isPrimitive(node: PlainNode): node is PrimitiveValue {
  return typeof node === "string" || typeof node === "number" ||
    typeof node === "boolean";
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
 * The `evaluate` callback recursively evaluates child formula nodes.
 */
export type FormulaTagEvaluator = (
  node: PlainRecord,
  evaluate: (child: PlainNode, fieldName?: string) => FormulaResult,
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
  const left = evaluate(node.left as PlainNode, "left");
  const right = evaluate(node.right as PlainNode, "right");
  if (left instanceof FormulaError) return left;
  if (right instanceof FormulaError) return right;
  return Number(left) + Number(right);
});

registerFormulaTagEvaluator("x-formula-minus", (node, evaluate) => {
  const left = evaluate(node.left as PlainNode, "left");
  const right = evaluate(node.right as PlainNode, "right");
  if (left instanceof FormulaError) return left;
  if (right instanceof FormulaError) return right;
  return Number(left) - Number(right);
});

registerFormulaTagEvaluator("x-formula-times", (node, evaluate) => {
  const left = evaluate(node.left as PlainNode, "left");
  const right = evaluate(node.right as PlainNode, "right");
  if (left instanceof FormulaError) return left;
  if (right instanceof FormulaError) return right;
  return Number(left) * Number(right);
});

registerFormulaTagEvaluator("x-formula-split-first", (node, evaluate) => {
  const source = evaluate(node.source as PlainNode, "source");
  if (source instanceof FormulaError) return source;
  const separator = typeof node.separator === "string" ? node.separator : ", ";
  const str = String(source);
  const idx = str.indexOf(separator);
  return idx >= 0 ? str.slice(0, idx) : str;
});

registerFormulaTagEvaluator("x-formula-split-rest", (node, evaluate) => {
  const source = evaluate(node.source as PlainNode, "source");
  if (source instanceof FormulaError) return source;
  const separator = typeof node.separator === "string" ? node.separator : ", ";
  const str = String(source);
  const idx = str.indexOf(separator);
  return idx >= 0 ? str.slice(idx + separator.length) : "";
});

// Short aliases (used when the $ref must survive CRDT validation)
registerFormulaTagEvaluator("split-first", (node, evaluate) => {
  const source = evaluate(node.source as PlainNode, "source");
  if (source instanceof FormulaError) return source;
  const separator = typeof node.separator === "string" ? node.separator : ", ";
  const str = String(source);
  const idx = str.indexOf(separator);
  return idx >= 0 ? str.slice(0, idx) : str;
});

registerFormulaTagEvaluator("split-rest", (node, evaluate) => {
  const source = evaluate(node.source as PlainNode, "source");
  if (source instanceof FormulaError) return source;
  const separator = typeof node.separator === "string" ? node.separator : ", ";
  const str = String(source);
  const idx = str.indexOf(separator);
  return idx >= 0 ? str.slice(idx + separator.length) : "";
});

// ── Reference resolution ────────────────────────────────────────────────

/**
 * Resolve an absolute path string to matching nodes in the plain tree.
 * Supports record field access, list index access, wildcard `*`, and `..`
 * (parent navigation via an explicit parent stack).
 */
function navigatePlainNode(root: PlainNode, segments: string[]): PlainNode[] {
  // Each entry is [currentNode, parentStack] where parentStack lets us go up.
  type NavEntry = { node: PlainNode; parents: PlainNode[] };
  let current: NavEntry[] = [{ node: root, parents: [] }];

  for (const seg of segments) {
    const next: NavEntry[] = [];

    for (const entry of current) {
      const { node, parents } = entry;

      if (seg === "..") {
        if (parents.length > 0) {
          const parent = parents[parents.length - 1];
          next.push({ node: parent, parents: parents.slice(0, -1) });
        }
        continue;
      }

      if (seg === "*") {
        if (isPlainList(node)) {
          for (const item of node.$items) {
            next.push({ node: item, parents: [...parents, node] });
          }
        } else if (isPlainRecord(node)) {
          for (const key of Object.keys(node)) {
            if (key === "$tag") continue;
            next.push({
              node: node[key],
              parents: [...parents, node],
            });
          }
        }
        continue;
      }

      if (isPlainRecord(node) && seg in node && seg !== "$tag") {
        next.push({
          node: node[seg],
          parents: [...parents, node],
        });
      } else if (isPlainList(node)) {
        const idx = Number(seg);
        if (!Number.isNaN(idx) && idx >= 0 && idx < node.$items.length) {
          next.push({
            node: node.$items[idx],
            parents: [...parents, node],
          });
        }
      }
    }

    current = next;
  }

  return current.map((e) => e.node);
}

/** Split a `$ref` path string into navigation segments. */
function parseRefPath(refPath: string): string[] {
  const cleaned = refPath.startsWith("/") ? refPath.slice(1) : refPath;
  if (cleaned === "") return [];
  return cleaned.split("/");
}

/**
 * Resolve a `$ref` path relative to the formula's own position.
 * Absolute paths start with `/` and resolve from root.
 * Relative paths (containing `..`) resolve from the formula's location.
 */
function resolveRefPath(
  refPath: string,
  root: PlainNode,
  formulaPath: string,
): PlainNode[] {
  if (refPath.startsWith("/")) {
    return navigatePlainNode(root, parseRefPath(refPath));
  }

  // Relative path: start from the formula's parent location
  const formulaSegments = formulaPath === "" ? [] : formulaPath.split("/");
  const refSegments = parseRefPath(refPath);

  // Combine: navigate to formula location, then apply relative segments
  const combined = [...formulaSegments, ...refSegments];

  // Resolve ".." statically in the combined path
  const resolved: string[] = [];
  for (const seg of combined) {
    if (seg === "..") {
      resolved.pop();
    } else {
      resolved.push(seg);
    }
  }

  return navigatePlainNode(root, resolved);
}

// ── Evaluator ───────────────────────────────────────────────────────────

const MAX_DEPTH = 100;

/** Evaluate a single formula node given the full document root. */
export function evaluateFormulaNode(
  formula: PlainRecord,
  root: PlainNode,
  formulaPath: string,
  visiting: Set<string> = new Set(),
  depth: number = 0,
): FormulaResult {
  if (depth > MAX_DEPTH) {
    return new FormulaError("max depth exceeded");
  }

  if (visiting.has(formulaPath)) {
    return new FormulaError("circular reference");
  }
  visiting.add(formulaPath);

  const result = evaluateFormulaInner(
    formula,
    root,
    formulaPath,
    visiting,
    depth,
  );

  visiting.delete(formulaPath);
  return result;
}

/**
 * Inner evaluation logic separated so the visiting-set cleanup in the
 * outer function always runs regardless of early returns.
 */
function evaluateFormulaInner(
  formula: PlainRecord,
  root: PlainNode,
  formulaPath: string,
  visiting: Set<string>,
  depth: number,
): FormulaResult {
  const tag = formula.$tag as string;

  // Check for a tag-based evaluator first
  const tagEvaluator = lookupTagEvaluator(tag);
  if (tagEvaluator) {
    return tagEvaluator(formula, (child: PlainNode, fieldName?: string) => {
      if (isPrimitive(child)) return child;
      // Resolve $ref relative to the field that contains it, not the formula
      const childRefPath = fieldName
        ? formulaPath + "/" + fieldName
        : formulaPath;
      if (isPlainRef(child)) {
        const resolved = resolveRefArgument(
          child,
          root,
          childRefPath,
          tag,
          visiting,
          depth,
        );
        if (resolved instanceof FormulaError) return resolved;
        if (resolved.length === 1) return resolved[0];
        return new FormulaError(
          `reference '${child.$ref}' resolved to ${resolved.length} values, expected 1`,
        );
      }
      if (isFormulaNode(child)) {
        return evaluateFormulaNode(
          child,
          root,
          childRefPath,
          visiting,
          depth + 1,
        );
      }
      return new FormulaError("non-primitive, non-formula child");
    });
  }

  // Default path: operation + args
  const opName = formula.operation;
  if (typeof opName !== "string") {
    return new FormulaError("formula missing 'operation' field");
  }

  // Collect raw argument nodes
  const argsField = formula.args;
  let argNodes: readonly PlainNode[];
  if (argsField === undefined) {
    argNodes = [];
  } else if (isPlainList(argsField)) {
    argNodes = argsField.$items;
  } else {
    return new FormulaError("formula 'args' must be a list node");
  }

  // Resolve each argument into primitive values
  const resolvedArgs: PrimitiveValue[] = [];

  for (const argNode of argNodes) {
    const result = resolveArgument(
      argNode,
      root,
      formulaPath,
      opName as string,
      visiting,
      depth,
    );
    if (result instanceof FormulaError) return result;
    for (const v of result) {
      resolvedArgs.push(v);
    }
  }

  // Look up and invoke the operation
  const op = lookupOperation(opName as string);
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
 * Returns an array because wildcard refs can expand to multiple values.
 */
function resolveArgument(
  argNode: PlainNode,
  root: PlainNode,
  formulaPath: string,
  opName: string,
  visiting: Set<string>,
  depth: number,
): PrimitiveValue[] | FormulaError {
  if (isPrimitive(argNode)) {
    return [argNode];
  }

  if (isPlainRef(argNode)) {
    return resolveRefArgument(
      argNode,
      root,
      formulaPath,
      opName,
      visiting,
      depth,
    );
  }

  if (isFormulaNode(argNode)) {
    const nestedPath = formulaPath + "/$nested";
    const result = evaluateFormulaNode(
      argNode,
      root,
      nestedPath,
      visiting,
      depth + 1,
    );
    if (result instanceof FormulaError) return result;
    return [result];
  }

  // List or record that isn't a formula — can't use as arg directly
  if (isPlainList(argNode)) {
    // For countChildren, return the count
    if (opName === "countChildren") {
      return [argNode.$items.length];
    }
    return new FormulaError("cannot use list node as formula argument");
  }

  return new FormulaError("unsupported argument type");
}

/**
 * Resolve a `$ref` argument. If the reference points to a formula, evaluate
 * it recursively. Wildcards expand to multiple values.
 */
function resolveRefArgument(
  ref: PlainRef,
  root: PlainNode,
  formulaPath: string,
  opName: string,
  visiting: Set<string>,
  depth: number,
): PrimitiveValue[] | FormulaError {
  const targets = resolveRefPath(ref.$ref, root, formulaPath);

  if (targets.length === 0) {
    return new FormulaError(`reference '${ref.$ref}' not found`);
  }

  // countChildren: return the count of resolved targets for wildcards,
  // or the $items length for a list node
  if (opName === "countChildren") {
    if (targets.length === 1 && isPlainList(targets[0])) {
      return [targets[0].$items.length];
    }
    return [targets.length];
  }

  const values: PrimitiveValue[] = [];
  for (const target of targets) {
    if (isFormulaNode(target)) {
      const targetPath = computeTargetPath(ref.$ref, formulaPath);
      const result = evaluateFormulaNode(
        target,
        root,
        targetPath,
        visiting,
        depth + 1,
      );
      if (result instanceof FormulaError) return result;
      values.push(result);
    } else if (isPrimitive(target)) {
      values.push(target);
    } else if (isPlainList(target)) {
      // Flatten list items that are primitives
      for (const item of target.$items) {
        if (isPrimitive(item)) {
          values.push(item);
        } else {
          return new FormulaError(
            `reference '${ref.$ref}' resolved to non-primitive list item`,
          );
        }
      }
    } else {
      return new FormulaError(
        `reference '${ref.$ref}' resolved to non-primitive value`,
      );
    }
  }

  return values;
}

/** Compute a canonical path string for a referenced formula node. */
function computeTargetPath(refPath: string, formulaPath: string): string {
  if (refPath.startsWith("/")) {
    const cleaned = refPath.startsWith("/") ? refPath.slice(1) : refPath;
    return cleaned;
  }
  const formulaSegments = formulaPath === "" ? [] : formulaPath.split("/");
  const refSegments = parseRefPath(refPath);
  const combined = [...formulaSegments, ...refSegments];
  const resolved: string[] = [];
  for (const seg of combined) {
    if (seg === "..") {
      resolved.pop();
    } else {
      resolved.push(seg);
    }
  }
  return resolved.join("/");
}

// ── Evaluate all formulas ───────────────────────────────────────────────

/**
 * Walk the entire PlainNode tree, find every formula node, evaluate it,
 * and return a map from path to result.
 */
export function evaluateAllFormulas(
  doc: PlainNode,
): Map<string, FormulaResult> {
  const results = new Map<string, FormulaResult>();
  const visiting = new Set<string>();

  function walk(node: PlainNode, path: string): void {
    if (isPrimitive(node) || isPlainRef(node)) return;

    if (isFormulaNode(node)) {
      if (!results.has(path)) {
        results.set(
          path,
          evaluateFormulaNode(node, doc, path, visiting, 0),
        );
      }
      // Still walk children — a formula record may have nested structure
    }

    if (isPlainList(node)) {
      for (let i = 0; i < node.$items.length; i++) {
        walk(node.$items[i], path === "" ? String(i) : `${path}/${i}`);
      }
    } else if (isPlainRecord(node)) {
      for (const key of Object.keys(node)) {
        if (key === "$tag") continue;
        walk(
          node[key],
          path === "" ? key : `${path}/${key}`,
        );
      }
    }
  }

  walk(doc, "");
  return results;
}
