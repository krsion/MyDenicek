import { BinaryHeap } from "@std/data-structures/binary-heap";

// ── Primitives ──────────────────────────────────────────────────────

/** Scalar values that can appear as leaf nodes in the document tree. */
export type PrimitiveValue = string | number | boolean;

/**
 * A single segment in a selector path.
 * - `string` — record field name, `"*"` (all children), or `".."` (parent)
 * - `number` — list index position
 */
export type SelectorSegment = string | number;

// ── Selector ────────────────────────────────────────────────────────

type PrefixMatch = { kind: "matched"; specificPrefix: Selector; rest: Selector } | { kind: "no-match" };
type SelectorTransform = { kind: "mapped"; selector: Selector } | { kind: "removed" };

const NO_PREFIX_MATCH: PrefixMatch = { kind: "no-match" };
const REMOVED_SELECTOR: SelectorTransform = { kind: "removed" };

function mapSelector(selector: Selector): SelectorTransform {
  return { kind: "mapped", selector };
}

/** An ordered path of segments addressing a node (or set of nodes) in the document tree. */
export class Selector {
  readonly segments: SelectorSegment[];

  constructor(segments: SelectorSegment[]) {
    this.segments = segments;
  }

  static parse(path: string): Selector {
    const trimmed = path.trim();
    if (trimmed === "" || trimmed === "/") return new Selector([]);
    const isAbs = trimmed.startsWith("/");
    const parts = trimmed
      .replace(/^\//, "")
      .split("/")
      .filter((p) => p.length > 0)
      .map((part): SelectorSegment => {
        if (part === "*" || part === "..") return part;
        const n = Number(part);
        return Number.isFinite(n) && String(n) === part ? n : part;
      });
    return new Selector(isAbs ? ["/", ...parts] : parts);
  }

  format(): string {
    if (this.segments.length === 0) return "/";
    if (this.segments[0] === "/") return `/${this.segments.slice(1).map(String).join("/")}`;
    return this.segments.map(String).join("/");
  }

  get isAbsolute(): boolean {
    return this.segments.length > 0 && this.segments[0] === "/";
  }

  get parent(): Selector {
    return new Selector(this.segments.slice(0, -1));
  }

  get lastSegment(): SelectorSegment {
    return this.segments[this.segments.length - 1]!;
  }

  get length(): number {
    return this.segments.length;
  }

  at(index: number): SelectorSegment | undefined {
    return this.segments.at(index);
  }

  slice(start: number, end?: number): Selector {
    return new Selector(this.segments.slice(start, end));
  }

  equals(other: Selector): boolean {
    return this.segments.length === other.segments.length &&
      this.segments.every((seg, i) => seg === other.segments[i]);
  }

  /***
   * If `this` is a prefix of `full` (e.g., `a/*` is a prefix of `a/1/b`),
   * returns the specific prefix segments and the remaining suffix.
   */
  matchPrefix(full: Selector): PrefixMatch {
    if (this.segments.length > full.segments.length) return NO_PREFIX_MATCH;
    const specificPrefix: SelectorSegment[] = [];
    for (let i = 0; i < this.segments.length; i++) {
      const prefixSeg = this.segments[i]!;
      const fullSeg = full.segments[i]!;
      if (prefixSeg === fullSeg) {
        specificPrefix.push(prefixSeg);
      } else if (prefixSeg === "*" && typeof fullSeg === "number") {
        specificPrefix.push(fullSeg);
      } else {
        return NO_PREFIX_MATCH;
      }
    }
    return { kind: "matched", specificPrefix: new Selector(specificPrefix), rest: full.slice(this.segments.length) };
  }

  /** Shifts numeric indices in `other` that traverse through this selector's list target. */
  shiftIndex(other: Selector, threshold: number, delta: number): SelectorTransform {
    const m = this.matchPrefix(other);
    if (m.kind === "no-match" || m.rest.length === 0) return mapSelector(other);
    const head = m.rest.segments[0]!;
    const tail = m.rest.slice(1);
    if (typeof head !== "number") return mapSelector(other);
    const shifted = head + (head >= threshold ? delta : 0);
    if (shifted < 0) return REMOVED_SELECTOR;
    return mapSelector(new Selector([...m.specificPrefix.segments, shifted, ...tail.segments]));
  }
}



// ── EventId ─────────────────────────────────────────────────────────

export class EventId {
  constructor(readonly peer: string, readonly seq: number) {}

  format(): string {
    return `${this.peer}:${this.seq}`;
  }

  compareTo(other: EventId): number {
    if (this.peer < other.peer) return -1;
    if (this.peer > other.peer) return 1;
    return this.seq - other.seq;
  }

  equals(other: EventId): boolean {
    return this.peer === other.peer && this.seq === other.seq;
  }
}

// ── VectorClock ─────────────────────────────────────────────────────

export class VectorClock {
  private entries: Record<string, number>;

  constructor(entries?: Record<string, number>) {
    this.entries = entries ? { ...entries } : {};
  }

  get(peer: string): number {
    return this.entries[peer] ?? -1;
  }

  set(peer: string, seq: number): void {
    this.entries[peer] = seq;
  }

  tick(peer: string): number {
    const next = this.get(peer) + 1;
    this.entries[peer] = next;
    return next;
  }

  dominates(other: VectorClock): boolean {
    return Object.entries(other.entries).every(([peer, seq]) => this.get(peer) >= seq);
  }

  merge(other: VectorClock): void {
    for (const [peer, seq] of Object.entries(other.entries)) {
      this.entries[peer] = Math.max(this.get(peer), seq);
    }
  }

  equals(other: VectorClock): boolean {
    const aKeys = Object.keys(this.entries);
    if (aKeys.length !== Object.keys(other.entries).length) return false;
    return aKeys.every((k) => this.entries[k] === other.get(k));
  }

  clone(): VectorClock {
    return new VectorClock(this.entries);
  }
}

// ── PlainNode types ─────────────────────────────────────────────────

export type PlainNode = PrimitiveValue | PlainRef | PlainRecord | PlainList;
export interface PlainRef { $ref: string }
export interface PlainList { $tag: string; $items: PlainNode[] }
export interface PlainRecord { $tag: string; [key: string]: PlainNode }

// ── Node hierarchy ──────────────────────────────────────────────────

/**
 * Mutable document tree node. Subclassed as:
 * - {@link RecordNode} — named fields (like a JSON object), with a structural `tag`
 * - {@link ListNode} — ordered items (like a JSON array), with a structural `tag`
 * - {@link PrimitiveNode} — leaf scalar value
 * - {@link ReferenceNode} — a selector pointing to another node in the tree
 */
export abstract class Node {
  abstract clone(): Node;
  abstract toPlain(): unknown;
  abstract equals(other: Node): boolean;

