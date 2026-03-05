// ── Primitives & selectors ──────────────────────────────────────────

/** Scalar values that can appear as leaf nodes in the document tree. */
export type PrimitiveValue = string | number | boolean | null;

/**
 * A single segment in a selector path.
 * - `string` — record field name, `"*"` (all children), or `".."` (parent)
 * - `number` — list index position
 */
export type SelectorSegment = string | number;

/** An ordered path of segments addressing a node (or set of nodes) in the document tree. */
export type Selector = SelectorSegment[];



const isAll = (s: SelectorSegment): boolean => s === "*";
const isUp = (s: SelectorSegment): boolean => s === "..";

// ── Document nodes ──────────────────────────────────────────────────

/**
 * Immutable document tree node. Discriminated on `kind`:
 * - `record` — named fields (like a JSON object), with a structural `tag`
 * - `list` — ordered items (like a JSON array), with a structural `tag`
 * - `primitive` — leaf scalar value
 * - `reference` — a selector pointing to another node in the tree
 */
export type Node =
  | { kind: "record"; tag: string; fields: Record<string, Node> }
  | { kind: "list"; tag: string; items: Node[] }
  | { kind: "primitive"; value: PrimitiveValue }
  | { kind: "reference"; selector: Selector };

// ── Edit types ──────────────────────────────────────────────────────

/**
 * A single edit operation on the document tree. Discriminated on `kind`.
 * Every variant has a `target` selector addressing the node(s) to modify.
 * Structural edits automatically update all references affected by the change.
 */
export type Edit =
  | { kind: "primitive-edit"; target: Selector; op: string; args?: string }
  | { kind: "record-add"; target: Selector; field: string; node: Node }
  | {
    kind: "record-delete";
    target: Selector;
    field: string;
  }
  | { kind: "list-push-back"; target: Selector; node: Node }
  | { kind: "list-push-front"; target: Selector; node: Node }
  | { kind: "list-pop-back"; target: Selector }
  | { kind: "list-pop-front"; target: Selector }
  | { kind: "update-tag"; target: Selector; tag: string }
  | {
    kind: "record-rename-field";
    target: Selector;
    from: string;
    to: string;
  }
  | { kind: "copy"; target: Selector; source: Selector }
  | {
    kind: "wrap-record";
    target: Selector;
    field: string;
    tag: string;
  }
  | {
    kind: "wrap-list";
    target: Selector;
    tag: string;
  };

/** Replaces internal `Selector` fields with user-facing string paths. */
type WithStringPaths<T> = T extends { target: Selector; source: Selector }
  ? Omit<T, "target" | "source"> & { target: string; source: string }
  : T extends { target: Selector }
  ? Omit<T, "target"> & { target: string }
  : T;

/** User-facing edit description using string paths (e.g. `"person/name"`) instead of parsed selectors. */
export type EditInput = WithStringPaths<Edit>;

// ── Event graph ─────────────────────────────────────────────────────

/** Unique identifier for an event, scoped to a peer. */
export interface EventId {
  peer: string;
  seq: number;
}

/** An immutable edit event in the causal DAG, with parent links for ordering. */
export interface Event {
  id: EventId;
  parents: EventId[];
  edit: Edit;
}

/**
 * The core data structure: an initial document plus a causal DAG of edit events.
 * Peers produce events independently; graphs are merged by set-union via {@link merge}.
 */
export interface EventGraph {
  initial: Node;
  events: Record<string, Event>;
  frontiers: EventId[];
}

// ── Selector formatting ─────────────────────────────────────────────

/** Renders a selector as a human-readable path string (e.g. `"/person/name"`). */
export const formatSelector = (sel: Selector): string => {
  if (sel.length === 0) return "/";
  if (sel[0] === "/") return `/${sel.slice(1).map(String).join("/")}`;
  return sel.map(String).join("/");
};

