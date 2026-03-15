import { BinaryHeap } from "@std/data-structures/binary-heap";

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
  | { kind: "set-value"; target: Selector; value: PrimitiveValue }
  | { kind: "record-add"; target: Selector; node: Node }
  | { kind: "record-delete"; target: Selector }
  | { kind: "list-push-back"; target: Selector; node: Node }
  | { kind: "list-push-front"; target: Selector; node: Node }
  | { kind: "list-pop-back"; target: Selector }
  | { kind: "list-pop-front"; target: Selector }
  | { kind: "update-tag"; target: Selector; tag: string }
  | { kind: "record-rename-field"; target: Selector; to: string }
  | { kind: "copy"; target: Selector; source: Selector }
  | { kind: "wrap-record"; target: Selector; field: string; tag: string;}
  | { kind: "wrap-list"; target: Selector; tag: string; };

// ── Event graph ─────────────────────────────────────────────────────

/** Unique identifier for an event, scoped to a peer. */
export interface EventId {
  peer: string;
  seq: number;
}

/** Vector clock mapping peer → latest seq seen. */
export type VectorClock = Record<string, number>;

/** An immutable edit event in the causal DAG, with parent links for ordering. */
export interface Event {
  id: EventId;
  parents: EventId[];
  edit: Edit;
  clock: VectorClock;
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
export const parseSelector = (path: string): Selector => {
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
  selector: parseSelector(path),
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
  const fields = Object.fromEntries(
    Object.entries(r)
      .filter(([k]) => k !== "$tag")
      .map(([k, v]) => [k, plainObjectToNode(v as PlainNode)]),
  );
  return record(r.$tag, fields);
};

// ── Selector matching ───────────────────────────────────────────────

const areSegmentsCompatible = (a: SelectorSegment, b: SelectorSegment): boolean =>
  a === b || (isAll(a) && typeof b === "number") || (typeof a === "number" && isAll(b));

const selectorsMatch = (path: Selector, target: Selector): boolean =>
  path.length === target.length &&
  path.every((seg, i) => areSegmentsCompatible(seg, target[i] as SelectorSegment));

/**
 * Result of matching a prefix selector against a full selector via {@link matchPrefix}.
 * - `specificPrefix` — the matched prefix with wildcards resolved to concrete indices
 *    (e.g. prefix `["items","*"]` matched against `["items",2,"name"]` yields `["items",2]`)
 * - `rest` — the unmatched tail segments (e.g. `["name"]`)
 */
type PrefixMatch = { specificPrefix: Selector; rest: Selector };

// Wildcard in prefix matches concrete index in full (but not vice versa),
// so structural edit targets with "*" can transform concrete selectors.
const matchPrefix = (prefix: Selector, full: Selector): PrefixMatch | null => {
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

/** Walks every node in the tree, calling `visitor` with its path. */
const forEachNode = (node: Node, visitor: (path: Selector, current: Node) => void, path: SelectorSegment[] = []): void => {
  visitor(path, node);
  if (node.kind === "record") {
    for (const [k, v] of Object.entries(node.fields)) {
      path.push(k);
      forEachNode(v, visitor, path);
      path.pop();
    }
  } else if (node.kind === "list") {
    for (let i = 0; i < node.items.length; i++) {
      path.push(i);
      forEachNode(node.items[i]!, visitor, path);
      path.pop();
    }
  }
};

/**
 * Maps over the tree, optionally replacing nodes.
 * If `visitor` returns a Node, that replaces the current node (children are not visited).
 * If `visitor` returns undefined, the node is kept and children are visited recursively.
 */
const mapTree = (node: Node, visitor: (path: Selector, current: Node) => Node | undefined, path: SelectorSegment[] = []): Node => {
  const replacement = visitor(path, node);
  if (replacement !== undefined) return replacement;

  if (node.kind === "record") {
    let changed = false;
    const fields: Record<string, Node> = {};
    for (const [k, v] of Object.entries(node.fields)) {
      path.push(k);
      const next = mapTree(v, visitor, path);
      path.pop();
      changed ||= next !== v;
      fields[k] = next;
    }
    return changed ? { kind: "record", tag: node.tag, fields } : node;
  }

  if (node.kind === "list") {
    let changed = false;
    const items = node.items.map((item, i) => {
      path.push(i);
      const next = mapTree(item, visitor, path);
      path.pop();
      changed ||= next !== item;
      return next;
    });
    return changed ? { kind: "list", tag: node.tag, items } : node;
  }

  return node;
};

type TracedNode = { path: Selector; node: Node };

/** Finds all nodes matching `target`, returning each with its concrete path. */
const traceNodes = (node: Node, target: Selector): TracedNode[] => {
  const found: TracedNode[] = [];
  forEachNode(node, (path, current) => {
    if (selectorsMatch(path, target)) found.push({ path: [...path], node: current });
  });
  return found;
};

/** Returns all nodes in the document tree that match the given selector. */
const selectNodes = (node: Node, target: Selector): Node[] => traceNodes(node, target).map((e) => e.node);

const formatSelectorKey = (sel: Selector): string => sel.length === 0 ? "<root>" : sel.map(seg => String(seg)).join("/");

const replaceAtPaths = (node: Node, replacements: Record<string, Node>): Node => mapTree(node, (path) => replacements[formatSelectorKey(path)]);

const mapMatchedNodes = (node: Node, target: Selector, transform: (current: Node) => Node): Node => {
  let matched = 0;
  const result = mapTree(node, (path, current) => {
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

const setField = (fields: Record<string, Node>, key: string, value: Node): Record<string, Node> => ({
  ...fields,
  [key]: value,
});

const deleteField = (fields: Record<string, Node>, key: string): Record<string, Node> =>
  Object.fromEntries(Object.entries(fields).filter(([k]) => k !== key));

const renameField = (fields: Record<string, Node>, from: string, to: string): Record<string, Node> => {
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
 * @returns The resolved absolute path, or `null` if the reference escapes the document root.
 */
const resolveReference = (basePath: Selector, refSel: Selector): Selector | null => {
  const isAbs = refSel.length > 0 && refSel[0] === "/";
  const combined = isAbs ? refSel.slice(1) : [...basePath, ...refSel];
  const stack: SelectorSegment[] = [];
  for (const seg of combined) {
    if (isUp(seg)) {
      if (stack.length === 0) {
        // Reference escapes the document root - return null to signal invalid ref
        return null;
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
    if (!areSegmentsCompatible(baseSeg, absSeg)) break;
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
 *
 * If a reference escapes the document root (invalid), it is left unchanged.
 * This ensures consistent behavior across all structural operations and
 * prevents crashes in CRDT scenarios where concurrent edits may create
 * temporarily invalid references.
 */
const mapReferences = (node: Node, transform: (abs: Selector) => Selector): Node =>
  mapTree(node, (basePath, current) => {
    if (current.kind !== "reference") return undefined;
    const isAbs = current.selector.length > 0 && current.selector[0] === "/";
    const resolved = resolveReference(basePath, current.selector);
    // If the reference escapes the document root, leave it unchanged
    if (resolved === null) return undefined;
    const mappedBase = transform(basePath);
    const mappedRef = transform(resolved);
    if (isAbs) {
      return { kind: "reference", selector: ["/", ...mappedRef] };
    }
    return { kind: "reference", selector: makeRelative(mappedBase, mappedRef) };
  });

// ── Structural selector transforms ─────────────────────────────────

const transformSelectorForRecordWrap = (wrappedField: string, wrapTarget: Selector, other: Selector): Selector => {
  const m = matchPrefix(wrapTarget, other);
  return m == null ? other : [...m.specificPrefix, wrappedField, ...m.rest];
};

const transformSelectorForListWrap = (wrapTarget: Selector, other: Selector): Selector => {
  const m = matchPrefix(wrapTarget, other);
  return m == null ? other : [...m.specificPrefix, "*", ...m.rest];
};

const transformSelectorForRename = (renameTarget: Selector, to: string, other: Selector): Selector => {
  const m = matchPrefix(renameTarget, other);
  if (m == null) return other;
  return [...m.specificPrefix.slice(0, -1), to, ...m.rest];
};

/** Shift numeric indices >= threshold by delta within a list targeted by listTarget. */
const shiftIndexSelector = (listTarget: Selector, threshold: number, delta: number, other: Selector): Selector | null => {
  const m = matchPrefix(listTarget, other);
  if (m == null || m.rest.length === 0) return other;
  const [head, ...tail] = m.rest;
  if (typeof head !== "number") return other;
  const shifted = head + (head >= threshold ? delta : 0);
  if (shifted < 0) return null; // index shifted out of bounds
  return [...m.specificPrefix, shifted, ...tail];
};

// ── Apply a single edit ─────────────────────────────────────────────

const expectRecord = (n: Node, editKind: string) => {
  if (n.kind !== "record") throw new Error(`${editKind}: expected record, found '${n.kind}'`);
  return n;
};

const expectList = (n: Node, editKind: string) => {
  if (n.kind !== "list") throw new Error(`${editKind}: expected list, found '${n.kind}'`);
  return n;
};

const applyEdit = (doc: Node, edit: Edit): Node => {
  switch (edit.kind) {
    case "set-value":
      return mapMatchedNodes(doc, edit.target, () => primitive(edit.value));

    case "record-add": {
      const parent = edit.target.slice(0, -1);
      const field = String(edit.target[edit.target.length - 1]);
      return mapMatchedNodes(doc, parent, (n) => {
        const r = expectRecord(n, edit.kind);
        return record(r.tag, setField(r.fields, field, edit.node));
      });
    }

    case "record-delete": {
      const parent = edit.target.slice(0, -1);
      const field = String(edit.target[edit.target.length - 1]);
      return mapMatchedNodes(doc, parent, (n) => {
        const r = expectRecord(n, edit.kind);
        return record(r.tag, deleteField(r.fields, field));
      });
    }

    case "record-rename-field": {
      const parent = edit.target.slice(0, -1);
      const from = String(edit.target[edit.target.length - 1]);
      const renamed = mapMatchedNodes(doc, parent, (n) => {
        const r = expectRecord(n, edit.kind);
        return record(r.tag, renameField(r.fields, from, edit.to));
      });
      return mapReferences(renamed, (abs) =>
        transformSelectorForRename(edit.target, edit.to, abs),
      );
    }

    case "list-push-back":
      return mapMatchedNodes(doc, edit.target, (n) => {
        const l = expectList(n, edit.kind);
        return list(l.tag, [...l.items, edit.node]);
      });

    case "list-push-front":
      return mapMatchedNodes(doc, edit.target, (n) => {
        const l = expectList(n, edit.kind);
        return list(l.tag, [edit.node, ...l.items]);
      });

    case "list-pop-back":
      return mapMatchedNodes(doc, edit.target, (n) => {
        const l = expectList(n, edit.kind);
        if (l.items.length === 0) throw new Error("list-pop-back: list is empty");
        return list(l.tag, l.items.slice(0, -1));
      });

    case "list-pop-front":
      return mapMatchedNodes(doc, edit.target, (n) => {
        const l = expectList(n, edit.kind);
        if (l.items.length === 0) throw new Error("list-pop-front: list is empty");
        return list(l.tag, l.items.slice(1));
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

    case "wrap-record": {
      const wrapped = mapMatchedNodes(doc, edit.target, (n) =>
        record(edit.tag, { [edit.field]: n }),
      );
      return mapReferences(wrapped, (abs) =>
        transformSelectorForRecordWrap(edit.field, edit.target, abs),
      );
    }

    case "wrap-list": {
      const wrapped = mapMatchedNodes(doc, edit.target, (n) =>
        list(edit.tag, [n]),
      );
      return mapReferences(wrapped, (abs) =>
        transformSelectorForListWrap(edit.target, abs),
      );
    }

    case "copy": {
      const sourceNodes = selectNodes(doc, edit.source);
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
          replacements[formatSelectorKey((targetNodes[i] as TracedNode).path)] =
            sourceNodes[i] as Node;
        }
      } else if (
        targetNodes.length === 1 &&
        targetNodes[0]?.node.kind === "list"
      ) {
        replacements[formatSelectorKey(targetNodes[0]?.path)] = list(
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

const formatEventKey = (id: EventId): string => `${id.peer}:${id.seq}`;

const compareByStableOrder = (a: EventId, b: EventId): number => {
  if (a.peer < b.peer) return -1;
  if (a.peer > b.peer) return 1;
  return a.seq - b.seq;
};



const areEventsEqual = (a: Event, b: Event): boolean => {
  if (a === b) return true;
  if (a.id.peer !== b.id.peer || a.id.seq !== b.id.seq) return false;
  if (a.parents.length !== b.parents.length) return false;
  for (let i = 0; i < a.parents.length; i++) {
    const ap = a.parents[i]!, bp = b.parents[i]!;
    if (ap.peer !== bp.peer || ap.seq !== bp.seq) return false;
  }
  const aKeys = Object.keys(a.clock);
  if (aKeys.length !== Object.keys(b.clock).length) return false;
  for (const k of aKeys) {
    if (a.clock[k] !== b.clock[k]) return false;
  }
  return areEditsEqual(a.edit, b.edit);
};

const areSelectorsEqual = (a: Selector, b: Selector): boolean =>
  a.length === b.length && a.every((seg, i) => seg === b[i]);

const areNodesEqual = (a: Node, b: Node): boolean => {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "primitive":
      return a.value === (b as typeof a).value;
    case "reference":
      return areSelectorsEqual(a.selector, (b as typeof a).selector);
    case "record": {
      const br = b as typeof a;
      if (a.tag !== br.tag) return false;
      const aKeys = Object.keys(a.fields);
      if (aKeys.length !== Object.keys(br.fields).length) return false;
      return aKeys.every((k) => k in br.fields && areNodesEqual(a.fields[k]!, br.fields[k]!));
    }
    case "list": {
      const bl = b as typeof a;
      if (a.tag !== bl.tag || a.items.length !== bl.items.length) return false;
      return a.items.every((item, i) => areNodesEqual(item, bl.items[i]!));
    }
  }
};

const areEditsEqual = (a: Edit, b: Edit): boolean => {
  if (a.kind !== b.kind) return false;
  if (!areSelectorsEqual(a.target, b.target)) return false;
  switch (a.kind) {
    case "set-value":
      return a.value === (b as typeof a).value;
    case "record-add":
    case "list-push-back":
    case "list-push-front":
      return areNodesEqual(a.node, (b as typeof a).node);
    case "record-delete":
    case "list-pop-back":
    case "list-pop-front":
      return true;
    case "update-tag":
      return a.tag === (b as typeof a).tag;
    case "record-rename-field":
      return a.to === (b as typeof a).to;
    case "copy":
      return areSelectorsEqual(a.source, (b as typeof a).source);
    case "wrap-record":
      return a.field === (b as typeof a).field && a.tag === (b as typeof a).tag;
    case "wrap-list":
      return a.tag === (b as typeof a).tag;
  }
};

const validateEvent = (known: Record<string, Event>, event: Event): Event => {
  const key = formatEventKey(event.id);
  if (!Number.isInteger(event.id.seq) || event.id.seq < 0) {
    throw new Error(`Invalid seq for '${key}'.`);
  }
  if (event.parents.some((p) => formatEventKey(p) === key)) {
    throw new Error(`Event '${key}' is its own parent.`);
  }
  for (const p of event.parents) {
    if (known[formatEventKey(p)] == null) {
      throw new Error(`Unknown parent '${formatEventKey(p)}' for event '${key}'.`);
    }
  }
  return event;
};

// ── Public API ──────────────────────────────────────────────────────

/** Creates a new empty event graph with the given initial document (defaults to an empty record). */
const createEventGraph = (initial: Node = record("root", {})): EventGraph => ( { initial, events: {}, frontiers: [] });

/** Computes new frontiers after adding an event: removes its parents, adds itself. */
const updateFrontiers = (current: EventId[], event: Event): EventId[] => {
  const parentKeys = new Set(event.parents.map(formatEventKey));
  return [
    ...current.filter((h) => !parentKeys.has(formatEventKey(h))),
    event.id,
  ].sort(compareByStableOrder);
};

/** Ingests an event produced by another peer. Idempotent — duplicate events are ignored. */
const applyRemoteEvent = (core: EventGraph, event: Event): EventGraph => {
  const key = formatEventKey(event.id);
  const existing = core.events[key];
  if (existing != null) {
    if (!areEventsEqual(existing, event)) {
      throw new Error(`Conflicting payload for event '${key}'.`);
    }
    return core;
  }
  const validated = validateEvent(core.events, event);
  const events = { ...core.events, [formatEventKey(validated.id)]: validated };
  return { initial: core.initial, events, frontiers: updateFrontiers(core.frontiers, validated) };
};

const commitLocalEdit = (eventGraph: EventGraph, peer: string, edit: Edit): [EventGraph, Event] => {
  const parents = [...eventGraph.frontiers];
  const clock: VectorClock = {};
  for (const p of parents) {
    for (const [k, v] of Object.entries(eventGraph.events[formatEventKey(p)]?.clock ?? {})) {
      clock[k] = Math.max(clock[k] ?? -1, v);
    }
  }
  clock[peer] = (clock[peer] ?? -1) + 1;
  const event: Event = { id: { peer, seq: clock[peer] }, parents, edit, clock };
  return [applyRemoteEvent(eventGraph, event), event];
};

// ── Concurrency detection ───────────────────────────────────────────

const clockDominates = (a: VectorClock, b: VectorClock): boolean => Object.entries(b).every(([peer, seq]) => (a[peer] ?? -1) >= seq);

const isConcurrent = (a: Event, b: Event): boolean => a !== b && !clockDominates(a.clock, b.clock) && !clockDominates(b.clock, a.clock);

// ── Edit selector transforms ────────────────────────────────────────

const transformSelector = (sel: Selector, priorEdit: Edit): Selector | null => {
  switch (priorEdit.kind) {
    case "record-rename-field": {
      return transformSelectorForRename(priorEdit.target, priorEdit.to, sel);
    }
    case "wrap-record":
      return transformSelectorForRecordWrap(priorEdit.field, priorEdit.target, sel);
    case "wrap-list":
      return transformSelectorForListWrap(priorEdit.target, sel);
    case "record-delete": {
      // target includes the field as last segment — drop edits traversing it
      const m = matchPrefix(priorEdit.target, sel);
      if (m != null) return null;
      return sel;
    }
    case "list-push-front":
      return shiftIndexSelector(priorEdit.target, 0, +1, sel);
    case "list-pop-front": {
      const m = matchPrefix(priorEdit.target, sel);
      if (m != null && m.rest.length > 0 && m.rest[0] === 0) return null;
      return shiftIndexSelector(priorEdit.target, 1, -1, sel);
    }
    case "list-pop-back":
    case "list-push-back":
      return sel;
    default:
      return sel;
  }
};

const transformEdit = (edit: Edit, priorEdit: Edit): Edit | null => {
  if (edit.kind === "copy") {
    const target = transformSelector(edit.target, priorEdit);
    const source = transformSelector(edit.source, priorEdit);
    if (target === null || source === null) return null;
    return { ...edit, target, source };
  }
  const target = transformSelector(edit.target, priorEdit);
  if (target === null) return null;

  return { ...edit, target } as Edit;
};

const STRUCTURAL_EDITS: ReadonlySet<Edit["kind"]> = new Set([
  "record-rename-field", "record-delete",
  "wrap-record", "wrap-list",
  "list-push-front", "list-push-back",
  "list-pop-front", "list-pop-back",
]);

const isStructuralEdit = (edit: Edit): boolean =>
  STRUCTURAL_EDITS.has(edit.kind);

const getEditSelectors = (edit: Edit): Selector[] =>
  edit.kind === "copy" ? [edit.target, edit.source] : [edit.target];

/** Checks whether an edit can be applied to the current document state. */
const canApplyEdit = (doc: Node, edit: Edit): boolean => {
  if (edit.kind === "copy") {
    const sourceNodes = selectNodes(doc, edit.source);
    const targetNodes = selectNodes(doc, edit.target);
    if (sourceNodes.length === 0 || targetNodes.length === 0) return false;
    if (sourceNodes.length !== targetNodes.length) {
      if (targetNodes.length !== 1 || targetNodes[0]?.kind !== "list") return false;
    }
    return true;
  }

  const targets = getEditSelectors(edit);
  for (const target of targets) {
    const effective =
      edit.kind === "record-add" ||
      edit.kind === "record-delete" ||
      edit.kind === "record-rename-field"
        ? target.slice(0, -1)
        : target;
    const nodes = selectNodes(doc, effective);
    if (nodes.length === 0) return false;
    for (const node of nodes) {
      switch (edit.kind) {
        case "set-value":
          break;
        case "record-add":
        case "record-delete":
        case "record-rename-field":
          if (node.kind !== "record") return false;
          break;
        case "list-push-back":
        case "list-push-front":
          if (node.kind !== "list") return false;
          break;
        case "list-pop-back":
        case "list-pop-front":
          if (node.kind !== "list" || node.items.length === 0) return false;
          break;
        case "update-tag":
          if (node.kind !== "record" && node.kind !== "list") return false;
          break;
      }
    }
  }
  return true;
};

// ── Topological materialization ─────────────────────────────────────

/**
 * Returns the set of all event keys reachable from `frontier` by walking parent links.
 *
 * Two uses:
 * - **Sync**: called with a remote peer's frontiers (strict=false) to determine which
 *   events they've already seen, so `eventsSince` can compute the diff.
 * - **Materialization**: called with a custom frontier to materialize the document at a
 *   historical point (a subset of the full graph). When called with the graph's own
 *   frontiers, the closure is the entire graph.
 *
 * If `strict` is true, throws on missing events; if false, silently skips them
 * (necessary for remote frontiers that may reference events not yet received).
 */
const computeClosure = (events: Record<string, Event>, frontier: EventId[], strict = true): Set<string> => {
  const closure = new Set<string>();
  const stack = frontier.map(formatEventKey);
  while (stack.length > 0) {
    const key = stack.pop() as string;
    if (closure.has(key)) continue;
    const ev = events[key];
    if (ev == null) {
      if (strict) throw new Error(`Unknown version '${key}'.`);
      continue;
    }
    closure.add(key);
    for (const p of ev.parents) stack.push(formatEventKey(p));
  }
  return closure;
};

const computeTopologicalOrder = (events: Record<string, Event>, frontier: EventId[]): string[] => {
  const closure = computeClosure(events, frontier);
  const indegree: Record<string, number> = {};
  const children: Record<string, string[]> = {};
  for (const key of closure) {
    indegree[key] = 0;
    children[key] = [];
  }
  for (const key of closure) {
    const ev = events[key] as Event;
    for (const p of ev.parents) {
      const pk = formatEventKey(p);
      if (!closure.has(pk)) continue;
      indegree[key] = (indegree[key] ?? 0) + 1;
      children[pk]?.push(key);
    }
  }
  // Sort concurrent events: more generic (wildcard) before more specific,
  // then by event ID for stability.
  // Returns negative when left should be processed before right.
  const compareEvents = (leftKey: string, rightKey: string) => {
    const leftEvent = events[leftKey] as Event, rightEvent = events[rightKey] as Event;
    const leftTarget = leftEvent.edit.target, rightTarget = rightEvent.edit.target;
    const minLength = Math.min(leftTarget.length, rightTarget.length);
    for (let i = 0; i < minLength; i++) {
      const leftIsAll = isAll(leftTarget[i] as SelectorSegment);
      const rightIsAll = isAll(rightTarget[i] as SelectorSegment);
      if (leftIsAll && !rightIsAll) return -1;
      if (!leftIsAll && rightIsAll) return 1;
    }
    if (leftTarget.length !== rightTarget.length) return leftTarget.length - rightTarget.length;
    return compareByStableOrder(leftEvent.id, rightEvent.id);
  };

  const queue = new BinaryHeap<string>(compareEvents);
  for (const key of Object.keys(indegree)) {
    if (indegree[key] === 0) queue.push(key);
  }
  const ordered: string[] = [];
  while (queue.length > 0) {
    const key = queue.pop()!;
    ordered.push(key);
    for (const ch of children[key] as string[]) {
      indegree[ch] = (indegree[ch] ?? 0) - 1;
      if (indegree[ch] === 0) {
        queue.push(ch);
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
 * Complexity: O(n × c × p) where n = total events, c = max concurrent events per
 * sync round, p = peers. For typical usage where peers sync frequently, c << n.
 *
 * @param eventGraph - The event graph to materialize.
 * @param frontiers - Optional frontier to materialize up to (defaults to the graph's current frontiers).
 */
/**
 * Transforms an edit against all concurrent prior structural edits.
 * Returns the transformed edit (or null if invalidated) and whether
 * any concurrent events were encountered.
 */
const resolveEdit = (ev: Event, applied: { ev: Event; edit: Edit }[]): { edit: Edit | null; hasConcurrent: boolean } => {
  let edit: Edit | null = ev.edit;
  let hasConcurrent = false;
  for (const prior of applied) {
    if (clockDominates(ev.clock, prior.ev.clock)) continue;
    if (isConcurrent(ev, prior.ev)) {
      hasConcurrent = true;
      if (edit !== null && isStructuralEdit(prior.edit)) {
        edit = transformEdit(edit, prior.edit);
      }
    }
  }
  return { edit, hasConcurrent };
};

export const materialize = (eventGraph: EventGraph, frontiers?: EventId[]): Node => {
  const frontier = frontiers ?? eventGraph.frontiers;
  const ordered = computeTopologicalOrder(eventGraph.events, frontier);

  let doc = eventGraph.initial;
  const applied: { ev: Event; edit: Edit }[] = [];
  for (const key of ordered) {
    const ev = eventGraph.events[key] as Event;
    const { edit, hasConcurrent } = resolveEdit(ev, applied);
    if (edit !== null) {
      if (hasConcurrent && !canApplyEdit(doc, edit)) {
        continue;
      }
      doc = applyEdit(doc, edit);
      applied.push({ ev, edit });
    }
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
  private graph: EventGraph;
  private pending: Event[] = [];
  private buffered: Event[] = [];
  readonly peer: string;

  constructor(peer: string, initial?: PlainNode);
  constructor(peer: string, graph: EventGraph);
  constructor(peer: string, arg?: PlainNode | EventGraph) {
    this.peer = peer;
    if (arg && typeof arg === "object" && "events" in arg) {
      this.graph = arg as EventGraph;
    } else {
      this.graph = createEventGraph(plainObjectToNode((arg as PlainNode) ?? { $tag: "root" }));
    }
  }

  private assertEditApplies(edit: Edit): void {
    applyEdit(this.materialize(), edit);
  }

  private commit(edit: Edit): void {
    this.assertEditApplies(edit);
    const [graph, event] = commitLocalEdit(this.graph, this.peer, edit);
    this.graph = graph;
    this.pending.push(event);
  }

  /** Returns and clears events produced by local edits since the last drain. */
  drain(): Event[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  /** Returns the current frontier (tip event IDs). Exchange with another peer
   *  to compute which events need to be sent via {@link eventsSince}. */
  get frontiers(): EventId[] {
    return [...this.graph.frontiers];
  }

  /** Returns all events that the holder of `remoteFrontiers` hasn't seen.
   *  Idempotent — safe to call repeatedly or after network failures.
   *  Events are returned in arbitrary order; the consumer must handle
   *  out-of-order delivery (e.g. via {@link applyRemote}'s buffering). */
  eventsSince(remoteFrontiers: EventId[]): Event[] {
    const remoteKnown = computeClosure(this.graph.events, remoteFrontiers, false);
    return Object.values(this.graph.events).filter(
      (ev) => !remoteKnown.has(formatEventKey(ev.id)),
    );
  }

  /** Ingests an event produced by another peer. Buffers out-of-order events. */
  applyRemote(event: Event): void {
    this.buffered.push(event);
    this.flushBuffered();
  }

  private flushBuffered(): void {
    // NOTE: Intentionally mutates this.graph.events and this.graph.frontiers
    // in place for O(1) per-event insertion. The functional applyRemoteEvent
    // creates a new events object each time (O(n) per event, O(n²) for a batch).
    // This is the only place where EventGraph is mutated rather than replaced.
    // Index buffered events, filtering out duplicates already in the graph
    const pending = new Map<string, Event>();
    for (const event of this.buffered) {
      const key = formatEventKey(event.id);
      const existing = this.graph.events[key];
      if (existing != null) {
        if (!areEventsEqual(existing, event)) {
          throw new Error(`Conflicting payload for event '${key}'.`);
        }
        continue;
      }
      pending.set(key, event);
    }

    if (pending.size === 0) {
      this.buffered = [];
      return;
    }

    // Compute wait counts and reverse dependency index
    const waitCount = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const [key, event] of pending) {
      let count = 0;
      for (const p of event.parents) {
        const pk = formatEventKey(p);
        if (this.graph.events[pk] == null) {
          count++;
          let deps = dependents.get(pk);
          if (deps == null) {
            deps = [];
            dependents.set(pk, deps);
          }
          deps.push(key);
        }
      }
      waitCount.set(key, count);
    }

    // Seed the ready queue with events whose parents are all satisfied
    const ready: string[] = [];
    for (const [key, count] of waitCount) {
      if (count === 0) ready.push(key);
    }

    // Process ready events, decrementing dependents as we go
    while (ready.length > 0) {
      const key = ready.pop()!;
      const event = pending.get(key)!;
      pending.delete(key);

      const validated = validateEvent(this.graph.events, event);
      this.graph.events[formatEventKey(validated.id)] = validated;
      this.graph.frontiers = updateFrontiers(this.graph.frontiers, validated);

      const deps = dependents.get(key);
      if (deps != null) {
        for (const depKey of deps) {
          const newCount = waitCount.get(depKey)! - 1;
          waitCount.set(depKey, newCount);
          if (newCount === 0 && pending.has(depKey)) {
            ready.push(depKey);
          }
        }
      }
    }

    // Events with unmet dependencies remain buffered
    this.buffered = [...pending.values()];
  }

  add(target: string, field: string, value: PlainNode): void {
    const path = target === "" ? field : `${target}/${field}`;
    this.commit({ kind: "record-add", target: parseSelector(path), node: plainObjectToNode(value) });
  }

  delete(target: string, field: string): void {
    const path = target === "" ? field : `${target}/${field}`;
    this.commit({ kind: "record-delete", target: parseSelector(path) });
  }

  rename(target: string, from: string, to: string): void {
    const path = target === "" ? from : `${target}/${from}`;
    this.commit({ kind: "record-rename-field", target: parseSelector(path), to });
  }

  set(target: string, value: PrimitiveValue): void {
    this.commit({ kind: "set-value", target: parseSelector(target), value });
  }

  pushBack(target: string, value: PlainNode): void {
    this.commit({ kind: "list-push-back", target: parseSelector(target), node: plainObjectToNode(value) });
  }

  pushFront(target: string, value: PlainNode): void {
    this.commit({ kind: "list-push-front", target: parseSelector(target), node: plainObjectToNode(value) });
  }

  popBack(target: string): void {
    this.commit({ kind: "list-pop-back", target: parseSelector(target) });
  }

  popFront(target: string): void {
    this.commit({ kind: "list-pop-front", target: parseSelector(target) });
  }

  updateTag(target: string, tag: string): void {
    this.commit({ kind: "update-tag", target: parseSelector(target), tag });
  }

  wrapRecord(target: string, field: string, tag: string): void {
    this.commit({ kind: "wrap-record", target: parseSelector(target), field, tag });
  }

  wrapList(target: string, tag: string): void {
    this.commit({ kind: "wrap-list", target: parseSelector(target), tag });
  }

  copy(target: string, source: string): void {
    this.commit({ kind: "copy", target: parseSelector(target), source: parseSelector(source) });
  }

  materialize(): Node {
    return materialize(this.graph);
  }

  toPlain(): unknown {
    return nodeToPlainObject(this.materialize());
  }
}