  /** Returns child nodes matching the given segment, for navigation. */
  protected abstract resolveSegment(seg: SelectorSegment): { key: SelectorSegment; child: Node }[];

  /** Replaces a child at the given key. Used by copy and wrap operations. */
  abstract replaceChild(key: SelectorSegment, replacement: Node): void;

  /** Wraps children at the given key with a wrapper function. */
  abstract wrapChild(key: SelectorSegment, wrapper: (child: Node) => Node): void;

  // ── Polymorphic edit operations ───────────────────────────────────
  // Subclasses override the methods they support and return true.
  // Default: return false (not applicable to this node type).

  setPrimitive(_value: PrimitiveValue): boolean { return false; }
  addField(_name: string, _value: Node): boolean { return false; }
  deleteField(_name: string): boolean { return false; }
  renameField(_from: string, _to: string): boolean { return false; }
  pushBack(_node: Node): boolean { return false; }
  pushFront(_node: Node): boolean { return false; }
  popBack(): boolean { return false; }
  popFront(): boolean { return false; }
  updateTag(_tag: string): boolean { return false; }
  setItems(_items: Node[]): boolean { return false; }

  /** Called during updateReferences — only ReferenceNode overrides to update its selector. */
  protected applyReferenceTransform(_basePath: Selector, _transform: (abs: Selector) => Selector): void {}

  /** Follows selector segments to collect matched nodes. */
  navigate(target: Selector, depth = 0): Node[] {
    if (depth === target.length) return [this];
    const entries = this.resolveSegment(target.segments[depth]!);
    const result: Node[] = [];
    for (const { child } of entries) {
      result.push(...child.navigate(target, depth + 1));
    }
    return result;
  }

  /** Follows selector segments to collect matched nodes with their concrete paths. */
  navigateWithPaths(target: Selector, depth = 0, path: SelectorSegment[] = []): { path: Selector; node: Node }[] {
    if (depth === target.length) return [{ path: new Selector([...path]), node: this }];
    const entries = this.resolveSegment(target.segments[depth]!);
    const result: { path: Selector; node: Node }[] = [];
    for (const { key, child } of entries) {
      path.push(key);
      result.push(...child.navigateWithPaths(target, depth + 1, path));
      path.pop();
    }
    return result;
  }

  /** Walks every node in the tree, calling `visitor` with its path. */
  forEach(visitor: (path: Selector, node: Node) => void, path: SelectorSegment[] = []): void {
    visitor(new Selector([...path]), this);
    this.forEachChild(visitor, path);
  }

  /** Visits children — overridden by RecordNode and ListNode. */
  protected forEachChild(_visitor: (path: Selector, node: Node) => void, _path: SelectorSegment[]): void {}

  /** Rewrites all reference nodes in the tree after a structural edit. Mutates in place. */
  updateReferences(transform: (abs: Selector) => Selector): void {
    this.forEach((basePath, current) => {
      current.applyReferenceTransform(basePath, transform);
    });
  }

  /** Replaces the node at a concrete path within this tree. */
  replaceAtPath(path: Selector, replacement: Node): void {
    if (path.length === 0) return;
    for (const parent of this.navigate(path.parent)) {
      parent.replaceChild(path.lastSegment, replacement);
    }
  }

  /** Wraps nodes at the given selector path with a wrapper function. */
  wrapAtPath(target: Selector, wrapper: (child: Node) => Node): void {
    if (target.length === 0) throw new Error("Cannot wrap the root node.");
    if (target.length === 1) {
      this.wrapChild(target.lastSegment, wrapper);
      return;
    }
    for (const parent of this.navigate(target.parent)) {
      parent.wrapChild(target.lastSegment, wrapper);
    }
  }

  static fromPlain(plain: PlainNode): Node {
    if (plain === null) throw new Error("Null is not a valid PlainNode.");
    if (typeof plain !== "object") return new PrimitiveNode(plain);
    if ("$ref" in plain) return new ReferenceNode(Selector.parse((plain as PlainRef).$ref));
    if ("$items" in plain && Array.isArray((plain as PlainList).$items)) {
      const l = plain as PlainList;
      return new ListNode(l.$tag, l.$items.map(Node.fromPlain));
    }
    const r = plain as PlainRecord;
    const fields: Record<string, Node> = {};
    for (const [k, v] of Object.entries(r)) {
      if (k !== "$tag") fields[k] = Node.fromPlain(v as PlainNode);
    }
    return new RecordNode(r.$tag, fields);
  }
}



export class RecordNode extends Node {
  tag: string;
  fields: Record<string, Node>;

  constructor(tag: string, fields: Record<string, Node>) {
    super();
    this.tag = tag;
    this.fields = fields;
  }

  override addField(name: string, value: Node): boolean {
    this.fields[name] = value;
    return true;
  }

  override deleteField(name: string): boolean {
    const result: Record<string, Node> = {};
    for (const k in this.fields) {
      if (k !== name) result[k] = this.fields[k]!;
    }
    this.fields = result;
    return true;
  }

  override renameField(from: string, to: string): boolean {
    if (from === to || !(from in this.fields)) return true;
    const result: Record<string, Node> = {};
    for (const k in this.fields) {
      if (k === from) result[to] = this.fields[k]!;
      else if (k === to) continue;
      else result[k] = this.fields[k]!;
    }
    this.fields = result;
    return true;
  }

  override updateTag(tag: string): boolean {
    this.tag = tag;
    return true;
  }

  protected resolveSegment(seg: SelectorSegment): { key: SelectorSegment; child: Node }[] {
    if (typeof seg === "string" && seg in this.fields) {
      return [{ key: seg, child: this.fields[seg]! }];
    }
    return [];
  }

  replaceChild(key: SelectorSegment, replacement: Node): void {
    if (typeof key === "string") this.fields[key] = replacement;
  }

  wrapChild(key: SelectorSegment, wrapper: (child: Node) => Node): void {
    if (typeof key === "string" && key in this.fields) {
      this.fields[key] = wrapper(this.fields[key]!);
    }
  }