/** Parses a path string into a {@link Selector}. Absolute paths start with `"/"`. */
export const selector = (path: string): Selector => {
  const trimmed = path.trim();
  if (trimmed === "" || trimmed === "/") return [];
  const isAbs = trimmed.startsWith("/");
  const parts = trimmed
    .replace(/^\//, "")
    .split("/")
    .filter((p) => p.length > 0)
    .map((part) => {
      if (part === "*" || part === "..") return part;
      const n = Number(part);
      return Number.isFinite(n) && String(n) === part ? n : part;
    });
  return isAbs ? ["/", ...parts] : parts;
};

// ── Node constructors ───────────────────────────────────────────────

/** Creates a primitive leaf node. */
export const primitive = (value: PrimitiveValue): Node => ({
  kind: "primitive",
  value,
});

/** Creates a record node with the given tag and named fields. */
export const record = (tag: string, fields: Record<string, Node>): Node => ({
  kind: "record",
  tag,
  fields,
});

/** Creates a list node with the given tag and ordered items. */
export const list = (tag: string, items: Node[]): Node => ({
  kind: "list",
  tag,
  items,
});

/** Creates a reference node pointing at the given selector path. */
export const reference = (path: string): Node => ({
  kind: "reference",
  selector: selector(path),
});

// ── Plain-object ↔ Node conversion ─────────────────────────────────

/**
 * User-facing plain JS representation of a document node.
 * - Primitives (`string`, `number`, `boolean`, `null`) → primitive nodes
 * - `{ $ref: "/path" }` → reference nodes
 * - `{ $tag: "t", $items: [...] }` → list nodes
 * - `{ $tag: "t", field: ... }` → record nodes
 */
export type PlainNode = PrimitiveValue | PlainRef | PlainRecord | PlainList;
export interface PlainRef { $ref: string }
export interface PlainList { $tag: string; $items: PlainNode[] }
export interface PlainRecord { $tag: string; [key: string]: PlainNode }

/** Converts a {@link PlainNode} into the internal {@link Node} representation. */
export const plainObjectToNode = (plain: PlainNode): Node => {
  if (plain === null || typeof plain !== "object") return primitive(plain);
  if ("$ref" in plain) return reference((plain as PlainRef).$ref);
  if ("$items" in plain && Array.isArray((plain as PlainList).$items)) {
    const l = plain as PlainList;
    return list(l.$tag, l.$items.map(plainObjectToNode));
  }
  const r = plain as PlainRecord;
  const fields: Record<string, Node> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === "$tag") continue;
    fields[k] = plainObjectToNode(v as PlainNode);
  }
  return record(r.$tag, fields);
};

// ── Selector matching ───────────────────────────────────────────────

const segmentsCompatible = (a: SelectorSegment, b: SelectorSegment): boolean =>
  a === b ||
  (isAll(a) && typeof b === "number") ||
  (typeof a === "number" && isAll(b));

const selectorsMatch = (path: Selector, target: Selector): boolean => {
  if (path.length !== target.length) return false;
  for (let i = 0; i < path.length; i++) {
    if (
      !segmentsCompatible(
        path[i] as SelectorSegment,
        target[i] as SelectorSegment,
      )
    ) {
      return false;
    }
  }
  return true;
};

type PrefixMatch = { specificPrefix: Selector; rest: Selector };

// Wildcard in prefix matches concrete index in full (but not vice versa),
// so structural edit targets with "*" can transform concrete selectors.
const removePrefix = (prefix: Selector, full: Selector): PrefixMatch | null => {
  if (prefix.length > full.length) return null;
  const specificPrefix: SelectorSegment[] = [];
  for (let i = 0; i < prefix.length; i++) {
    const prefixSeg = prefix[i] as SelectorSegment;
    const fullSeg = full[i] as SelectorSegment;
    if (prefixSeg === fullSeg) {
      specificPrefix.push(prefixSeg);
    } else if (isAll(prefixSeg) && typeof fullSeg === "number") {
      specificPrefix.push(fullSeg);
    } else {
      return null;
    }
  }
  return { specificPrefix, rest: full.slice(prefix.length) };
};

// ── Node utilities ──────────────────────────────────────────────────

const walkAndReplace = (
  node: Node,
  visitor: (path: Selector, current: Node) => Node | undefined,
  path: Selector = [],
): Node => {
  const direct = visitor(path, node);
  if (direct !== undefined) return direct;

  if (node.kind === "record") {
    let changed = false;
    const fields: Record<string, Node> = {};
    for (const [k, v] of Object.entries(node.fields)) {
      const next = walkAndReplace(v, visitor, [...path, k]);
      changed ||= next !== v;
      fields[k] = next;
    }
    return changed ? { kind: "record", tag: node.tag, fields } : node;
  }

  if (node.kind === "list") {
    let changed = false;
    const items = node.items.map((item, i) => {
      const next = walkAndReplace(item, visitor, [...path, i]);
      changed ||= next !== item;
      return next;
    });
    return changed ? { kind: "list", tag: node.tag, items } : node;
  }

  return node;
};