  protected override forEachChild(visitor: (path: Selector, node: Node) => void, path: SelectorSegment[]): void {
    for (const k in this.fields) {
      path.push(k);
      this.fields[k]!.forEach(visitor, path);
      path.pop();
    }
  }

  clone(): RecordNode {
    const fields: Record<string, Node> = {};
    for (const k in this.fields) fields[k] = this.fields[k]!.clone();
    return new RecordNode(this.tag, fields);
  }

  toPlain(): unknown {
    const out: Record<string, unknown> = { $tag: this.tag };
    for (const k in this.fields) out[k] = this.fields[k]!.toPlain();
    return out;
  }

  equals(other: Node): boolean {
    if (!(other instanceof RecordNode)) return false;
    if (this.tag !== other.tag) return false;
    const aKeys = Object.keys(this.fields);
    if (aKeys.length !== Object.keys(other.fields).length) return false;
    return aKeys.every((k) => k in other.fields && this.fields[k]!.equals(other.fields[k]!));
  }
}

export class ListNode extends Node {
  tag: string;
  items: Node[];

  constructor(tag: string, items: Node[]) {
    super();
    this.tag = tag;
    this.items = items;
  }

  override pushBack(node: Node): boolean {
    this.items.push(node);
    return true;
  }

  override pushFront(node: Node): boolean {
    this.items.unshift(node);
    return true;
  }

  override popBack(): boolean {
    if (this.items.length === 0) throw new Error("list-pop-back: list is empty");
    this.items.pop();
    return true;
  }

  override popFront(): boolean {
    if (this.items.length === 0) throw new Error("list-pop-front: list is empty");
    this.items.shift();
    return true;
  }

  override updateTag(tag: string): boolean {
    this.tag = tag;
    return true;
  }

  override setItems(items: Node[]): boolean {
    this.items = items;
    return true;
  }

  protected resolveSegment(seg: SelectorSegment): { key: SelectorSegment; child: Node }[] {
    if (seg === "*") {
      return this.items.map((child, i) => ({ key: i, child }));
    }
    if (typeof seg === "number" && seg >= 0 && seg < this.items.length) {
      return [{ key: seg, child: this.items[seg]! }];
    }
    return [];
  }

  replaceChild(key: SelectorSegment, replacement: Node): void {
    if (typeof key === "number" && key >= 0 && key < this.items.length) {
      this.items[key] = replacement;
    }
  }

  wrapChild(key: SelectorSegment, wrapper: (child: Node) => Node): void {
    if (key === "*") {
      for (let i = 0; i < this.items.length; i++) {
        this.items[i] = wrapper(this.items[i]!);
      }
    } else if (typeof key === "number" && key >= 0 && key < this.items.length) {
      this.items[key] = wrapper(this.items[key]!);
    }
  }

  protected override forEachChild(visitor: (path: Selector, node: Node) => void, path: SelectorSegment[]): void {
    for (let i = 0; i < this.items.length; i++) {
      path.push(i);
      this.items[i]!.forEach(visitor, path);
      path.pop();
    }
  }

  clone(): ListNode {
    return new ListNode(this.tag, this.items.map((item) => item.clone()));
  }

  toPlain(): unknown {
    return { $tag: this.tag, $items: this.items.map((item) => item.toPlain()) };
  }

  equals(other: Node): boolean {
    if (!(other instanceof ListNode)) return false;
    if (this.tag !== other.tag || this.items.length !== other.items.length) return false;
    return this.items.every((item, i) => item.equals(other.items[i]!));
  }
}

export class PrimitiveNode extends Node {
  value: PrimitiveValue;

  constructor(value: PrimitiveValue) {
    super();
    this.value = value;
  }

  override setPrimitive(value: PrimitiveValue): boolean {
    this.value = value;
    return true;
  }

  protected resolveSegment(): { key: SelectorSegment; child: Node }[] { return []; }
  replaceChild(): void {}
  wrapChild(): void {}

  clone(): PrimitiveNode {
    return new PrimitiveNode(this.value);
  }

  toPlain(): PrimitiveValue {
    return this.value;
  }

  equals(other: Node): boolean {
    return other instanceof PrimitiveNode && this.value === other.value;
  }
}

export class ReferenceNode extends Node {
  selector: Selector;

  constructor(selector: Selector) {
    super();
    this.selector = selector;
  }

  protected resolveSegment(): { key: SelectorSegment; child: Node }[] { return []; }
  replaceChild(): void {}
  wrapChild(): void {}

  protected override applyReferenceTransform(basePath: Selector, transform: (abs: Selector) => Selector): void {
    const resolved = ReferenceNode.resolveReference(basePath, this.selector);
    if (resolved === null) return;
    const mappedBase = transform(basePath);
    const mappedRef = transform(resolved);
    if (this.selector.isAbsolute) {
      this.selector = new Selector(["/", ...mappedRef.segments]);
    } else {
      this.selector = ReferenceNode.makeRelative(mappedBase, mappedRef);
    }
  }

  clone(): ReferenceNode {
    return new ReferenceNode(new Selector([...this.selector.segments]));
  }

  toPlain(): string {
    return this.selector.format();
  }

  equals(other: Node): boolean {
    return other instanceof ReferenceNode && this.selector.equals(other.selector);
  }

  /** Resolves a (possibly relative) reference to an absolute path. */
  static resolveReference(basePath: Selector, refSel: Selector): Selector | null {
    const combined = refSel.isAbsolute
      ? refSel.segments.slice(1)
      : [...basePath.segments, ...refSel.segments];
    const stack: SelectorSegment[] = [];
    for (const seg of combined) {
      if (seg === "..") {
        if (stack.length === 0) return null;
        stack.pop();
      } else {
        stack.push(seg);
      }
    }
    return new Selector(stack);
  }

  /** Converts an absolute path into a relative selector from `basePath`. */
  static makeRelative(basePath: Selector, absolutePath: Selector): Selector {
    let common = 0;
    while (common < basePath.length && common < absolutePath.length) {
      const baseSeg = basePath.segments[common]!;
      const absSeg = absolutePath.segments[common]!;
      const compatible = baseSeg === absSeg ||
        (baseSeg === "*" && typeof absSeg === "number") ||
        (typeof baseSeg === "number" && absSeg === "*");
      if (!compatible) break;
      common++;
    }
    const ups: SelectorSegment[] = basePath.slice(common).segments.map(() => "..");
    return new Selector([...ups, ...absolutePath.slice(common).segments]);
  }
}

// ── Edit hierarchy (Command pattern) ────────────────────────────────

/**
 * A single edit operation on the document tree.
 * Each subclass implements apply/transformSelector/equals.
 */
export abstract class Edit {
  abstract readonly target: Selector;
  abstract readonly isStructural: boolean;

  /**
   * Mutates `doc` in place to apply this edit.
   * Concrete edits throw on type mismatch or missing path.
   * Explicit replay no-ops are surfaced by materialization as conflicts.
   */
  abstract apply(doc: Node): void;
  abstract canApply(doc: Node): boolean;

  /** Transforms another selector through the structural change made by this edit. */
  abstract transformSelector(sel: Selector): SelectorTransform;

  abstract equals(other: Edit): boolean;

  /** Returns a copy of this edit with a different target. */
  abstract withTarget(target: Selector): Edit;

  get selectors(): Selector[] {
    return [this.target];
  }

  /** Returns a transformed copy of this edit accounting for a prior concurrent structural edit. */
  transform(prior: Edit): Edit {
    const t = prior.transformSelector(this.target);
    return t.kind === "mapped"
      ? this.withTarget(t.selector)
      : this.handleRemovedTarget(prior);
  }

  protected navigateOrThrow(doc: Node, target: Selector): Node[] {
    const nodes = doc.navigate(target);
    if (nodes.length === 0) {
      throw new Error(`No nodes match selector '${target.format()}'.`);
    }
    return nodes;
  }

  protected assertRecord(n: Node): RecordNode {
    if (!(n instanceof RecordNode)) throw new Error(`${this.constructor.name}: expected record, found '${n.constructor.name}'`);
    return n;
  }

  protected assertList(n: Node): ListNode {
    if (!(n instanceof ListNode)) throw new Error(`${this.constructor.name}: expected list, found '${n.constructor.name}'`);
    return n;
  }

  /** Builds a conflict node describing an edit that couldn't be applied. */
  protected conflict(data?: Node): RecordNode {
    const fields: Record<string, Node> = {
      kind: new PrimitiveNode(this.constructor.name),
      target: new PrimitiveNode(this.target.format()),
    };
    if (data) fields.data = data;
    return new RecordNode("conflict", fields);
  }

  protected canFindNodes(doc: Node, target: Selector): boolean {
    return doc.navigate(target).length > 0;
  }

  protected canFindNodesOfType(doc: Node, target: Selector, predicate: (node: Node) => boolean): boolean {
    const nodes = doc.navigate(target);
    return nodes.length > 0 && nodes.every(predicate);
  }

  protected handleRemovedTarget(prior: Edit): Edit {
    throw new Error(
      `${this.constructor.name} must explicitly handle removal of '${this.target.format()}' by ${prior.constructor.name}.`,
    );
  }

  protected createRemovedTargetNoOp(prior: Edit): NoOpEdit {
    return new NoOpEdit(
      this.target,
      `${prior.constructor.name} removed '${this.target.format()}' before ${this.constructor.name} could apply.`,
    );
  }

  protected transformSelectorOrThrow(sel: Selector): Selector {
    const result = this.transformSelector(sel);
    if (result.kind === "removed") {
      throw new Error(`${this.constructor.name}: unexpectedly removed selector '${sel.format()}' while updating references.`);
    }
    return result.selector;
  }
}

abstract class NoOpOnRemovedTargetEdit extends Edit {
  protected override handleRemovedTarget(prior: Edit): Edit {
    return this.createRemovedTargetNoOp(prior);
  }
}

/**
 * Explicit replay no-op used when concurrent structural edits remove or
 * overwrite an edit's target before replay.
 */
class NoOpEdit extends Edit {
  readonly isStructural = false;

  constructor(readonly target: Selector, readonly reason: string) { super(); }

  apply(_doc: Node): void {
    throw new Error("NoOpEdit must be surfaced as a conflict during materialization.");
  }

  toConflict(): RecordNode {
    return this.conflict(new PrimitiveNode(this.reason));
  }

  canApply(_doc: Node): boolean {
    return true;
  }

  transformSelector(sel: Selector): SelectorTransform { return mapSelector(sel); }

  override transform(_prior: Edit): Edit {
    return this;
  }

  equals(other: Edit): boolean {
    return other instanceof NoOpEdit &&
      this.target.equals(other.target) &&
      this.reason === other.reason;
  }

  withTarget(target: Selector): NoOpEdit { return new NoOpEdit(target, this.reason); }
}

export class SetValueEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = false;

  constructor(readonly target: Selector, readonly value: PrimitiveValue) { super(); }

  apply(doc: Node): void {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const node of nodes) {
      if (!node.setPrimitive(this.value)) {
        throw new Error(`${this.constructor.name}: expected PrimitiveNode, found '${node.constructor.name}'`);
      }
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(doc, this.target, (node) => node instanceof PrimitiveNode);
  }

  transformSelector(sel: Selector): SelectorTransform { return mapSelector(sel); }

  equals(other: Edit): boolean {
    return other instanceof SetValueEdit&& this.target.equals(other.target) && this.value === other.value;
  }

  withTarget(target: Selector): SetValueEdit { return new SetValueEdit(target, this.value); }
}

export class RecordAddEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = false;

  constructor(readonly target: Selector, readonly node: Node) { super(); }

  apply(doc: Node): void {
    const parentSel = this.target.parent;
    const field = String(this.target.lastSegment);
    const parents = this.navigateOrThrow(doc, parentSel);
    for (const parent of parents) {
      if (!parent.addField(field, this.node.clone())) this.assertRecord(parent);
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(doc, this.target.parent, (node) => node instanceof RecordNode);
  }

  transformSelector(sel: Selector): SelectorTransform { return mapSelector(sel); }

  equals(other: Edit): boolean {
    return other instanceof RecordAddEdit&& this.target.equals(other.target) && this.node.equals(other.node);
  }

  withTarget(target: Selector): RecordAddEdit { return new RecordAddEdit(target, this.node); }
}