const walkDocument = (
  node: Node,
  visitor: (path: Selector, current: Node) => void,
  path: Selector = [],
): void => {
  visitor(path, node);
  if (node.kind === "record") {
    for (const [k, v] of Object.entries(node.fields)) {
      walkDocument(v, visitor, [...path, k]);
    }
  } else if (node.kind === "list") {
    for (const [i, item] of node.items.entries()) {
      walkDocument(item, visitor, [...path, i]);
    }
  }
};

type TracedNode = { path: Selector; node: Node };

const traceNodes = (node: Node, target: Selector): TracedNode[] => {
  const found: TracedNode[] = [];
  walkDocument(node, (path, current) => {
    if (selectorsMatch(path, target)) found.push({ path, node: current });
  });
  return found;
};

/** Returns all nodes in the document tree that match the given selector. */
const selectNodes = (node: Node, target: Selector): Node[] =>
  traceNodes(node, target).map((e) => e.node);

const selectorKey = (sel: Selector): string =>
  sel.length === 0 ? "<root>" : sel.map(String).join("/");

const replaceAtPaths = (node: Node, replacements: Record<string, Node>): Node =>
  walkAndReplace(node, (path) => replacements[selectorKey(path)]);

const mapMatchedNodes = (
  node: Node,
  target: Selector,
  transform: (current: Node) => Node,
): Node => {
  let matched = 0;
  const result = walkAndReplace(node, (path, current) => {
    if (!selectorsMatch(path, target)) return undefined;
    matched++;
    return transform(current);
  });
  if (matched === 0) {
    throw new Error(`No nodes match selector '${formatSelector(target)}'.`);
  }
  return result;
};

// ── Record helpers ──────────────────────────────────────────────────

const setField = (
  fields: Record<string, Node>,
  key: string,
  value: Node,
): Record<string, Node> => ({
  ...fields,
  [key]: value,
});

const deleteField = (
  fields: Record<string, Node>,
  key: string,
): Record<string, Node> => {
  const next = { ...fields };
  delete next[key];
  return next;
};

const renameField = (
  fields: Record<string, Node>,
  from: string,
  to: string,
): Record<string, Node> => {
  if (from === to || !(from in fields)) return fields;
  const result: Record<string, Node> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === from) result[to] = v;
    else if (k === to) continue;
    else result[k] = v;
  }
  return result;
};

// ── Reference resolution & mapping ──────────────────────────────────

/**
 * Resolves a (possibly relative) reference selector to an absolute path
 * by combining it with the node's position in the tree.
 * E.g. basePath=["person","age"], refSel=["..","name"] → ["person","name"]
 * @param basePath The base path of the current node.
 * @param refSel The reference selector to resolve.
 * @returns The resolved absolute path.
 */
const resolveReference = (basePath: Selector, refSel: Selector): Selector => {
  const isAbs = refSel.length > 0 && refSel[0] === "/";
  const combined = isAbs ? refSel.slice(1) : [...basePath, ...refSel];
  const stack: SelectorSegment[] = [];
  for (const seg of combined) {
    if (isUp(seg)) {
      if (stack.length === 0) {
        throw new Error("Reference escapes the document root.");
      }
      stack.pop();
    } else {
      stack.push(seg);
    }
  }
  return stack;
};

/**
 * Converts an absolute path into a relative selector from `basePath`.
 * Finds the longest common prefix, then prepends `".."` segments
 * to walk up from the base.
 *
 * E.g. basePath=["person","age"], absolutePath=["person","name"] → ["..","name"]
 */
const makeRelative = (basePath: Selector, absolutePath: Selector): Selector => {
  let common = 0;
  while (common < basePath.length && common < absolutePath.length) {
    const baseSeg = basePath[common] as SelectorSegment;
    const absSeg = absolutePath[common] as SelectorSegment;
    if (!segmentsCompatible(baseSeg, absSeg)) break;
    common++;
  }
  const ups: SelectorSegment[] = basePath.slice(common).map(() => "..");
  return [...ups, ...absolutePath.slice(common)];
};

/**
 * Rewrites all reference nodes in the tree after a structural edit (rename, wrap).
 *
 * The `transform` callback maps absolute selectors to their new locations
 * (e.g. after a rename, `/person/name` → `/person/fullName`).
 *
 * For each reference node, this function:
 * 1. Resolves its selector to an absolute path (handling relative `..` segments)
 * 2. Transforms both the reference's target and the node's own base path
 * 3. Converts back to absolute or relative form, preserving the original style
 */