export class RecordDeleteEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;

  constructor(readonly target: Selector) { super(); }

  apply(doc: Node): void {
    const parentSel = this.target.parent;
    const field = String(this.target.lastSegment);
    const parents = this.navigateOrThrow(doc, parentSel);
    for (const parent of parents) {
      if (!parent.deleteField(field)) this.assertRecord(parent);
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(doc, this.target.parent, (node) => node instanceof RecordNode);
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "matched") return REMOVED_SELECTOR;
    return mapSelector(sel);
  }

  equals(other: Edit): boolean {
    return other instanceof RecordDeleteEdit&& this.target.equals(other.target);
  }

  withTarget(target: Selector): RecordDeleteEdit { return new RecordDeleteEdit(target); }
}

export class RecordRenameFieldEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;

  constructor(readonly target: Selector, readonly to: string) { super(); }

  apply(doc: Node): void {
    const parentSel = this.target.parent;
    const from = String(this.target.lastSegment);
    const parents = this.navigateOrThrow(doc, parentSel);
    for (const parent of parents) {
      if (!parent.renameField(from, this.to)) this.assertRecord(parent);
    }
    doc.updateReferences((abs) => this.transformSelectorOrThrow(abs));
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(doc, this.target.parent, (node) => node instanceof RecordNode);
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "no-match") return mapSelector(sel);
    return mapSelector(new Selector([...m.specificPrefix.segments.slice(0, -1), this.to, ...m.rest.segments]));
  }

  equals(other: Edit): boolean {
    return other instanceof RecordRenameFieldEdit && this.target.equals(other.target) && this.to === other.to;
  }

  withTarget(target: Selector): RecordRenameFieldEdit { return new RecordRenameFieldEdit(target, this.to); }
}

export class ListPushBackEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;

  constructor(readonly target: Selector, readonly node: Node) { super(); }

  apply(doc: Node): void {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      if (!n.pushBack(this.node.clone())) this.assertList(n);
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(doc, this.target, (node) => node instanceof ListNode);
  }

  transformSelector(sel: Selector): SelectorTransform { return mapSelector(sel); }

  equals(other: Edit): boolean {
    return other instanceof ListPushBackEdit&& this.target.equals(other.target) && this.node.equals(other.node);
  }

  withTarget(target: Selector): ListPushBackEdit { return new ListPushBackEdit(target, this.node); }
}

export class ListPushFrontEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;

  constructor(readonly target: Selector, readonly node: Node) { super(); }

  apply(doc: Node): void {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      if (!n.pushFront(this.node.clone())) this.assertList(n);
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(doc, this.target, (node) => node instanceof ListNode);
  }

  transformSelector(sel: Selector): SelectorTransform {
    return this.target.shiftIndex(sel, 0, +1);
  }

  equals(other: Edit): boolean {
    return other instanceof ListPushFrontEdit && this.target.equals(other.target) && this.node.equals(other.node);
  }

  withTarget(target: Selector): ListPushFrontEdit { return new ListPushFrontEdit(target, this.node); }
}

export class ListPopBackEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;

  constructor(readonly target: Selector) { super(); }

  apply(doc: Node): void {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      if (!n.popBack()) this.assertList(n);
    }
  }

  canApply(doc: Node): boolean {
    const nodes = doc.navigate(this.target);
    return nodes.length > 0 && nodes.every((node) => node instanceof ListNode && node.items.length > 0);
  }

  transformSelector(sel: Selector): SelectorTransform { return mapSelector(sel); }

  override transform(prior: Edit): Edit {
    // Two concurrent pops of the same list edge collapse to one removal.
    // Otherwise replay could remove a second item that neither peer observed
    // as the last element when they issued their pop.
    if ((prior instanceof ListPopBackEdit || prior instanceof ListPopFrontEdit) && prior.target.equals(this.target)) {
      return new NoOpEdit(this.target, `${prior.constructor.name} already removed the list item targeted by ${this.constructor.name}.`);
    }
    return super.transform(prior);
  }

  equals(other: Edit): boolean {
    return other instanceof ListPopBackEdit && this.target.equals(other.target);
  }

  withTarget(target: Selector): ListPopBackEdit { return new ListPopBackEdit(target); }
}

export class ListPopFrontEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;

  constructor(readonly target: Selector) { super(); }

  apply(doc: Node): void {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      if (!n.popFront()) this.assertList(n);
    }
  }

  canApply(doc: Node): boolean {
    const nodes = doc.navigate(this.target);
    return nodes.length > 0 && nodes.every((node) => node instanceof ListNode && node.items.length > 0);
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "matched" && m.rest.length > 0 && m.rest.segments[0] === 0) return REMOVED_SELECTOR;
    return this.target.shiftIndex(sel, 1, -1);
  }

  override transform(prior: Edit): Edit {
    // Two concurrent pops of the same list edge collapse to one removal.
    // Otherwise replay could remove a second item that neither peer observed
    // as the first element when they issued their pop.
    if ((prior instanceof ListPopBackEdit || prior instanceof ListPopFrontEdit) && prior.target.equals(this.target)) {
      return new NoOpEdit(this.target, `${prior.constructor.name} already removed the list item targeted by ${this.constructor.name}.`);
    }
    return super.transform(prior);
  }

  equals(other: Edit): boolean {
    return other instanceof ListPopFrontEdit && this.target.equals(other.target);
  }

  withTarget(target: Selector): ListPopFrontEdit { return new ListPopFrontEdit(target); }
}

export class UpdateTagEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = false;

  constructor(readonly target: Selector, readonly tag: string) { super(); }

  apply(doc: Node): void {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      if (!n.updateTag(this.tag)) {
        throw new Error(`${this.constructor.name}: expected RecordNode or ListNode, found '${n.constructor.name}'`);
      }
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(doc, this.target, (node) => node instanceof RecordNode || node instanceof ListNode);
  }

  transformSelector(sel: Selector): SelectorTransform { return mapSelector(sel); }

  equals(other: Edit): boolean {
    return other instanceof UpdateTagEdit&& this.target.equals(other.target) && this.tag === other.tag;
  }

  withTarget(target: Selector): UpdateTagEdit { return new UpdateTagEdit(target, this.tag); }
}

export class CopyEdit extends Edit {
  readonly isStructural = false;

  constructor(readonly target: Selector, readonly source: Selector) { super(); }

  override get selectors(): Selector[] { return [this.target, this.source]; }

  apply(doc: Node): void {
    const sourceNodes = doc.navigate(this.source);
    const targetEntries = doc.navigateWithPaths(this.target);
    if (sourceNodes.length === 0) {
      throw new Error(`copy: no nodes match source selector '${this.source.format()}'`);
    }
    if (targetEntries.length === 0) {
      throw new Error(`copy: no nodes match target selector '${this.target.format()}'`);
    }

    if (sourceNodes.length === targetEntries.length) {
      for (let i = 0; i < sourceNodes.length; i++) {
        const replacementNode = sourceNodes[i]!.clone();
        const entry = targetEntries[i]!;
        doc.replaceAtPath(entry.path, replacementNode);
      }
    } else if (targetEntries.length === 1 && targetEntries[0]!.node.setItems(sourceNodes.map((n) => n.clone()))) {
      // setItems succeeded — target was a ListNode
    } else {
      throw new Error(`copy: source/target arity mismatch (source=${sourceNodes.length}, target=${targetEntries.length}). Need equal counts or one list target.`);
    }
  }

  canApply(doc: Node): boolean {
    const sourceNodes = doc.navigate(this.source);
    const targetEntries = doc.navigateWithPaths(this.target);
    return sourceNodes.length > 0 &&
      targetEntries.length > 0 &&
      (sourceNodes.length === targetEntries.length ||
        (targetEntries.length === 1 && targetEntries[0]!.node instanceof ListNode));
  }

  transformSelector(sel: Selector): SelectorTransform { return mapSelector(sel); }

  override transform(prior: Edit): Edit {
    const t = prior.transformSelector(this.target);
    const s = prior.transformSelector(this.source);
    if (t.kind === "removed") {
      return new NoOpEdit(this.target, `${prior.constructor.name} removed copy target '${this.target.format()}'.`);
    }
    if (s.kind === "removed") {
      return new NoOpEdit(this.target, `${prior.constructor.name} removed copy source '${this.source.format()}'.`);
    }
    return new CopyEdit(t.selector, s.selector);
  }

  equals(other: Edit): boolean {
    return other instanceof CopyEdit && this.target.equals(other.target) && this.source.equals(other.source);
  }

  withTarget(target: Selector): CopyEdit { return new CopyEdit(target, this.source); }
}

export class WrapRecordEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;

  constructor(readonly target: Selector, readonly field: string, readonly tag: string) { super(); }

  apply(doc: Node): void {
    this.navigateOrThrow(doc, this.target);
    doc.wrapAtPath(this.target, (child) => new RecordNode(this.tag, { [this.field]: child }));
    doc.updateReferences((abs) => this.transformSelectorOrThrow(abs));
  }

  canApply(doc: Node): boolean {
    return this.target.length > 0 && this.canFindNodes(doc, this.target);
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    return m.kind === "no-match"
      ? mapSelector(sel)
      : mapSelector(new Selector([...m.specificPrefix.segments, this.field, ...m.rest.segments]));
  }

  equals(other: Edit): boolean {
    return other instanceof WrapRecordEdit && this.target.equals(other.target) &&
      this.field === other.field && this.tag === other.tag;
  }

  withTarget(target: Selector): WrapRecordEdit { return new WrapRecordEdit(target, this.field, this.tag); }
}

export class WrapListEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;

  constructor(readonly target: Selector, readonly tag: string) { super(); }

  apply(doc: Node): void {
    this.navigateOrThrow(doc, this.target);
    doc.wrapAtPath(this.target, (child) => new ListNode(this.tag, [child]));
    doc.updateReferences((abs) => this.transformSelectorOrThrow(abs));
  }

  canApply(doc: Node): boolean {
    return this.target.length > 0 && this.canFindNodes(doc, this.target);
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    return m.kind === "no-match"
      ? mapSelector(sel)
      : mapSelector(new Selector([...m.specificPrefix.segments, "*", ...m.rest.segments]));
  }

  equals(other: Edit): boolean {
    return other instanceof WrapListEdit && this.target.equals(other.target) && this.tag === other.tag;
  }

  withTarget(target: Selector): WrapListEdit { return new WrapListEdit(target, this.tag); }
}


// ── Event ───────────────────────────────────────────────────────────

export class Event {
  constructor(
    readonly id: EventId,
    readonly parents: EventId[],
    readonly edit: Edit,
    readonly clock: VectorClock,
  ) {}

  equals(other: Event): boolean {
    if (!this.id.equals(other.id)) return false;
    if (this.parents.length !== other.parents.length) return false;
    for (let i = 0; i < this.parents.length; i++) {
      if (!this.parents[i]!.equals(other.parents[i]!)) return false;
    }
    if (!this.clock.equals(other.clock)) return false;
    return this.edit.equals(other.edit);
  }

  isConcurrentWith(other: Event): boolean {
    return this !== other && !this.clock.dominates(other.clock) && !other.clock.dominates(this.clock);
  }

  validate(known: Map<string, Event>): void {
    const key = this.id.format();
    if (!Number.isInteger(this.id.seq) || this.id.seq < 0) {
      throw new Error(`Invalid seq for '${key}'.`);
    }
    if (this.parents.some((p) => p.format() === key)) {
      throw new Error(`Event '${key}' is its own parent.`);
    }
    for (const p of this.parents) {
      if (!known.has(p.format())) {
        throw new Error(`Unknown parent '${p.format()}' for event '${key}'.`);
      }
    }
  }

  /**
   * Transforms this event's edit against all concurrent prior structural edits.
   * If those edits have already removed or overwritten the target at replay
   * time, the result becomes an explicit no-op edit reported as a conflict.
   */
  resolveAgainst(applied: { ev: Event; edit: Edit }[], doc: Node): Edit {
    let edit: Edit = this.edit;
    let sawConcurrentStructuralEdit = false;
    for (const prior of applied) {
      if (this.clock.dominates(prior.ev.clock)) continue;
      if (this.isConcurrentWith(prior.ev)) {
        if (prior.edit.isStructural) {
          sawConcurrentStructuralEdit = true;
          edit = edit.transform(prior.edit);
        }
      }
    }
    if (sawConcurrentStructuralEdit && !edit.canApply(doc)) {
      return new NoOpEdit(
        edit.target,
        `Concurrent replay left '${edit.target.format()}' unavailable before ${this.edit.constructor.name} could replay.`,
      );
    }
    return edit;
  }
}

// ── EventGraph ──────────────────────────────────────────────────────

export type MaterializeResult = { doc: Node; conflicts: Node[] };