const mapReferences = (
  node: Node,
  transform: (abs: Selector) => Selector,
): Node =>
  walkAndReplace(node, (basePath, current) => {
    if (current.kind !== "reference") return undefined;
    const isAbs = current.selector.length > 0 && current.selector[0] === "/";
    const resolved = resolveReference(basePath, current.selector);
    const mappedBase = transform(basePath);
    const mappedRef = transform(resolved);
    if (isAbs) {
      return { kind: "reference", selector: ["/", ...mappedRef] };
    }
    return { kind: "reference", selector: makeRelative(mappedBase, mappedRef) };
  });

// ── Structural selector transforms ─────────────────────────────────

const wrapRecordSelector = (
  wrappedField: string,
  wrapTarget: Selector,
  other: Selector,
): Selector => {
  const m = removePrefix(wrapTarget, other);
  return m == null ? other : [...m.specificPrefix, wrappedField, ...m.rest];
};

const wrapListSelector = (wrapTarget: Selector, other: Selector): Selector => {
  const m = removePrefix(wrapTarget, other);
  return m == null ? other : [...m.specificPrefix, "*", ...m.rest];
};

const renameFieldSelector = (
  renameTarget: Selector,
  from: string,
  to: string,
  other: Selector,
): Selector => {
  const m = removePrefix(renameTarget, other);
  if (m == null) return other;
  const [head, ...tail] = m.rest;
  if (head !== from) return other;
  return [...m.specificPrefix, to, ...tail];
};

// ── Primitive operations ────────────────────────────────────────────

const applyPrimitiveOp = (
  value: PrimitiveValue,
  op: string,
  args?: string,
): PrimitiveValue => {
  if (typeof value !== "string") return value;
  switch (op) {
    case "take-first":
      return value.slice(0, 1);
    case "skip-first":
      return value.slice(1);
    case "before-comma": {
      const c = value.indexOf(",");
      return c === -1 ? value : value.slice(0, c);
    }
    case "after-comma": {
      const c = value.indexOf(",");
      return c === -1 ? value : value.slice(c + 1);
    }
    case "upper":
      return value.toUpperCase();
    case "lower":
      return value.toLowerCase();
    case "replace": {
      if (args == null) return value;
      const slash = args.indexOf("/");
      if (slash === -1) return value;
      return value.replaceAll(args.slice(0, slash), args.slice(slash + 1));
    }
    default:
      return value;
  }
};

// ── Apply a single edit ─────────────────────────────────────────────

/**
 * Applies a transform to all nodes matching `edit.target`, asserting they are
 * the expected `kind`. Throws on zero matches or kind mismatch.
 */
const applyToMatched = <K extends Node["kind"]>(
  doc: Node,
  target: Selector,
  expectedKind: K,
  editKind: string,
  transform: (n: Extract<Node, { kind: K }>) => Node,
): Node =>
  mapMatchedNodes(doc, target, (n) => {
    if (n.kind !== expectedKind) {
      throw new Error(
        `${editKind}: expected ${expectedKind}, found '${n.kind}'`,
      );
    }
    return transform(n as Extract<Node, { kind: K }>);
  });

/**
 * Applies a transform and then rewrites all references.
 */
const applyStructural = (
  doc: Node,
  target: Selector,
  transform: (n: Node) => Node,
  rewriteRef: (abs: Selector) => Selector,
): Node => {
  const result = mapMatchedNodes(doc, target, transform);
  return mapReferences(result, rewriteRef);
};

const applyEdit = (doc: Node, edit: Edit): Node => {
  switch (edit.kind) {
    case "primitive-edit":
      return applyToMatched(doc, edit.target, "primitive", edit.kind, (n) => ({
        kind: "primitive",
        value: applyPrimitiveOp(n.value, edit.op, edit.args),
      }));

    case "record-add":
      return applyToMatched(doc, edit.target, "record", edit.kind, (n) => ({
        kind: "record",
        tag: n.tag,
        fields: setField(n.fields, edit.field, edit.node),
      }));

    case "record-delete":
      return applyToMatched(doc, edit.target, "record", edit.kind, (n) => ({
        kind: "record",
        tag: n.tag,
        fields: deleteField(n.fields, edit.field),
      }));

    case "record-rename-field":
      return applyStructural(
        applyToMatched(doc, edit.target, "record", edit.kind, (n) => ({
          kind: "record",
          tag: n.tag,
          fields: renameField(n.fields, edit.from, edit.to),
        })),
        edit.target,
        (n) => n,
        (abs) => renameFieldSelector(edit.target, edit.from, edit.to, abs),
      );

    case "list-push-back":
      return applyToMatched(doc, edit.target, "list", edit.kind, (n) => ({
        kind: "list",
        tag: n.tag,
        items: [...n.items, edit.node],
      }));

    case "list-push-front":
      return applyToMatched(doc, edit.target, "list", edit.kind, (n) => ({
        kind: "list",
        tag: n.tag,
        items: [edit.node, ...n.items],
      }));

    case "list-pop-back":
      return applyToMatched(doc, edit.target, "list", edit.kind, (n) => {
        if (n.items.length === 0) {
          throw new Error("list-pop-back: list is empty");
        }
        return { kind: "list", tag: n.tag, items: n.items.slice(0, -1) };
      });

    case "list-pop-front":
      return applyToMatched(doc, edit.target, "list", edit.kind, (n) => {
        if (n.items.length === 0) {
          throw new Error("list-pop-front: list is empty");
        }
        return { kind: "list", tag: n.tag, items: n.items.slice(1) };
      });

    case "update-tag":
      return mapMatchedNodes(doc, edit.target, (n) => {
        if (n.kind === "record") {
          return { kind: "record", tag: edit.tag, fields: n.fields };
        }
        if (n.kind === "list") {
          return { kind: "list", tag: edit.tag, items: n.items };
        }
        throw new Error(
          `update-tag: expected record or list, found '${n.kind}'`,
        );
      });

    case "wrap-record":
      return applyStructural(
        doc,
        edit.target,
        (n) => record(edit.tag, { [edit.field]: n }),
        (abs) => wrapRecordSelector(edit.field, edit.target, abs),
      );

    case "wrap-list":
      return applyStructural(
        doc,
        edit.target,
        (n) => list(edit.tag, [n]),
        (abs) => wrapListSelector(edit.target, abs),
      );

    case "copy": {
      const sourceNodes = traceNodes(doc, edit.source).map((e) => e.node);
      const targetNodes = traceNodes(doc, edit.target);
      if (sourceNodes.length === 0) {
        throw new Error(
          `copy: no nodes match source selector '${
            formatSelector(edit.source)
          }'`,
        );
      }
      if (targetNodes.length === 0) {
        throw new Error(
          `copy: no nodes match target selector '${
            formatSelector(edit.target)
          }'`,
        );
      }

      const replacements: Record<string, Node> = {};
      if (sourceNodes.length === targetNodes.length) {
        for (let i = 0; i < sourceNodes.length; i++) {
          replacements[selectorKey((targetNodes[i] as TracedNode).path)] =
            sourceNodes[i] as Node;
        }
      } else if (
        targetNodes.length === 1 &&
        targetNodes[0]?.node.kind === "list"
      ) {
        replacements[selectorKey(targetNodes[0]?.path)] = list(
          targetNodes[0]?.node.tag,
          sourceNodes,
        );
      } else {
        throw new Error(
          `copy: source/target arity mismatch (source=${sourceNodes.length}, target=${targetNodes.length}). Need equal counts or one list target.`,
        );
      }
      return replaceAtPaths(doc, replacements);
    }
  }
};

// ── Event graph internals ───────────────────────────────────────────

const eventKey = (id: EventId): string => `${id.peer}:${id.seq}`;

const compareEventIds = (a: EventId, b: EventId): number => {
  if (a.peer < b.peer) return -1;
  if (a.peer > b.peer) return 1;
  return a.seq - b.seq;
};

const normalizeParents = (parents: EventId[]): EventId[] => {
  const seen = new Map<string, EventId>();
  for (const p of parents) seen.set(eventKey(p), p);
  return [...seen.values()].sort(compareEventIds);
};

const computeFrontiers = (events: Record<string, Event>): EventId[] => {
  const parentKeys = new Set<string>();
  for (const ev of Object.values(events)) {
    for (const p of ev.parents) parentKeys.add(eventKey(p));
  }
  return Object.values(events)
    .map((ev) => ev.id)
    .filter((id) => !parentKeys.has(eventKey(id)))
    .sort(compareEventIds);
};