export class EventGraph {
  private initial: Node;
  private events: Map<string, Event>;
  private _frontierIds: EventId[];
  private cachedOrder: string[] | null = null;

  constructor(initial: Node, events?: Map<string, Event>, frontiers?: EventId[]) {
    this.initial = initial;
    this.events = events ?? new Map();
    this._frontierIds = frontiers ?? [];
  }

  get frontiers(): EventId[] {
    return [...this._frontierIds];
  }

  hasEvent(key: string): boolean {
    return this.events.has(key);
  }

  getEvent(key: string): Event | undefined {
    return this.events.get(key);
  }

  insertEvent(event: Event): void {
    event.validate(this.events);
    this.events.set(event.id.format(), event);
    const parentKeys = new Set(event.parents.map((p) => p.format()));
    this._frontierIds = [
      ...this._frontierIds.filter((h) => !parentKeys.has(h.format())),
      event.id,
    ].sort((a, b) => a.compareTo(b));
    this.cachedOrder = null;
  }

  /** Creates a new event from a local edit, inserts it, and returns it. */
  createEvent(peer: string, edit: Edit): Event {
    const parents = [...this._frontierIds];
    const clock = new VectorClock();
    for (const p of parents) {
      const parentEvent = this.events.get(p.format());
      if (parentEvent) clock.merge(parentEvent.clock);
    }
    const seq = clock.tick(peer);
    const event = new Event(new EventId(peer, seq), parents, edit, clock);
    this.insertEvent(event);
    return event;
  }

  /** Ingests remote events, buffering out-of-order ones. Returns leftover buffered events. */
  ingestEvents(incomingEvents: Event[], bufferedEvents: Event[]): Event[] {
    // Stage 1: merge newly received events with the existing buffer, deduplicate
    // by ID, and reject same-ID/different-payload corruption.
    const candidateEvents = [...bufferedEvents, ...incomingEvents];
    const pendingByKey: Record<string, Event> = {};
    for (const event of candidateEvents) {
      const key = event.id.format();
      const existing = this.events.get(key);
      if (existing != null) {
        if (!existing.equals(event)) {
          throw new Error(`Conflicting payload for event '${key}'.`);
        }
        continue;
      }
      const pendingEvent = pendingByKey[key];
      if (pendingEvent !== undefined && !pendingEvent.equals(event)) {
        throw new Error(`Conflicting payload for event '${key}'.`);
      }
      pendingByKey[key] = event;
    }

    if (Object.keys(pendingByKey).length === 0) return [];

    // Stage 2: for each still-pending event, count how many parents are missing
    // and build the reverse dependency index needed to unblock children later.
    const missingParentCountsByKey: Record<string, number> = {};
    const childKeysByMissingParent: Record<string, string[]> = {};

    for (const [key, event] of Object.entries(pendingByKey)) {
      let missingParentCount = 0;
      for (const p of event.parents) {
        const pk = p.format();
        if (!this.events.has(pk)) {
          missingParentCount++;
          (childKeysByMissingParent[pk] ??= []).push(key);
        }
      }
      missingParentCountsByKey[key] = missingParentCount;
    }

    // Stage 3: seed the worklist with everything whose parents are already known.
    const readyKeys: string[] = [];
    for (const [key, missingParentCount] of Object.entries(missingParentCountsByKey)) {
      if (missingParentCount === 0) readyKeys.push(key);
    }

    // Stage 4: flush causally ready events, decrementing their dependents until
    // no more buffered events can be inserted in this pass.
    while (readyKeys.length > 0) {
      const key = readyKeys.pop()!;
      const event = pendingByKey[key]!;
      this.insertEvent(event);
      delete pendingByKey[key];
      const childKeys = childKeysByMissingParent[key];
      if (childKeys != null) {
        for (const childKey of childKeys) {
          const newMissingParentCount = missingParentCountsByKey[childKey]! - 1;
          missingParentCountsByKey[childKey] = newMissingParentCount;
          if (newMissingParentCount === 0 && pendingByKey[childKey] !== undefined) {
            readyKeys.push(childKey);
          }
        }
      }
    }

    // Anything left still depends on parents we have not seen yet.
    return Object.values(pendingByKey);
  }

  /** Returns events not known by a peer with the given frontiers. */
  eventsSince(remoteFrontiers: EventId[]): Event[] {
    const remoteKnown = this.filterCausalPast(remoteFrontiers, false);
    return [...this.events.values()].filter(
      (ev) => !remoteKnown.has(ev.id.format()),
    );
  }

  filterCausalPast(frontier: EventId[], strict = true): Set<string> {
    const causalPast = new Set<string>();
    const stack = frontier.map((id) => id.format());
    while (stack.length > 0) {
      const key = stack.pop() as string;
      if (causalPast.has(key)) continue;
      const ev = this.events.get(key);
      if (ev == null) {
        if (strict) throw new Error(`Unknown version '${key}'.`);
        continue;
      }
      causalPast.add(key);
      for (const p of ev.parents) stack.push(p.format());
    }
    return causalPast;
  }