const computeNextSeqByPeer = (
  events: Record<string, Event>,
): Record<string, number> => {
  const next: Record<string, number> = {};
  for (const ev of Object.values(events)) {
    next[ev.id.peer] = Math.max(next[ev.id.peer] ?? 0, ev.id.seq + 1);
  }
  return next;
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  if (aKeys.length !== Object.keys(bObj).length) return false;
  return aKeys.every((k) => deepEqual(aObj[k], bObj[k]));
};

const validateEvent = (known: Record<string, Event>, event: Event): Event => {
  const key = eventKey(event.id);
  if (!Number.isInteger(event.id.seq) || event.id.seq < 0) {
    throw new Error(`Invalid seq for '${key}'.`);
  }
  const parents = normalizeParents(event.parents);
  if (parents.some((p) => eventKey(p) === key)) {
    throw new Error(`Event '${key}' is its own parent.`);
  }
  for (const p of parents) {
    if (known[eventKey(p)] == null) {
      throw new Error(`Unknown parent '${eventKey(p)}' for event '${key}'.`);
    }
  }
  return { ...event, parents };
};

// ── Public API ──────────────────────────────────────────────────────

/** Creates a new empty event graph with the given initial document (defaults to an empty record). */
const init = (initial: Node = record("root", {})): EventGraph => ({
  initial,
  events: {},
  frontiers: [],
});

/** Ingests an event produced by another peer. Idempotent — duplicate events are ignored. */
const applyRemoteEvent = (
  core: EventGraph,
  event: Event,
): EventGraph => {
  const key = eventKey(event.id);
  const existing = core.events[key];
  if (existing != null) {
    if (!deepEqual(existing, event)) {
      throw new Error(`Conflicting payload for event '${key}'.`);
    }
    return core;
  }
  const validated = validateEvent(core.events, event);
  const validatedKey = eventKey(validated.id);
  const events = { ...core.events, [validatedKey]: validated };
  const parentKeys = new Set(validated.parents.map(eventKey));
  const frontiers = [
    ...core.frontiers.filter((h) => !parentKeys.has(eventKey(h))),
    validated.id,
  ].sort(compareEventIds);
  return { initial: core.initial, events, frontiers };
};

/**
 * Appends a local edit to the event graph. Returns `[updatedGraph, newEvent]`.
 * Destructure with a leading semicolon for ASI safety: `;[core, event] = commitLocal(core, peer, edit)`.
 */
const commitLocal = (
  eventGraph: EventGraph,
  peer: string,
  input: EditInput,
): [EventGraph, Event] => {
  const edit: Edit = input.kind === "copy"
    ? { ...input, target: selector(input.target), source: selector(input.source) } as Edit
    : { ...input, target: selector(input.target) } as Edit;
  const seq = computeNextSeqByPeer(eventGraph.events)[peer] ?? 0;
  const event: Event = {
    id: { peer, seq },
    parents: [...eventGraph.frontiers],
    edit,
  };
  return [applyRemoteEvent(eventGraph, event), event];
};

/** Merges two event graphs (set-union of events). Both must share the same initial document. */
const mergeGraphs = (left: EventGraph, right: EventGraph): EventGraph => {
  if (!deepEqual(left.initial, right.initial)) {
    throw new Error("Cannot merge cores with different initial documents.");
  }
  const events: Record<string, Event> = { ...left.events };
  for (const ev of Object.values(right.events)) {
    const key = eventKey(ev.id);
    const existing = events[key];
    if (existing != null) {
      if (!deepEqual(existing, ev)) {
        throw new Error(`Conflicting payload for event '${key}' during merge.`);
      }
      continue;
    }
    events[key] = ev;
  }
  for (const ev of Object.values(events)) {
    for (const p of ev.parents) {
      if (events[eventKey(p)] == null) {
        throw new Error(
          `Merged core is missing parent '${eventKey(p)}' required by '${
            eventKey(ev.id)
          }'.`,
        );
      }
    }
  }
  return { initial: left.initial, events, frontiers: computeFrontiers(events) };
};

// ── Concurrency detection ───────────────────────────────────────────

const computeAncestors = (
  events: Record<string, Event>,
  ordered: string[],
): Record<string, Set<string>> => {
  const ancestors: Record<string, Set<string>> = {};
  for (const key of ordered) {
    const ev = events[key] as Event;
    const mine = new Set<string>();
    for (const p of ev.parents) {
      const pk = eventKey(p);
      mine.add(pk);
      const parentAnc = ancestors[pk];
      if (parentAnc != null) {
        for (const a of parentAnc) mine.add(a);
      }
    }
    ancestors[key] = mine;
  }
  return ancestors;
};

const isConcurrent = (
  ancestors: Record<string, Set<string>>,
  a: string,
  b: string,
): boolean => a !== b && !ancestors[a]?.has(b) && !ancestors[b]?.has(a);

// ── Edit selector transforms ────────────────────────────────────────

const transformSelector = (sel: Selector, priorEdit: Edit): Selector => {
  switch (priorEdit.kind) {
    case "record-rename-field":
      return renameFieldSelector(
        priorEdit.target,
        priorEdit.from,
        priorEdit.to,
        sel,
      );
    case "wrap-record":
      return wrapRecordSelector(priorEdit.field, priorEdit.target, sel);
    case "wrap-list":
      return wrapListSelector(priorEdit.target, sel);
    default:
      return sel;
  }
};

const transformEdit = (edit: Edit, priorEdit: Edit): Edit => {
  if (edit.kind === "copy") {
    return {
      ...edit,
      target: transformSelector(edit.target, priorEdit),
      source: transformSelector(edit.source, priorEdit),
    };
  }
  return {
    ...edit,
    target: transformSelector(edit.target, priorEdit),
  } as Edit;
};

const isStructuralEdit = (edit: Edit): boolean =>
  edit.kind === "record-rename-field" ||
  edit.kind === "wrap-record" ||
  edit.kind === "wrap-list";

const editSelectors = (edit: Edit): Selector[] =>
  edit.kind === "copy" ? [edit.target, edit.source] : [edit.target];

const hasWildcard = (edit: Edit): boolean =>
  editSelectors(edit).some((sel) => sel.some(isAll));

// ── Topological materialization ─────────────────────────────────────

const closureFrom = (
  events: Record<string, Event>,
  frontier: EventId[],
): Set<string> => {
  const closure = new Set<string>();
  const stack = frontier.map(eventKey);
  while (stack.length > 0) {
    const key = stack.pop() as string;
    if (closure.has(key)) continue;
    const ev = events[key];
    if (ev == null) throw new Error(`Unknown version '${key}'.`);
    closure.add(key);
    for (const p of ev.parents) stack.push(eventKey(p));
  }
  return closure;
};

// Binary insertion into a sorted array — O(log n) search + O(n) splice.
const insertSorted = (
  arr: string[],
  item: string,
  cmp: (a: string, b: string) => number,
): void => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cmp(arr[mid] as string, item) <= 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  arr.splice(lo, 0, item);
};

const topologicalOrder = (
  events: Record<string, Event>,
  frontier: EventId[],
): string[] => {
  const closure = closureFrom(events, frontier);
  const indegree: Record<string, number> = {};
  const children: Record<string, string[]> = {};
  for (const key of closure) {
    indegree[key] = 0;
    children[key] = [];
  }
  for (const key of closure) {
    const ev = events[key] as Event;
    for (const p of ev.parents) {
      const pk = eventKey(p);
      if (!closure.has(pk)) continue;
      indegree[key] = (indegree[key] ?? 0) + 1;
      children[pk]?.push(key);
    }
  }
  // Sort concurrent events: non-wildcard before wildcard, then by event ID
  const cmp = (a: string, b: string) => {
    const aWild = hasWildcard((events[a] as Event).edit) ? 1 : 0;
    const bWild = hasWildcard((events[b] as Event).edit) ? 1 : 0;
    if (aWild !== bWild) return aWild - bWild;
    return compareEventIds((events[a] as Event).id, (events[b] as Event).id);
  };

  const queue = Object.keys(indegree)
    .filter((key) => indegree[key] === 0)
    .sort(cmp);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const key = queue.shift() as string;
    ordered.push(key);
    for (const ch of children[key] as string[]) {
      indegree[ch] = (indegree[ch] ?? 0) - 1;
      if (indegree[ch] === 0) {
        insertSorted(queue, ch, cmp);
      }
    }
  }
  if (ordered.length !== closure.size) {
    throw new Error("Event graph contains a cycle.");
  }
  return ordered;
};

/**
 * Reconstructs the document by replaying events in deterministic topological order.
 * Concurrent structural edits (rename, wrap) automatically transform subsequent selectors.
 * Wildcard edits are deferred so they apply to concurrently inserted items.
 *
 * Complexity: O(n²) in the number of events (ancestor sets + linear scan of applied edits).
 *
 * @param eventGraph - The event graph to materialize.
 * @param frontiers - Optional frontier to materialize up to (defaults to the graph's current frontiers).
 */