  computeTopologicalOrder(frontier?: EventId[]): string[] {
    const front = frontier ?? this._frontierIds;
    const causalPast = this.filterCausalPast(front);
    const indegree: Record<string, number> = {};
    const children: Record<string, string[]> = {};
    for (const key of causalPast) {
      indegree[key] = 0;
      children[key] = [];
    }
    for (const key of causalPast) {
      const ev = this.events.get(key) as Event;
      for (const p of ev.parents) {
        const pk = p.format();
        if (!causalPast.has(pk)) continue;
        indegree[key] = (indegree[key] ?? 0) + 1;
        children[pk]?.push(key);
      }
    }
    const events = this.events;
    const compareEvents = (leftKey: string, rightKey: string) => {
      const leftEvent = events.get(leftKey) as Event, rightEvent = events.get(rightKey) as Event;
      const leftTarget = leftEvent.edit.target, rightTarget = rightEvent.edit.target;
      const minLength = Math.min(leftTarget.length, rightTarget.length);
      for (let i = 0; i < minLength; i++) {
        const leftIsAll = leftTarget.segments[i] === "*";
        const rightIsAll = rightTarget.segments[i] === "*";
        if (leftIsAll && !rightIsAll) return -1;
        if (!leftIsAll && rightIsAll) return 1;
      }
      if (leftTarget.length !== rightTarget.length) return leftTarget.length - rightTarget.length;
      return leftEvent.id.compareTo(rightEvent.id);
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
        if (indegree[ch] === 0) queue.push(ch);
      }
    }
    if (ordered.length !== causalPast.size) {
      throw new Error("Event graph contains a cycle.");
    }
    return ordered;
  }

  materialize(frontier?: EventId[]): MaterializeResult {
    const ordered = frontier
      ? this.computeTopologicalOrder(frontier)
      : (this.cachedOrder ??= this.computeTopologicalOrder());
    const doc = this.initial.clone();
    const applied: { ev: Event; edit: Edit }[] = [];
    const conflicts: Node[] = [];
    for (const key of ordered) {
      const ev = this.events.get(key) as Event;
      const edit = ev.resolveAgainst(applied, doc);
      if (edit instanceof NoOpEdit) {
        conflicts.push(edit.toConflict());
        continue;
      }
      edit.apply(doc);
      applied.push({ ev, edit });
    }
    return { doc, conflicts };
  }

  /**
   * Compacts the event graph by materializing the current state into a new
   * initial document and discarding all events. Call this when all peers
   * have synced and old history is no longer needed.
   *
   * After compaction, the graph has zero events and the current materialized
   * state becomes the new initial document.
   */
  compact(): void {
    const { doc } = this.materialize();
    this.initial = doc;
    this.events = new Map();
    this._frontierIds = [];
    this.cachedOrder = null;
  }
}


// ── Denicek (collaborative document peer) ───────────────────────────

/**
 * A collaborative document scoped to a single peer.
 *
 * Manages its own event DAG internally: local edits produce events
 * (retrievable via {@link drain}), remote events are ingested via
 * {@link applyRemote}, and the document is reconstructed via {@link materialize}.
 */
export class Denicek {
  readonly peer: string;
  private graph: EventGraph;
  private pendingEvents: Event[] = [];
  private bufferedEvents: Event[] = [];
  private cachedDoc: Node | null = null;

  constructor(peer: string, initial?: PlainNode);
  constructor(peer: string, graph: { initial: Node; events: Record<string, Event>; frontiers: EventId[] });
  constructor(peer: string, arg?: PlainNode | { initial: Node; events: Record<string, Event>; frontiers: EventId[] }) {
    this.peer = peer;
    if (arg && typeof arg === "object" && arg !== null && "events" in arg) {
      const g = arg as { initial: Node; events: Record<string, Event>; frontiers: EventId[] };
      const eventsMap = new Map<string, Event>(Object.entries(g.events));
      this.graph = new EventGraph(g.initial, eventsMap, g.frontiers);
    } else {
      this.graph = new EventGraph(Node.fromPlain((arg as PlainNode) ?? { $tag: "root" }));
    }
  }

  private commit(edit: Edit): void {
    const doc = this.cachedDoc ?? this.rematerialize();
    try {
      edit.apply(doc);
    } catch (e) {
      this.cachedDoc = null;
      throw e;
    }
    const event = this.graph.createEvent(this.peer, edit);
    this.pendingEvents.push(event);
    this.cachedDoc = doc;
  }

  /** Returns and clears events produced by local edits since the last drain. */
  drain(): Event[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  /** Returns the current frontier (tip event IDs). */
  get frontiers(): EventId[] {
    return this.graph.frontiers;
  }

  /** Returns all events that the holder of `remoteFrontiers` hasn't seen. */
  eventsSince(remoteFrontiers: EventId[]): Event[] {
    return this.graph.eventsSince(remoteFrontiers);
  }

  /** Ingests an event produced by another peer. Buffers out-of-order events. */
  applyRemote(event: Event): void {
    this.bufferedEvents = this.graph.ingestEvents([event], this.bufferedEvents);
    this.cachedDoc = null;
  }

  add(target: string, field: string, value: PlainNode): void {
    const path = target === "" ? field : `${target}/${field}`;
    this.commit(new RecordAddEdit(Selector.parse(path), Node.fromPlain(value)));
  }

  delete(target: string, field: string): void {
    const path = target === "" ? field : `${target}/${field}`;
    this.commit(new RecordDeleteEdit(Selector.parse(path)));
  }

  rename(target: string, from: string, to: string): void {
    const path = target === "" ? from : `${target}/${from}`;
    this.commit(new RecordRenameFieldEdit(Selector.parse(path), to));
  }

  set(target: string, value: PrimitiveValue): void {
    this.commit(new SetValueEdit(Selector.parse(target), value));
  }

  pushBack(target: string, value: PlainNode): void {
    this.commit(new ListPushBackEdit(Selector.parse(target), Node.fromPlain(value)));
  }

  pushFront(target: string, value: PlainNode): void {
    this.commit(new ListPushFrontEdit(Selector.parse(target), Node.fromPlain(value)));
  }

  popBack(target: string): void {
    this.commit(new ListPopBackEdit(Selector.parse(target)));
  }

  popFront(target: string): void {
    this.commit(new ListPopFrontEdit(Selector.parse(target)));
  }

  updateTag(target: string, tag: string): void {
    this.commit(new UpdateTagEdit(Selector.parse(target), tag));
  }

  wrapRecord(target: string, field: string, tag: string): void {
    this.commit(new WrapRecordEdit(Selector.parse(target), field, tag));
  }

  wrapList(target: string, tag: string): void {
    this.commit(new WrapListEdit(Selector.parse(target), tag));
  }

  copy(target: string, source: string): void {
    this.commit(new CopyEdit(Selector.parse(target), Selector.parse(source)));
  }

  materialize(): Node {
    if (this.cachedDoc !== null) return this.cachedDoc;
    const doc = this.rematerialize();
    this.cachedDoc = doc;
    return doc;
  }

  /** Returns conflicts from the last materialization, if any. */
  get conflicts(): Node[] {
    return this.lastConflicts;
  }

  private lastConflicts: Node[] = [];

  private rematerialize(): Node {
    const { doc, conflicts } = this.graph.materialize();
    this.lastConflicts = conflicts;
    return doc;
  }

  /**
   * Compacts the event graph — materializes current state as the new baseline
   * and discards all events. Call when all peers have synced.
   */
  compact(): void {
    this.graph.compact();
    this.cachedDoc = null;
  }

  toPlain(): unknown {
    return this.materialize().toPlain();
  }
}