export const materialize = (
  eventGraph: EventGraph,
  frontiers?: EventId[],
): Node => {
  const frontier = frontiers ?? eventGraph.frontiers;
  const ordered = topologicalOrder(eventGraph.events, frontier);
  const ancestors = computeAncestors(eventGraph.events, ordered);

  let doc = eventGraph.initial;
  const applied: { key: string; edit: Edit }[] = [];
  for (const key of ordered) {
    const ev = eventGraph.events[key] as Event;
    let edit = ev.edit;
    for (const prior of applied) {
      if (
        isStructuralEdit(prior.edit) &&
        isConcurrent(ancestors, key, prior.key)
      ) {
        edit = transformEdit(edit, prior.edit);
      }
    }
    doc = applyEdit(doc, edit);
    applied.push({ key, edit });
  }
  return doc;
};

// ── Formatting ──────────────────────────────────────────────────────

/** Converts a document node to a plain JS object for easy inspection. */
export const nodeToPlainObject = (node: Node): unknown => {
  switch (node.kind) {
    case "primitive":
      return node.value;
    case "reference":
      return formatSelector(node.selector);
    case "record": {
      const out: Record<string, unknown> = { $tag: node.tag };
      for (const [k, v] of Object.entries(node.fields)) out[k] = nodeToPlainObject(v);
      return out;
    }
    case "list":
      return { $tag: node.tag, $items: node.items.map(nodeToPlainObject) };
  }
};

/** Serializes a document node to a pretty-printed JSON string. */
export const formatNode = (node: Node): string =>
  JSON.stringify(nodeToPlainObject(node), null, 2);

// ── OO wrapper ──────────────────────────────────────────────────────

/**
 * A collaborative document scoped to a single peer.
 *
 * Hides the internal {@link EventGraph}, {@link Node} tree, and edit machinery
 * behind a plain-object interface: construct with a plain JS literal, mutate
 * with named methods, and read back via {@link toPlain}.
 */
export class Denicek {
  #graph: EventGraph;
  #pending: Event[] = [];
  readonly peer: string;

  constructor(peer: string, initial: PlainNode = { $tag: "root" }) {
    this.peer = peer;
    this.#graph = init(plainObjectToNode(initial));
  }

  private commit(input: EditInput): void {
    const [graph, event] = commitLocal(this.#graph, this.peer, input);
    this.#graph = graph;
    this.#pending.push(event);
  }

  /** Returns and clears events produced by local edits since the last drain. */
  drain(): Event[] {
    const events = this.#pending;
    this.#pending = [];
    return events;
  }

  /** Ingests an event produced by another peer. */
  applyRemote(event: Event): void {
    this.#graph = applyRemoteEvent(this.#graph, event);
  }

  add(target: string, field: string, value: PlainNode): void {
    this.commit({ kind: "record-add", target, field, node: plainObjectToNode(value) });
  }

  delete(target: string, field: string): void {
    this.commit({ kind: "record-delete", target, field });
  }

  rename(target: string, from: string, to: string): void {
    this.commit({ kind: "record-rename-field", target, from, to });
  }

  edit(target: string, op: string, args?: string): void {
    this.commit({ kind: "primitive-edit", target, op, args });
  }

  pushBack(target: string, value: PlainNode): void {
    this.commit({ kind: "list-push-back", target, node: plainObjectToNode(value) });
  }

  pushFront(target: string, value: PlainNode): void {
    this.commit({ kind: "list-push-front", target, node: plainObjectToNode(value) });
  }

  popBack(target: string): void {
    this.commit({ kind: "list-pop-back", target });
  }

  popFront(target: string): void {
    this.commit({ kind: "list-pop-front", target });
  }

  updateTag(target: string, tag: string): void {
    this.commit({ kind: "update-tag", target, tag });
  }

  wrapRecord(target: string, field: string, tag: string): void {
    this.commit({ kind: "wrap-record", target, field, tag });
  }

  wrapList(target: string, tag: string): void {
    this.commit({ kind: "wrap-list", target, tag });
  }

  copy(target: string, source: string): void {
    this.commit({ kind: "copy", target, source });
  }

  merge(other: Denicek): Denicek {
    const result = new Denicek(this.peer);
    result.#graph = mergeGraphs(this.#graph, other.#graph);
    return result;
  }

  materialize(): Node {
    return materialize(this.#graph);
  }

  toPlain(): unknown {
    return nodeToPlainObject(this.materialize());
  }
}
