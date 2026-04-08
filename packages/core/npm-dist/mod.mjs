// core/selector.ts
var NO_PREFIX_MATCH = { kind: "no-match" };
var REMOVED_SELECTOR = { kind: "removed" };
var STRICT_INDEX_SEGMENT = /^![0-9]+$/;
var MAX_SELECTOR_PATH_LENGTH = 4096;
var MAX_SELECTOR_SEGMENTS = 512;
function isStrictIndexSegment(segment) {
  return typeof segment === "string" && STRICT_INDEX_SEGMENT.test(segment);
}
function isIndexSegment(segment) {
  return typeof segment === "number" || isStrictIndexSegment(segment);
}
function getSelectorIndexValue(segment) {
  if (typeof segment === "number") return segment;
  if (isStrictIndexSegment(segment)) return Number(segment.slice(1));
  return null;
}
function formatSelectorSegment(segment) {
  return typeof segment === "number" ? String(segment) : segment;
}
function parseSelectorSegment(part) {
  if (part === "*" || part === "..") return part;
  if (STRICT_INDEX_SEGMENT.test(part)) return part;
  const n = Number(part);
  return Number.isSafeInteger(n) && n >= 0 && String(n) === part ? n : part;
}
function mapSelector(selector) {
  return { kind: "mapped", selector };
}
function validateFieldName(field) {
  if (field.length === 0) {
    throw new Error("Field names cannot be empty.");
  }
  if (field.includes("/")) {
    throw new Error(`Field name '${field}' cannot contain '/'.`);
  }
  if (field === "*" || field === "..") {
    throw new Error(`Field name '${field}' is reserved by selector syntax.`);
  }
  if (STRICT_INDEX_SEGMENT.test(field)) {
    throw new Error(`Field name '${field}' is reserved by selector syntax.`);
  }
  const numericField = Number(field);
  if (numericField >= 0 && Number.isInteger(numericField) && String(numericField) === field) {
    throw new Error(`Field name '${field}' is reserved by selector syntax.`);
  }
}
var Selector = class _Selector {
  segments;
  constructor(segments) {
    this.segments = segments;
  }
  static parse(path) {
    if (typeof path !== "string") {
      throw new Error("Selector paths must be strings.");
    }
    if (path.length > MAX_SELECTOR_PATH_LENGTH) {
      throw new Error(
        `Selector path is too long (${path.length} > ${MAX_SELECTOR_PATH_LENGTH}).`
      );
    }
    const trimmed = path.trim();
    if (trimmed === "" || trimmed === "/") return new _Selector([]);
    const isAbs = trimmed.startsWith("/");
    const parts = trimmed.replace(/^\//, "").split("/").filter((p) => p.length > 0);
    if (parts.length > MAX_SELECTOR_SEGMENTS) {
      throw new Error(
        `Selector path has too many segments (${parts.length} > ${MAX_SELECTOR_SEGMENTS}).`
      );
    }
    const segments = parts.map(parseSelectorSegment);
    return new _Selector(isAbs ? ["/", ...segments] : segments);
  }
  format() {
    if (this.segments.length === 0) return "/";
    if (this.segments[0] === "/") {
      return `/${this.segments.slice(1).map(formatSelectorSegment).join("/")}`;
    }
    return this.segments.map(formatSelectorSegment).join("/");
  }
  get isAbsolute() {
    return this.segments.length > 0 && this.segments[0] === "/";
  }
  get parent() {
    return new _Selector(this.segments.slice(0, -1));
  }
  get lastSegment() {
    return this.segments[this.segments.length - 1];
  }
  get length() {
    return this.segments.length;
  }
  at(index) {
    return this.segments.at(index);
  }
  slice(start, end) {
    return new _Selector(this.segments.slice(start, end));
  }
  equals(other) {
    return this.segments.length === other.segments.length && this.segments.every((seg, i) => seg === other.segments[i]);
  }
  /***
   * If `this` is a prefix of `full` (e.g., `a/*` is a prefix of `a/1/b`),
   * returns the specific prefix segments and the remaining suffix.
   */
  matchPrefix(full) {
    if (this.segments.length > full.segments.length) return NO_PREFIX_MATCH;
    const specificPrefix = [];
    for (let i = 0; i < this.segments.length; i++) {
      const prefixSeg = this.segments[i];
      const fullSeg = full.segments[i];
      if (prefixSeg === fullSeg) {
        specificPrefix.push(fullSeg);
      } else if (prefixSeg === "*" && isIndexSegment(fullSeg)) {
        specificPrefix.push(fullSeg);
      } else if (isIndexSegment(prefixSeg) && isIndexSegment(fullSeg) && getSelectorIndexValue(prefixSeg) === getSelectorIndexValue(fullSeg)) {
        specificPrefix.push(fullSeg);
      } else {
        return NO_PREFIX_MATCH;
      }
    }
    return {
      kind: "matched",
      specificPrefix: new _Selector(specificPrefix),
      rest: full.slice(this.segments.length)
    };
  }
  /** Shifts numeric indices in `other` that traverse through this selector's list target. */
  shiftIndex(other, threshold, delta) {
    const m = this.matchPrefix(other);
    if (m.kind === "no-match" || m.rest.length === 0) return mapSelector(other);
    const head = m.rest.segments[0];
    const tail = m.rest.slice(1);
    const index = getSelectorIndexValue(head);
    if (index === null) return mapSelector(other);
    if (isStrictIndexSegment(head)) return mapSelector(other);
    const shifted = index + (index >= threshold ? delta : 0);
    if (shifted < 0) return REMOVED_SELECTOR;
    return mapSelector(
      new _Selector([...m.specificPrefix.segments, shifted, ...tail.segments])
    );
  }
};

// core/nodes/base.ts
var Node = class {
  // ── Polymorphic edit operations ───────────────────────────────────
  // Subclasses override the operations they support.
  // The base implementation throws when an operation does not apply.
  setPrimitive(_value) {
    throw this.createUnsupportedOperationError("setPrimitive");
  }
  addField(_name, _value) {
    throw this.createUnsupportedOperationError("addField");
  }
  deleteField(_name) {
    throw this.createUnsupportedOperationError("deleteField");
  }
  renameField(_from, _to) {
    throw this.createUnsupportedOperationError("renameField");
  }
  pushBack(_node) {
    throw this.createUnsupportedOperationError("pushBack");
  }
  pushFront(_node) {
    throw this.createUnsupportedOperationError("pushFront");
  }
  popBack() {
    throw this.createUnsupportedOperationError("popBack");
  }
  popFront() {
    throw this.createUnsupportedOperationError("popFront");
  }
  updateTag(_tag) {
    throw this.createUnsupportedOperationError("updateTag");
  }
  setItems(_items) {
    throw this.createUnsupportedOperationError("setItems");
  }
  /** Called during updateReferences — only ReferenceNode overrides to update its selector. */
  applyReferenceTransform(_basePath, _transform) {
  }
  /** Called during reference scans — only ReferenceNode overrides to report its resolved target. */
  collectResolvedReferences(_basePath, _references) {
  }
  /** Called during structural edits — only ReferenceNode overrides to preserve its original path. */
  collectReferenceTransformTargets(_basePath, _targets) {
  }
  /** Follows selector segments to collect matched nodes. */
  navigate(target, depth = 0) {
    if (depth === target.length) return [this];
    const entries = this.resolveSegment(target.segments[depth]);
    const result = [];
    for (const { child } of entries) {
      result.push(...child.navigate(target, depth + 1));
    }
    return result;
  }
  /** Follows selector segments to collect matched nodes with their concrete paths. */
  navigateWithPaths(target, depth = 0, path = []) {
    if (depth === target.length) {
      return [{ path: new Selector([...path]), node: this }];
    }
    const entries = this.resolveSegment(target.segments[depth]);
    const result = [];
    for (const { key, child } of entries) {
      path.push(key);
      result.push(...child.navigateWithPaths(target, depth + 1, path));
      path.pop();
    }
    return result;
  }
  /** Walks every node in the tree, calling `visitor` with its path. */
  forEach(visitor, path = []) {
    visitor(new Selector([...path]), this);
    this.forEachChild(visitor, path);
  }
  /** Visits children — overridden by RecordNode and ListNode. */
  forEachChild(_visitor, _path) {
  }
  /** Rewrites all reference nodes in the tree after a structural edit. Mutates in place. */
  updateReferences(transform, targets = this.captureReferenceTransformTargets()) {
    for (const { basePath, referenceNode } of targets) {
      referenceNode.applyReferenceTransform(basePath, transform);
    }
  }
  captureReferenceTransformTargets() {
    const targets = [];
    this.forEach((basePath, current) => {
      current.collectReferenceTransformTargets(basePath, targets);
    });
    return targets;
  }
  findBlockingReference(removedPaths) {
    const references = [];
    this.forEach((basePath, current) => {
      current.collectResolvedReferences(basePath, references);
    });
    for (const reference of references) {
      for (const removedPath of removedPaths) {
        if (removedPath.matchPrefix(reference.targetPath).kind === "matched") {
          return { ...reference, removedPath };
        }
      }
    }
    return null;
  }
  collectResolvedReferencePaths(basePath) {
    const references = [];
    this.forEach((relativePath, current) => {
      current.collectResolvedReferences(
        new Selector([...basePath.segments, ...relativePath.segments]),
        references
      );
    });
    return references;
  }
  /** Replaces the node at a concrete path within this tree. */
  replaceAtPath(path, replacement) {
    if (path.length === 0) return;
    for (const parent of this.navigate(path.parent)) {
      parent.replaceChild(path.lastSegment, replacement);
    }
  }
  /** Wraps nodes at the given selector path with a wrapper function. */
  wrapAtPath(target, wrapper) {
    if (target.length === 0) throw new Error("Cannot wrap the root node.");
    if (target.length === 1) {
      this.wrapChild(target.lastSegment, wrapper);
      return;
    }
    for (const parent of this.navigate(target.parent)) {
      parent.wrapChild(target.lastSegment, wrapper);
    }
  }
  static fromPlain(_plain) {
    throw new Error("Node.fromPlain is not initialized.");
  }
  createUnsupportedOperationError(operation) {
    return new Error(
      `${this.constructor.name} does not support '${operation}'.`
    );
  }
};

// core/nodes/list-node.ts
var ListNode = class _ListNode extends Node {
  tag;
  items;
  constructor(tag, items) {
    super();
    this.tag = tag;
    this.items = items;
  }
  pushBack(node) {
    this.items.push(node);
    return true;
  }
  pushFront(node) {
    this.items.unshift(node);
    return true;
  }
  popBack() {
    if (this.items.length === 0) {
      throw new Error("list-pop-back: list is empty");
    }
    this.items.pop();
    return true;
  }
  popFront() {
    if (this.items.length === 0) {
      throw new Error("list-pop-front: list is empty");
    }
    this.items.shift();
    return true;
  }
  updateTag(tag) {
    this.tag = tag;
    return true;
  }
  setItems(items) {
    this.items = items;
    return true;
  }
  resolveSegment(seg) {
    if (seg === "*") {
      return this.items.map((child, i) => ({ key: i, child }));
    }
    const index = getSelectorIndexValue(seg);
    if (index !== null && index >= 0 && index < this.items.length) {
      return [{ key: index, child: this.items[index] }];
    }
    return [];
  }
  replaceChild(key, replacement) {
    const index = getSelectorIndexValue(key);
    if (index !== null && index >= 0 && index < this.items.length) {
      this.items[index] = replacement;
    }
  }
  wrapChild(key, wrapper) {
    if (key === "*") {
      for (let i = 0; i < this.items.length; i++) {
        this.items[i] = wrapper(this.items[i]);
      }
    } else {
      const index = getSelectorIndexValue(key);
      if (index !== null && index >= 0 && index < this.items.length) {
        this.items[index] = wrapper(this.items[index]);
      }
    }
  }
  forEachChild(visitor, path) {
    for (let i = 0; i < this.items.length; i++) {
      path.push(i);
      this.items[i].forEach(visitor, path);
      path.pop();
    }
  }
  clone() {
    return new _ListNode(this.tag, this.items.map((item) => item.clone()));
  }
  toPlain() {
    return { $tag: this.tag, $items: this.items.map((item) => item.toPlain()) };
  }
  equals(other) {
    if (!(other instanceof _ListNode)) return false;
    if (this.tag !== other.tag || this.items.length !== other.items.length) {
      return false;
    }
    return this.items.every((item, i) => item.equals(other.items[i]));
  }
};

// core/nodes/primitive-node.ts
var PrimitiveNode = class _PrimitiveNode extends Node {
  value;
  constructor(value) {
    super();
    this.value = value;
  }
  setPrimitive(value) {
    this.value = value;
  }
  resolveSegment() {
    return [];
  }
  replaceChild() {
  }
  wrapChild() {
  }
  clone() {
    return new _PrimitiveNode(this.value);
  }
  toPlain() {
    return this.value;
  }
  equals(other) {
    return other instanceof _PrimitiveNode && this.value === other.value;
  }
};

// core/nodes/record-node.ts
var RecordNode = class _RecordNode extends Node {
  tag;
  fields;
  constructor(tag, fields) {
    super();
    this.tag = tag;
    this.fields = fields;
  }
  addField(name, value) {
    this.fields[name] = value;
  }
  deleteField(name) {
    const result = {};
    for (const k in this.fields) {
      if (k !== name) result[k] = this.fields[k];
    }
    this.fields = result;
  }
  renameField(from, to) {
    if (from === to || !(from in this.fields)) return;
    const result = {};
    for (const k in this.fields) {
      if (k === from) result[to] = this.fields[k];
      else if (k === to) continue;
      else result[k] = this.fields[k];
    }
    this.fields = result;
  }
  updateTag(tag) {
    this.tag = tag;
  }
  resolveSegment(seg) {
    if (typeof seg === "string" && seg in this.fields) {
      return [{ key: seg, child: this.fields[seg] }];
    }
    return [];
  }
  replaceChild(key, replacement) {
    if (typeof key === "string") this.fields[key] = replacement;
  }
  wrapChild(key, wrapper) {
    if (typeof key === "string" && key in this.fields) {
      this.fields[key] = wrapper(this.fields[key]);
    }
  }
  forEachChild(visitor, path) {
    for (const k in this.fields) {
      path.push(k);
      this.fields[k].forEach(visitor, path);
      path.pop();
    }
  }
  clone() {
    const fields = {};
    for (const k in this.fields) fields[k] = this.fields[k].clone();
    return new _RecordNode(this.tag, fields);
  }
  toPlain() {
    const out = { $tag: this.tag };
    for (const k in this.fields) out[k] = this.fields[k].toPlain();
    return out;
  }
  equals(other) {
    if (!(other instanceof _RecordNode)) return false;
    if (this.tag !== other.tag) return false;
    const aKeys = Object.keys(this.fields);
    if (aKeys.length !== Object.keys(other.fields).length) return false;
    return aKeys.every(
      (k) => k in other.fields && this.fields[k].equals(other.fields[k])
    );
  }
};

// core/nodes/reference-node.ts
var ReferenceNode = class _ReferenceNode extends Node {
  selector;
  constructor(selector) {
    super();
    this.selector = selector;
  }
  resolveSegment() {
    return [];
  }
  replaceChild() {
  }
  wrapChild() {
  }
  applyReferenceTransform(basePath, transform) {
    const resolved = _ReferenceNode.resolveReference(basePath, this.selector);
    if (resolved === null) return;
    const mappedBase = transform(basePath);
    const mappedRef = transform(resolved);
    if (this.selector.isAbsolute) {
      this.selector = new Selector(["/", ...mappedRef.segments]);
    } else {
      this.selector = _ReferenceNode.makeRelative(mappedBase, mappedRef);
    }
  }
  collectResolvedReferences(basePath, references) {
    const resolved = _ReferenceNode.resolveReference(basePath, this.selector);
    if (resolved !== null) {
      references.push({ referencePath: basePath, targetPath: resolved });
    }
  }
  collectReferenceTransformTargets(basePath, targets) {
    targets.push({ basePath, referenceNode: this });
  }
  clone() {
    return new _ReferenceNode(new Selector([...this.selector.segments]));
  }
  toPlain() {
    return { $ref: this.selector.format() };
  }
  equals(other) {
    return other instanceof _ReferenceNode && this.selector.equals(other.selector);
  }
  /** Resolves a (possibly relative) reference to an absolute path. */
  static resolveReference(basePath, refSel) {
    const combined = refSel.isAbsolute ? refSel.segments.slice(1) : [...basePath.segments, ...refSel.segments];
    const stack = [];
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
  static makeRelative(basePath, absolutePath) {
    let common = 0;
    while (common < basePath.length && common < absolutePath.length) {
      const baseSeg = basePath.segments[common];
      const absSeg = absolutePath.segments[common];
      const compatible = baseSeg === absSeg || baseSeg === "*" && isIndexSegment(absSeg) || isIndexSegment(baseSeg) && absSeg === "*" || isIndexSegment(baseSeg) && isIndexSegment(absSeg) && getSelectorIndexValue(baseSeg) === getSelectorIndexValue(absSeg);
      if (!compatible) break;
      common++;
    }
    const ups = basePath.slice(common).segments.map(
      () => ".."
    );
    return new Selector([...ups, ...absolutePath.slice(common).segments]);
  }
};

// core/nodes/from-plain.ts
var MAX_PLAIN_NODE_DEPTH = 512;
function checkIsPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateNodeTag(tag, kind) {
  if (typeof tag !== "string" || tag.length === 0) {
    throw new Error(`${kind} nodes must carry a non-empty string $tag.`);
  }
  return tag;
}
function createNodeFromPlainInternal(plain, ancestors, depth) {
  if (depth > MAX_PLAIN_NODE_DEPTH) {
    throw new Error(
      `Plain nodes cannot be nested deeper than ${MAX_PLAIN_NODE_DEPTH} levels.`
    );
  }
  if (plain === null) throw new Error("Null is not a valid PlainNode.");
  if (typeof plain !== "object") return new PrimitiveNode(plain);
  if (Array.isArray(plain)) {
    throw new Error(
      "Arrays are not valid PlainNode values. Use a {$tag, $items} list."
    );
  }
  if (ancestors.has(plain)) {
    throw new Error("Plain nodes must not contain cycles.");
  }
  ancestors.add(plain);
  try {
    if ("$ref" in plain) {
      const reference = plain;
      if (typeof reference.$ref !== "string") {
        throw new Error("Reference nodes must carry a string $ref.");
      }
      return new ReferenceNode(Selector.parse(reference.$ref));
    }
    if ("$items" in plain) {
      const list = plain;
      const tag2 = validateNodeTag(list.$tag, "List");
      if (!Array.isArray(list.$items)) {
        throw new Error("List nodes must carry an array $items field.");
      }
      return new ListNode(
        tag2,
        list.$items.map(
          (item) => createNodeFromPlainInternal(item, ancestors, depth + 1)
        )
      );
    }
    if (!checkIsPlainObject(plain)) {
      throw new Error(
        "Plain nodes must be primitives, references, records, or lists."
      );
    }
    const record = plain;
    const tag = validateNodeTag(record.$tag, "Record");
    const fields = {};
    for (const [key, value] of Object.entries(record)) {
      if (key !== "$tag") {
        validateFieldName(key);
        fields[key] = createNodeFromPlainInternal(
          value,
          ancestors,
          depth + 1
        );
      }
    }
    return new RecordNode(tag, fields);
  } finally {
    ancestors.delete(plain);
  }
}
function createNodeFromPlain(plain) {
  return createNodeFromPlainInternal(plain, /* @__PURE__ */ new WeakSet(), 0);
}

// core/nodes.ts
Node.fromPlain = createNodeFromPlain;

// core/edits/base.ts
var ProtectedTargetError = class extends Error {
};
var MissingReferenceTargetError = class extends Error {
};
var Edit = class {
  validate(_doc) {
  }
  get selectors() {
    return [this.target];
  }
  /** Returns a transformed copy of this edit accounting for a prior concurrent structural edit. */
  transform(prior) {
    const t = prior.transformSelector(this.target);
    return t.kind === "mapped" ? this.withTarget(t.selector) : this.handleRemovedTarget(prior);
  }
  /**
   * Rewrites a concurrent edit that will replay after this edit.
   *
   * The receiver is already earlier in deterministic replay order. Most edits
   * simply transform the later edit's selector through themselves, while richer
   * edits can also rewrite inserted payloads or duplicate mirrored effects.
   */
  transformLaterConcurrentEdit(concurrent) {
    return concurrent.transform(this);
  }
  navigateOrThrow(doc, target) {
    const nodes = doc.navigate(target);
    if (nodes.length === 0) {
      throw new Error(`No nodes match selector '${target.format()}'.`);
    }
    return nodes;
  }
  assertRecord(n) {
    if (!(n instanceof RecordNode)) {
      throw new Error(
        `${this.constructor.name}: expected record, found '${n.constructor.name}'`
      );
    }
    return n;
  }
  assertList(n) {
    if (!(n instanceof ListNode)) {
      throw new Error(
        `${this.constructor.name}: expected list, found '${n.constructor.name}'`
      );
    }
    return n;
  }
  /** Builds a conflict node describing an edit that couldn't be applied. */
  conflict(data) {
    const fields = {
      kind: new PrimitiveNode(this.constructor.name),
      target: new PrimitiveNode(this.target.format())
    };
    if (data) fields.data = data;
    return new RecordNode("conflict", fields);
  }
  canFindNodes(doc, target) {
    return doc.navigate(target).length > 0;
  }
  canFindNodesOfType(doc, target, predicate) {
    const nodes = doc.navigate(target);
    return nodes.length > 0 && nodes.every(predicate);
  }
  handleRemovedTarget(prior) {
    throw new Error(
      `${this.constructor.name} must explicitly handle removal of '${this.target.format()}' by ${prior.constructor.name}.`
    );
  }
  createRemovedTargetNoOp(prior) {
    return new NoOpEdit(
      this.target,
      `${prior.constructor.name} removed '${this.target.format()}' before ${this.constructor.name} could apply.`
    );
  }
  transformSelectorOrThrow(sel) {
    const result = this.transformSelector(sel);
    if (result.kind === "removed") {
      throw new Error(
        `${this.constructor.name}: unexpectedly removed selector '${sel.format()}' while updating references.`
      );
    }
    return result.selector;
  }
  assertRemovedPathsAreUnreferenced(doc, removedPaths) {
    const blockingReference = doc.findBlockingReference(removedPaths);
    if (blockingReference !== null) {
      throw new ProtectedTargetError(
        `${this.constructor.name}: cannot remove '${blockingReference.removedPath.format()}' because reference '${blockingReference.referencePath.format()}' targets '${blockingReference.targetPath.format()}'.`
      );
    }
  }
  assertInsertedReferencesResolve(doc, insertions) {
    const insertedPaths = insertions.flatMap(({ path, node }) => {
      const paths = [];
      node.forEach((relativePath) => {
        paths.push(new Selector([...path.segments, ...relativePath.segments]));
      });
      return paths;
    });
    for (const { path, node } of insertions) {
      for (const reference of node.collectResolvedReferencePaths(path)) {
        const targetExists = doc.navigate(reference.targetPath).length > 0 || insertedPaths.some(
          (insertedPath) => this.matchesConcretePath(reference.targetPath, insertedPath)
        );
        if (!targetExists) {
          throw new MissingReferenceTargetError(
            `${this.constructor.name}: cannot create reference '${reference.referencePath.format()}' to missing target '${reference.targetPath.format()}'.`
          );
        }
      }
    }
  }
  matchesConcretePath(selector, concretePath) {
    const match = selector.matchPrefix(concretePath);
    return match.kind === "matched" && match.rest.length === 0;
  }
};
var NoOpOnRemovedTargetEdit = class extends Edit {
  handleRemovedTarget(prior) {
    return this.createRemovedTargetNoOp(prior);
  }
};
var NoOpEdit = class _NoOpEdit extends Edit {
  constructor(target, reason) {
    super();
    this.target = target;
    this.reason = reason;
  }
  isStructural = false;
  kind = "NoOp";
  apply(_doc) {
    throw new Error(
      "NoOpEdit must be surfaced as a conflict during materialization."
    );
  }
  toConflict() {
    return this.conflict(new PrimitiveNode(this.reason));
  }
  canApply(_doc) {
    return true;
  }
  transformSelector(sel) {
    return mapSelector(sel);
  }
  transform(_prior) {
    return this;
  }
  transformLaterConcurrentEdit(_concurrent) {
    return this;
  }
  computeInverse(_preDoc) {
    return this;
  }
  equals(other) {
    return other instanceof _NoOpEdit && this.target.equals(other.target) && this.reason === other.reason;
  }
  withTarget(target) {
    return new _NoOpEdit(target, this.reason);
  }
  encodeRemoteEdit() {
    return {
      kind: "NoOpEdit",
      target: this.target.format(),
      reason: this.reason
    };
  }
};
var CompositeEdit = class _CompositeEdit extends Edit {
  constructor(primary, mirrors) {
    super();
    this.primary = primary;
    this.mirrors = mirrors;
  }
  kind = "Composite";
  get target() {
    return this.primary.target;
  }
  get isStructural() {
    return this.primary.isStructural || this.mirrors.some((edit) => edit.isStructural);
  }
  get selectors() {
    return [
      ...this.primary.selectors,
      ...this.mirrors.flatMap((edit) => edit.selectors)
    ];
  }
  apply(doc) {
    this.primary.apply(doc);
    for (const mirror of this.collectApplicableMirrorEdits(doc)) {
      mirror.apply(doc);
    }
  }
  canApply(doc) {
    return this.primary.canApply(doc);
  }
  validate(doc) {
    this.primary.validate(doc);
    this.collectApplicableMirrorEdits(doc);
  }
  transformSelector(sel) {
    return this.primary.transformSelector(sel);
  }
  transform(prior) {
    const transformedPrimary = prior.transformLaterConcurrentEdit(this.primary);
    if (transformedPrimary instanceof NoOpEdit) {
      return transformedPrimary;
    }
    return createCompositeEdit(
      transformedPrimary,
      this.mirrors.map((mirror) => prior.transformLaterConcurrentEdit(mirror)).filter((mirror) => !(mirror instanceof NoOpEdit))
    );
  }
  transformLaterConcurrentEdit(concurrent) {
    let transformed = this.primary.transformLaterConcurrentEdit(concurrent);
    for (const mirror of this.mirrors) {
      if (transformed instanceof NoOpEdit) {
        return transformed;
      }
      transformed = mirror.transformLaterConcurrentEdit(transformed);
    }
    return transformed;
  }
  computeInverse(preDoc) {
    const allEdits = [this.primary, ...this.mirrors];
    const inverses = allEdits.map((edit) => edit.computeInverse(preDoc)).reverse();
    return createCompositeEdit(inverses[0], inverses.slice(1));
  }
  equals(other) {
    return other instanceof _CompositeEdit && this.primary.equals(other.primary) && this.mirrors.length === other.mirrors.length && this.mirrors.every(
      (mirror, index) => mirror.equals(other.mirrors[index])
    );
  }
  withTarget(target) {
    return createCompositeEdit(this.primary.withTarget(target), this.mirrors);
  }
  encodeRemoteEdit() {
    throw new Error(
      "CompositeEdit is an internal replay artifact and cannot be serialized for remote transmission."
    );
  }
  collectApplicableMirrorEdits(doc) {
    const applicableMirrors = [];
    for (const mirror of this.mirrors) {
      if (!mirror.canApply(doc)) {
        continue;
      }
      try {
        mirror.validate(doc);
      } catch (error) {
        if (error instanceof ProtectedTargetError || error instanceof MissingReferenceTargetError) {
          continue;
        }
        throw error;
      }
      applicableMirrors.push(mirror);
    }
    return applicableMirrors;
  }
};
function createCompositeEdit(primary, mirrors) {
  return mirrors.length === 0 ? primary : new CompositeEdit(primary, mirrors);
}

// core/remote-edit-codec.ts
var remoteEditDecoders = /* @__PURE__ */ new Map();
function checkIsRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function registerRemoteEditDecoder(kind, decoder) {
  if (remoteEditDecoders.has(kind)) {
    throw new Error(`Remote edit decoder '${kind}' is already registered.`);
  }
  remoteEditDecoders.set(kind, decoder);
}
function decodeRemoteEdit(encodedEdit) {
  if (!checkIsRecord(encodedEdit) || typeof encodedEdit.kind !== "string") {
    throw new Error(
      "decodeRemoteEdit: encoded edit must be an object with a string kind."
    );
  }
  const decoder = remoteEditDecoders.get(encodedEdit.kind);
  if (decoder === void 0) {
    throw new Error(
      `decodeRemoteEdit: unknown edit kind "${encodedEdit.kind}".`
    );
  }
  return decoder(encodedEdit);
}

// core/edits/list-edits.ts
var ListInsertEdit = class extends NoOpOnRemovedTargetEdit {
  isStructural = true;
  matchInsertedChildRoot(target) {
    const insertedChildPath = new Selector([...this.target.segments, "*"]);
    const match = insertedChildPath.matchPrefix(target);
    return match.kind === "no-match" ? null : match.rest;
  }
  rewriteInsertedNode(target, rewrite) {
    const relativeTarget = this.matchInsertedChildRoot(target);
    if (relativeTarget === null) return null;
    const rewrittenNode = rewrite(this.node.clone(), relativeTarget);
    return rewrittenNode === null ? null : this.withInsertedNode(rewrittenNode);
  }
};
var ListPushBackEdit = class _ListPushBackEdit extends ListInsertEdit {
  constructor(target, node) {
    super();
    this.target = target;
    this.node = node;
  }
  kind = "ListPushBack";
  validate(doc) {
    const insertions = doc.navigateWithPaths(this.target).map(({ path, node }) => {
      const list = this.assertList(node);
      return {
        path: new Selector([...path.segments, list.items.length]),
        node: this.node
      };
    });
    this.assertInsertedReferencesResolve(doc, insertions);
  }
  apply(doc) {
    this.validate(doc);
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      n.pushBack(this.node.clone());
    }
  }
  canApply(doc) {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) => node instanceof ListNode
    );
  }
  transformSelector(sel) {
    return mapSelector(sel);
  }
  transformLaterConcurrentEdit(concurrent) {
    if (!(concurrent instanceof ListInsertEdit)) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    const rewritten = concurrent.rewriteInsertedNode(
      this.target,
      (transformedNode, relativeTarget) => {
        if (relativeTarget.length !== 0 || !(transformedNode instanceof ListNode)) {
          return null;
        }
        transformedNode.pushBack(this.node.clone());
        return transformedNode;
      }
    );
    if (rewritten === null) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    return rewritten;
  }
  computeInverse(_preDoc) {
    return new ListPopBackEdit(this.target);
  }
  equals(other) {
    return other instanceof _ListPushBackEdit && this.target.equals(other.target) && this.node.equals(other.node);
  }
  withTarget(target) {
    return new _ListPushBackEdit(target, this.node);
  }
  withInsertedNode(node) {
    return new _ListPushBackEdit(this.target, node);
  }
  encodeRemoteEdit() {
    return {
      kind: "ListPushBackEdit",
      target: this.target.format(),
      node: this.node.toPlain()
    };
  }
};
registerRemoteEditDecoder(
  "ListPushBackEdit",
  (encodedEdit) => new ListPushBackEdit(
    Selector.parse(encodedEdit.target),
    Node.fromPlain(encodedEdit.node)
  )
);
var ListPushFrontEdit = class _ListPushFrontEdit extends ListInsertEdit {
  constructor(target, node) {
    super();
    this.target = target;
    this.node = node;
  }
  kind = "ListPushFront";
  validate(doc) {
    const insertions = doc.navigateWithPaths(this.target).map(({ path, node }) => {
      this.assertList(node);
      return { path: new Selector([...path.segments, 0]), node: this.node };
    });
    this.assertInsertedReferencesResolve(doc, insertions);
  }
  apply(doc) {
    this.validate(doc);
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      n.pushFront(this.node.clone());
    }
  }
  canApply(doc) {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) => node instanceof ListNode
    );
  }
  transformSelector(sel) {
    return this.target.shiftIndex(sel, 0, 1);
  }
  computeInverse(_preDoc) {
    return new ListPopFrontEdit(this.target);
  }
  equals(other) {
    return other instanceof _ListPushFrontEdit && this.target.equals(other.target) && this.node.equals(other.node);
  }
  withTarget(target) {
    return new _ListPushFrontEdit(target, this.node);
  }
  withInsertedNode(node) {
    return new _ListPushFrontEdit(this.target, node);
  }
  encodeRemoteEdit() {
    return {
      kind: "ListPushFrontEdit",
      target: this.target.format(),
      node: this.node.toPlain()
    };
  }
};
registerRemoteEditDecoder(
  "ListPushFrontEdit",
  (encodedEdit) => new ListPushFrontEdit(
    Selector.parse(encodedEdit.target),
    Node.fromPlain(encodedEdit.node)
  )
);
var ListPopBackEdit = class _ListPopBackEdit extends NoOpOnRemovedTargetEdit {
  constructor(target) {
    super();
    this.target = target;
  }
  isStructural = true;
  kind = "ListPopBack";
  validate(doc) {
    const removedPaths = doc.navigateWithPaths(this.target).flatMap(({ path, node }) => {
      const list = this.assertList(node);
      return list.items.length === 0 ? [] : [new Selector([...path.segments, list.items.length - 1])];
    });
    this.assertRemovedPathsAreUnreferenced(doc, removedPaths);
  }
  apply(doc) {
    this.validate(doc);
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      n.popBack();
    }
  }
  canApply(doc) {
    const nodes = doc.navigate(this.target);
    return nodes.length > 0 && nodes.every((node) => node instanceof ListNode && node.items.length > 0);
  }
  transformSelector(sel) {
    return mapSelector(sel);
  }
  transform(prior) {
    if ((prior instanceof _ListPopBackEdit || prior instanceof ListPopFrontEdit) && prior.target.equals(this.target)) {
      return new NoOpEdit(
        this.target,
        `${prior.constructor.name} already removed the list item targeted by ${this.constructor.name}.`
      );
    }
    return super.transform(prior);
  }
  computeInverse(preDoc) {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const list = this.assertList(nodes[0]);
    return new ListPushBackEdit(
      this.target,
      list.items[list.items.length - 1].clone()
    );
  }
  equals(other) {
    return other instanceof _ListPopBackEdit && this.target.equals(other.target);
  }
  withTarget(target) {
    return new _ListPopBackEdit(target);
  }
  encodeRemoteEdit() {
    return { kind: "ListPopBackEdit", target: this.target.format() };
  }
};
registerRemoteEditDecoder(
  "ListPopBackEdit",
  (encodedEdit) => new ListPopBackEdit(Selector.parse(encodedEdit.target))
);
var ListPopFrontEdit = class _ListPopFrontEdit extends NoOpOnRemovedTargetEdit {
  constructor(target) {
    super();
    this.target = target;
  }
  isStructural = true;
  kind = "ListPopFront";
  validate(doc) {
    const removedPaths = doc.navigateWithPaths(this.target).flatMap(({ path, node }) => {
      const list = this.assertList(node);
      return list.items.length === 0 ? [] : [new Selector([...path.segments, 0])];
    });
    this.assertRemovedPathsAreUnreferenced(doc, removedPaths);
  }
  apply(doc) {
    this.validate(doc);
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      n.popFront();
    }
  }
  canApply(doc) {
    const nodes = doc.navigate(this.target);
    return nodes.length > 0 && nodes.every((node) => node instanceof ListNode && node.items.length > 0);
  }
  transformSelector(sel) {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "matched" && m.rest.length > 0 && m.rest.segments[0] === 0) {
      return REMOVED_SELECTOR;
    }
    return this.target.shiftIndex(sel, 1, -1);
  }
  transform(prior) {
    if ((prior instanceof ListPopBackEdit || prior instanceof _ListPopFrontEdit) && prior.target.equals(this.target)) {
      return new NoOpEdit(
        this.target,
        `${prior.constructor.name} already removed the list item targeted by ${this.constructor.name}.`
      );
    }
    return super.transform(prior);
  }
  computeInverse(preDoc) {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const list = this.assertList(nodes[0]);
    return new ListPushFrontEdit(this.target, list.items[0].clone());
  }
  equals(other) {
    return other instanceof _ListPopFrontEdit && this.target.equals(other.target);
  }
  withTarget(target) {
    return new _ListPopFrontEdit(target);
  }
  encodeRemoteEdit() {
    return { kind: "ListPopFrontEdit", target: this.target.format() };
  }
};
registerRemoteEditDecoder(
  "ListPopFrontEdit",
  (encodedEdit) => new ListPopFrontEdit(Selector.parse(encodedEdit.target))
);

// core/edits/record-edits.ts
var RecordAddEdit = class _RecordAddEdit extends NoOpOnRemovedTargetEdit {
  constructor(target, node) {
    super();
    this.target = target;
    this.node = node;
  }
  isStructural = false;
  kind = "RecordAdd";
  validate(doc) {
    const insertions = doc.navigateWithPaths(this.target.parent).map(({ path, node }) => {
      this.assertRecord(node);
      return {
        path: new Selector([...path.segments, this.target.lastSegment]),
        node: this.node
      };
    });
    this.assertInsertedReferencesResolve(doc, insertions);
  }
  apply(doc) {
    this.validate(doc);
    const parentSel = this.target.parent;
    const field = String(this.target.lastSegment);
    const parents = this.navigateOrThrow(doc, parentSel);
    for (const parent of parents) {
      parent.addField(field, this.node.clone());
    }
  }
  canApply(doc) {
    return this.canFindNodesOfType(
      doc,
      this.target.parent,
      (node) => node instanceof RecordNode
    );
  }
  transformSelector(sel) {
    return mapSelector(sel);
  }
  computeInverse(_preDoc) {
    return new RecordDeleteEdit(this.target);
  }
  equals(other) {
    return other instanceof _RecordAddEdit && this.target.equals(other.target) && this.node.equals(other.node);
  }
  withTarget(target) {
    return new _RecordAddEdit(target, this.node);
  }
  encodeRemoteEdit() {
    return {
      kind: "RecordAddEdit",
      target: this.target.format(),
      node: this.node.toPlain()
    };
  }
};
registerRemoteEditDecoder(
  "RecordAddEdit",
  (encodedEdit) => new RecordAddEdit(
    Selector.parse(encodedEdit.target),
    Node.fromPlain(encodedEdit.node)
  )
);
var RecordDeleteEdit = class _RecordDeleteEdit extends NoOpOnRemovedTargetEdit {
  constructor(target) {
    super();
    this.target = target;
  }
  isStructural = true;
  kind = "RecordDelete";
  validate(doc) {
    this.assertRemovedPathsAreUnreferenced(
      doc,
      doc.navigateWithPaths(this.target).map((entry) => entry.path)
    );
  }
  apply(doc) {
    this.validate(doc);
    const parentSel = this.target.parent;
    const field = String(this.target.lastSegment);
    const parents = this.navigateOrThrow(doc, parentSel);
    for (const parent of parents) {
      parent.deleteField(field);
    }
  }
  canApply(doc) {
    return this.canFindNodesOfType(
      doc,
      this.target.parent,
      (node) => node instanceof RecordNode
    );
  }
  transformSelector(sel) {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "matched") return REMOVED_SELECTOR;
    return mapSelector(sel);
  }
  computeInverse(preDoc) {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    return new RecordAddEdit(this.target, nodes[0].clone());
  }
  equals(other) {
    return other instanceof _RecordDeleteEdit && this.target.equals(other.target);
  }
  withTarget(target) {
    return new _RecordDeleteEdit(target);
  }
  encodeRemoteEdit() {
    return { kind: "RecordDeleteEdit", target: this.target.format() };
  }
};
registerRemoteEditDecoder(
  "RecordDeleteEdit",
  (encodedEdit) => new RecordDeleteEdit(Selector.parse(encodedEdit.target))
);
var RecordRenameFieldEdit = class _RecordRenameFieldEdit extends NoOpOnRemovedTargetEdit {
  constructor(target, to) {
    super();
    this.target = target;
    this.to = to;
  }
  isStructural = true;
  kind = "RecordRenameField";
  apply(doc) {
    const referenceTargets = doc.captureReferenceTransformTargets();
    const parentSel = this.target.parent;
    const from = String(this.target.lastSegment);
    const parents = this.navigateOrThrow(doc, parentSel);
    for (const parent of parents) {
      parent.renameField(from, this.to);
    }
    doc.updateReferences(
      (abs) => this.transformSelectorOrThrow(abs),
      referenceTargets
    );
  }
  canApply(doc) {
    return this.canFindNodesOfType(
      doc,
      this.target.parent,
      (node) => node instanceof RecordNode
    );
  }
  transformSelector(sel) {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "no-match") return mapSelector(sel);
    return mapSelector(
      new Selector([
        ...m.specificPrefix.segments.slice(0, -1),
        this.to,
        ...m.rest.segments
      ])
    );
  }
  computeInverse(_preDoc) {
    const from = String(this.target.lastSegment);
    const newTarget = new Selector([
      ...this.target.parent.segments,
      this.to
    ]);
    return new _RecordRenameFieldEdit(newTarget, from);
  }
  equals(other) {
    return other instanceof _RecordRenameFieldEdit && this.target.equals(other.target) && this.to === other.to;
  }
  withTarget(target) {
    return new _RecordRenameFieldEdit(target, this.to);
  }
  encodeRemoteEdit() {
    return {
      kind: "RecordRenameFieldEdit",
      target: this.target.format(),
      to: this.to
    };
  }
};
registerRemoteEditDecoder(
  "RecordRenameFieldEdit",
  (encodedEdit) => new RecordRenameFieldEdit(
    Selector.parse(encodedEdit.target),
    encodedEdit.to
  )
);

// core/edits/unwrap-edits.ts
var UnwrapRecordEdit = class _UnwrapRecordEdit extends NoOpOnRemovedTargetEdit {
  constructor(target, field) {
    super();
    this.target = target;
    this.field = field;
  }
  isStructural = true;
  kind = "UnwrapRecord";
  apply(doc) {
    const referenceTargets = doc.captureReferenceTransformTargets();
    const entries = doc.navigateWithPaths(this.target);
    if (entries.length === 0) {
      throw new Error(
        `No nodes match selector '${this.target.format()}'.`
      );
    }
    for (const { path, node } of entries) {
      const record = this.assertRecord(node);
      const child = record.fields[this.field];
      if (child === void 0) {
        throw new Error(
          `UnwrapRecordEdit: field '${this.field}' not found at '${path.format()}'.`
        );
      }
      doc.replaceAtPath(path, child);
    }
    doc.updateReferences(
      (abs) => this.transformSelectorOrThrow(abs),
      referenceTargets
    );
  }
  canApply(doc) {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) => node instanceof RecordNode && this.field in node.fields
    );
  }
  transformSelector(sel) {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "no-match") return mapSelector(sel);
    if (m.rest.length > 0 && m.rest.segments[0] === this.field) {
      return mapSelector(
        new Selector([
          ...m.specificPrefix.segments,
          ...m.rest.segments.slice(1)
        ])
      );
    }
    return REMOVED_SELECTOR;
  }
  computeInverse(preDoc) {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const record = this.assertRecord(nodes[0]);
    return new WrapRecordEdit(this.target, this.field, record.tag);
  }
  equals(other) {
    return other instanceof _UnwrapRecordEdit && this.target.equals(other.target) && this.field === other.field;
  }
  withTarget(target) {
    return new _UnwrapRecordEdit(target, this.field);
  }
  encodeRemoteEdit() {
    return {
      kind: "UnwrapRecordEdit",
      target: this.target.format(),
      field: this.field
    };
  }
};
registerRemoteEditDecoder(
  "UnwrapRecordEdit",
  (encodedEdit) => new UnwrapRecordEdit(
    Selector.parse(encodedEdit.target),
    encodedEdit.field
  )
);
var UnwrapListEdit = class _UnwrapListEdit extends NoOpOnRemovedTargetEdit {
  constructor(target) {
    super();
    this.target = target;
  }
  isStructural = true;
  kind = "UnwrapList";
  apply(doc) {
    const referenceTargets = doc.captureReferenceTransformTargets();
    const entries = doc.navigateWithPaths(this.target);
    if (entries.length === 0) {
      throw new Error(
        `No nodes match selector '${this.target.format()}'.`
      );
    }
    for (const { path, node } of entries) {
      const list = this.assertList(node);
      if (list.items.length !== 1) {
        throw new Error(
          `UnwrapListEdit: expected exactly 1 item at '${path.format()}', found ${list.items.length}.`
        );
      }
      doc.replaceAtPath(path, list.items[0]);
    }
    doc.updateReferences(
      (abs) => this.transformSelectorOrThrow(abs),
      referenceTargets
    );
  }
  canApply(doc) {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) => node instanceof ListNode && node.items.length === 1
    );
  }
  transformSelector(sel) {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "no-match") return mapSelector(sel);
    if (m.rest.length === 0) return mapSelector(sel);
    const firstSeg = m.rest.segments[0];
    if (firstSeg === "*" || firstSeg === 0) {
      return mapSelector(
        new Selector([
          ...m.specificPrefix.segments,
          ...m.rest.segments.slice(1)
        ])
      );
    }
    return REMOVED_SELECTOR;
  }
  computeInverse(preDoc) {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const list = this.assertList(nodes[0]);
    return new WrapListEdit(this.target, list.tag);
  }
  equals(other) {
    return other instanceof _UnwrapListEdit && this.target.equals(other.target);
  }
  withTarget(target) {
    return new _UnwrapListEdit(target);
  }
  encodeRemoteEdit() {
    return {
      kind: "UnwrapListEdit",
      target: this.target.format()
    };
  }
};
registerRemoteEditDecoder(
  "UnwrapListEdit",
  (encodedEdit) => new UnwrapListEdit(Selector.parse(encodedEdit.target))
);

// core/edits/tree-edits.ts
var UpdateTagEdit = class _UpdateTagEdit extends NoOpOnRemovedTargetEdit {
  constructor(target, tag) {
    super();
    this.target = target;
    this.tag = tag;
  }
  isStructural = true;
  kind = "UpdateTag";
  apply(doc) {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      n.updateTag(this.tag);
    }
  }
  canApply(doc) {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) => node instanceof RecordNode || node instanceof ListNode
    );
  }
  transformSelector(sel) {
    return mapSelector(sel);
  }
  transformLaterConcurrentEdit(concurrent) {
    if (!(concurrent instanceof ListInsertEdit)) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    const rewritten = concurrent.rewriteInsertedNode(
      this.target,
      (transformedNode, relativeTarget) => {
        if (relativeTarget.length !== 0) return null;
        transformedNode.updateTag(this.tag);
        return transformedNode;
      }
    );
    return rewritten ?? super.transformLaterConcurrentEdit(concurrent);
  }
  computeInverse(preDoc) {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const plain = nodes[0].toPlain();
    const oldTag = plain.$tag;
    if (typeof oldTag !== "string") {
      throw new Error(
        "UpdateTagEdit.computeInverse: node has no $tag."
      );
    }
    return new _UpdateTagEdit(this.target, oldTag);
  }
  equals(other) {
    return other instanceof _UpdateTagEdit && this.target.equals(other.target) && this.tag === other.tag;
  }
  withTarget(target) {
    return new _UpdateTagEdit(target, this.tag);
  }
  encodeRemoteEdit() {
    return {
      kind: "UpdateTagEdit",
      target: this.target.format(),
      tag: this.tag
    };
  }
};
registerRemoteEditDecoder(
  "UpdateTagEdit",
  (encodedEdit) => new UpdateTagEdit(Selector.parse(encodedEdit.target), encodedEdit.tag)
);
var CopyEdit = class _CopyEdit extends Edit {
  constructor(target, source) {
    super();
    this.target = target;
    this.source = source;
  }
  isStructural = true;
  kind = "Copy";
  get selectors() {
    return [this.target, this.source];
  }
  apply(doc) {
    const sourceNodes = doc.navigate(this.source);
    const targetEntries = doc.navigateWithPaths(this.target);
    if (sourceNodes.length === 0) {
      throw new Error(
        `copy: no nodes match source selector '${this.source.format()}'`
      );
    }
    if (targetEntries.length === 0) {
      throw new Error(
        `copy: no nodes match target selector '${this.target.format()}'`
      );
    }
    if (sourceNodes.length === targetEntries.length) {
      for (let i = 0; i < sourceNodes.length; i++) {
        const replacementNode = sourceNodes[i].clone();
        const entry = targetEntries[i];
        doc.replaceAtPath(entry.path, replacementNode);
      }
    } else if (targetEntries.length === 1 && targetEntries[0].node instanceof ListNode) {
      targetEntries[0].node.setItems(sourceNodes.map((n) => n.clone()));
    } else {
      throw new Error(
        `copy: source/target arity mismatch (source=${sourceNodes.length}, target=${targetEntries.length}). Need equal counts or one list target.`
      );
    }
  }
  canApply(doc) {
    const sourceNodes = doc.navigate(this.source);
    const targetEntries = doc.navigateWithPaths(this.target);
    return sourceNodes.length > 0 && targetEntries.length > 0 && (sourceNodes.length === targetEntries.length || targetEntries.length === 1 && targetEntries[0].node instanceof ListNode);
  }
  transformSelector(sel) {
    return mapSelector(sel);
  }
  transformLaterConcurrentEdit(concurrent) {
    if (concurrent instanceof CompositeEdit) {
      return concurrent.transform(this);
    }
    const transformed = concurrent.transform(this);
    if (transformed instanceof NoOpEdit) {
      return transformed;
    }
    if (this.source.equals(this.target)) {
      return transformed;
    }
    const mirroredTarget = this.computeMirrorTargetSelector(transformed.target);
    if (mirroredTarget === null || mirroredTarget.equals(transformed.target)) {
      return transformed;
    }
    return createCompositeEdit(transformed, [
      transformed.withTarget(mirroredTarget)
    ]);
  }
  transform(prior) {
    const t = prior.transformSelector(this.target);
    const s = prior.transformSelector(this.source);
    if (t.kind === "removed") {
      return new NoOpEdit(
        this.target,
        `${prior.constructor.name} removed copy target '${this.target.format()}'.`
      );
    }
    if (s.kind === "removed") {
      return new NoOpEdit(
        this.target,
        `${prior.constructor.name} removed copy source '${this.source.format()}'.`
      );
    }
    return new _CopyEdit(t.selector, s.selector);
  }
  /**
   * Maps a concrete selector inside the copy source onto the corresponding
   * managed-copy target path.
   *
   * Supported shapes:
   * - direct subtree copies with no wildcards (for example `a/source` to `a/target`)
   * - one-to-one wildcard copies (for example `rows/<index>/name` to `rows/<index>/email`)
   * - copying a wildcard source collection into a single list target
   *   (for example `scratch/<index>` to `items`), where the captured source index becomes the list
   *   item index under the target list.
   *
   * More ambiguous source/target shape pairs currently opt out of mirroring and
   * return `null` instead of guessing a selector that could diverge.
   */
  computeMirrorTargetSelector(sel) {
    const matchedSource = this.source.matchPrefix(sel);
    if (matchedSource.kind === "no-match") {
      return null;
    }
    const wildcardCaptures = this.extractWildcardCaptures(
      matchedSource.specificPrefix
    );
    const targetWildcardCount = this.computeWildcardSegmentCount(this.target);
    if (!(wildcardCaptures.length === targetWildcardCount || targetWildcardCount === 0 && wildcardCaptures.length === 1)) {
      return null;
    }
    let captureIndex = 0;
    const mirroredPrefix = this.target.segments.map(
      (segment) => segment === "*" ? wildcardCaptures[captureIndex++] : segment
    );
    return new Selector([
      ...mirroredPrefix,
      ...wildcardCaptures.slice(captureIndex),
      ...matchedSource.rest.segments
    ]);
  }
  extractWildcardCaptures(specificSourcePrefix) {
    const captures = [];
    for (let segmentIndex = 0; segmentIndex < this.source.length; segmentIndex++) {
      if (this.source.segments[segmentIndex] === "*") {
        captures.push(specificSourcePrefix.segments[segmentIndex]);
      }
    }
    return captures;
  }
  computeWildcardSegmentCount(selector) {
    return selector.segments.filter((segment) => segment === "*").length;
  }
  computeInverse(_preDoc) {
    throw new Error("CopyEdit does not support computeInverse.");
  }
  equals(other) {
    return other instanceof _CopyEdit && this.target.equals(other.target) && this.source.equals(other.source);
  }
  withTarget(target) {
    return new _CopyEdit(target, this.source);
  }
  encodeRemoteEdit() {
    return {
      kind: "CopyEdit",
      target: this.target.format(),
      source: this.source.format()
    };
  }
};
registerRemoteEditDecoder(
  "CopyEdit",
  (encodedEdit) => new CopyEdit(
    Selector.parse(encodedEdit.target),
    Selector.parse(encodedEdit.source)
  )
);
var WrapRecordEdit = class _WrapRecordEdit extends NoOpOnRemovedTargetEdit {
  constructor(target, field, tag) {
    super();
    this.target = target;
    this.field = field;
    this.tag = tag;
  }
  isStructural = true;
  kind = "WrapRecord";
  apply(doc) {
    const referenceTargets = doc.captureReferenceTransformTargets();
    this.navigateOrThrow(doc, this.target);
    doc.wrapAtPath(
      this.target,
      (child) => new RecordNode(this.tag, { [this.field]: child })
    );
    doc.updateReferences(
      (abs) => this.transformSelectorOrThrow(abs),
      referenceTargets
    );
  }
  canApply(doc) {
    return this.target.length > 0 && this.canFindNodes(doc, this.target);
  }
  transformSelector(sel) {
    const m = this.target.matchPrefix(sel);
    return m.kind === "no-match" ? mapSelector(sel) : mapSelector(
      new Selector([
        ...m.specificPrefix.segments,
        this.field,
        ...m.rest.segments
      ])
    );
  }
  transform(prior) {
    const transformedTarget = prior.transformSelector(this.target);
    if (transformedTarget.kind === "removed") {
      return this.handleRemovedTarget(prior);
    }
    return new _WrapRecordEdit(transformedTarget.selector, this.field, this.tag);
  }
  computeInverse(_preDoc) {
    return new UnwrapRecordEdit(this.target, this.field);
  }
  equals(other) {
    return other instanceof _WrapRecordEdit && this.target.equals(other.target) && this.field === other.field && this.tag === other.tag;
  }
  withTarget(target) {
    return new _WrapRecordEdit(target, this.field, this.tag);
  }
  encodeRemoteEdit() {
    return {
      kind: "WrapRecordEdit",
      target: this.target.format(),
      field: this.field,
      tag: this.tag
    };
  }
};
registerRemoteEditDecoder(
  "WrapRecordEdit",
  (encodedEdit) => new WrapRecordEdit(
    Selector.parse(encodedEdit.target),
    encodedEdit.field,
    encodedEdit.tag
  )
);
var WrapListEdit = class _WrapListEdit extends NoOpOnRemovedTargetEdit {
  constructor(target, tag) {
    super();
    this.target = target;
    this.tag = tag;
  }
  isStructural = true;
  kind = "WrapList";
  apply(doc) {
    const referenceTargets = doc.captureReferenceTransformTargets();
    this.navigateOrThrow(doc, this.target);
    doc.wrapAtPath(this.target, (child) => new ListNode(this.tag, [child]));
    doc.updateReferences(
      (abs) => this.transformReferenceSelector(abs),
      referenceTargets
    );
  }
  canApply(doc) {
    return this.target.length > 0 && this.canFindNodes(doc, this.target);
  }
  transformSelector(sel) {
    const m = this.target.matchPrefix(sel);
    const insertedSegment = this.target.lastSegment === "*" ? 0 : "*";
    return m.kind === "no-match" ? mapSelector(sel) : mapSelector(
      new Selector([
        ...m.specificPrefix.segments,
        insertedSegment,
        ...m.rest.segments
      ])
    );
  }
  transformLaterConcurrentEdit(concurrent) {
    if (!(concurrent instanceof ListInsertEdit)) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    const rewritten = concurrent.rewriteInsertedNode(
      this.target,
      (insertedNode, relativeTarget) => relativeTarget.length !== 0 ? null : new ListNode(this.tag, [insertedNode])
    );
    return rewritten ?? super.transformLaterConcurrentEdit(concurrent);
  }
  transformReferenceSelector(sel) {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "no-match") return sel;
    return new Selector([
      ...m.specificPrefix.segments,
      "*",
      ...m.rest.segments
    ]);
  }
  computeInverse(_preDoc) {
    return new UnwrapListEdit(this.target);
  }
  equals(other) {
    return other instanceof _WrapListEdit && this.target.equals(other.target) && this.tag === other.tag;
  }
  withTarget(target) {
    return new _WrapListEdit(target, this.tag);
  }
  encodeRemoteEdit() {
    return {
      kind: "WrapListEdit",
      target: this.target.format(),
      tag: this.tag
    };
  }
};
registerRemoteEditDecoder(
  "WrapListEdit",
  (encodedEdit) => new WrapListEdit(Selector.parse(encodedEdit.target), encodedEdit.tag)
);

// core/primitive-edits.ts
var registeredPrimitiveEdits = /* @__PURE__ */ new Map();
function registerPrimitiveEdit(name, implementation) {
  if (name.trim().length === 0) {
    throw new Error("Primitive edit name must not be empty.");
  }
  const existingImplementation = registeredPrimitiveEdits.get(name);
  if (existingImplementation === implementation) {
    return;
  }
  if (existingImplementation !== void 0) {
    throw new Error(`Primitive edit '${name}' is already registered.`);
  }
  registeredPrimitiveEdits.set(name, implementation);
}
function applyRegisteredPrimitiveEdit(name, value, args = []) {
  const implementation = registeredPrimitiveEdits.get(name);
  if (implementation === void 0) {
    throw new Error(
      `Unknown primitive edit '${name}'. Register it before replaying events that use it.`
    );
  }
  return implementation(value, ...args);
}
registerPrimitiveEdit("set", (_value, ...args) => {
  if (args.length !== 1) {
    throw new Error("Primitive edit 'set' expects exactly 1 argument.");
  }
  return args[0];
});

// core/edits/value-edits.ts
var ApplyPrimitiveEdit = class _ApplyPrimitiveEdit extends NoOpOnRemovedTargetEdit {
  constructor(target, editName, args = []) {
    super();
    this.target = target;
    this.editName = editName;
    this.args = args;
  }
  isStructural = false;
  kind = "ApplyPrimitiveEdit";
  apply(doc) {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const node of nodes) {
      if (!(node instanceof PrimitiveNode)) {
        throw new Error(
          `${node.constructor.name} does not support 'setPrimitive'.`
        );
      }
      node.setPrimitive(
        applyRegisteredPrimitiveEdit(this.editName, node.value, this.args)
      );
    }
  }
  canApply(doc) {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) => node instanceof PrimitiveNode
    );
  }
  transformSelector(sel) {
    return mapSelector(sel);
  }
  transformLaterConcurrentEdit(concurrent) {
    if (!(concurrent instanceof ListInsertEdit)) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    const rewritten = concurrent.rewriteInsertedNode(
      this.target,
      (transformedNode, relativeTarget) => {
        const nodes = transformedNode.navigate(relativeTarget);
        if (nodes.length === 0 || !nodes.every((node) => node instanceof PrimitiveNode)) {
          return null;
        }
        for (const node of nodes) {
          node.setPrimitive(
            applyRegisteredPrimitiveEdit(this.editName, node.value, this.args)
          );
        }
        return transformedNode;
      }
    );
    return rewritten ?? super.transformLaterConcurrentEdit(concurrent);
  }
  computeInverse(preDoc) {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const primitive = nodes[0];
    if (!(primitive instanceof PrimitiveNode)) {
      throw new Error(
        `ApplyPrimitiveEdit.computeInverse: expected primitive, found '${primitive.constructor.name}'`
      );
    }
    return new _ApplyPrimitiveEdit(this.target, "set", [primitive.value]);
  }
  equals(other) {
    return other instanceof _ApplyPrimitiveEdit && this.target.equals(other.target) && this.editName === other.editName && this.args.length === other.args.length && this.args.every((arg, index) => arg === other.args[index]);
  }
  withTarget(target) {
    return new _ApplyPrimitiveEdit(target, this.editName, this.args);
  }
  encodeRemoteEdit() {
    return {
      kind: "ApplyPrimitiveEdit",
      target: this.target.format(),
      editName: this.editName,
      args: this.args
    };
  }
};
registerRemoteEditDecoder(
  "ApplyPrimitiveEdit",
  (encodedEdit) => new ApplyPrimitiveEdit(
    Selector.parse(encodedEdit.target),
    encodedEdit.editName,
    Array.isArray(encodedEdit.args) ? encodedEdit.args : []
  )
);

// ../../tools/deno_std/binary-heap.ts
var BinaryHeap = class {
  values = [];
  compareValues;
  constructor(compareValues) {
    this.compareValues = compareValues;
  }
  get length() {
    return this.values.length;
  }
  push(value) {
    this.values.push(value);
    this.bubbleUp(this.values.length - 1);
  }
  pop() {
    if (this.values.length === 0) {
      return void 0;
    }
    const topValue = this.values[0];
    const lastValue = this.values.pop();
    if (this.values.length > 0) {
      this.values[0] = lastValue;
      this.bubbleDown(0);
    }
    return topValue;
  }
  bubbleUp(index) {
    let currentIndex = index;
    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);
      if (this.compareValues(this.values[currentIndex], this.values[parentIndex]) >= 0) {
        return;
      }
      [this.values[currentIndex], this.values[parentIndex]] = [
        this.values[parentIndex],
        this.values[currentIndex]
      ];
      currentIndex = parentIndex;
    }
  }
  bubbleDown(index) {
    let currentIndex = index;
    while (true) {
      const leftChildIndex = currentIndex * 2 + 1;
      const rightChildIndex = leftChildIndex + 1;
      let smallestIndex = currentIndex;
      if (leftChildIndex < this.values.length && this.compareValues(this.values[leftChildIndex], this.values[smallestIndex]) < 0) {
        smallestIndex = leftChildIndex;
      }
      if (rightChildIndex < this.values.length && this.compareValues(this.values[rightChildIndex], this.values[smallestIndex]) < 0) {
        smallestIndex = rightChildIndex;
      }
      if (smallestIndex === currentIndex) {
        return;
      }
      [this.values[currentIndex], this.values[smallestIndex]] = [
        this.values[smallestIndex],
        this.values[currentIndex]
      ];
      currentIndex = smallestIndex;
    }
  }
};

// core/peer-id.ts
function validatePeerId(peer) {
  if (peer.length === 0) {
    throw new Error("Peer ids must not be empty.");
  }
  if (peer.includes(":")) {
    throw new Error(`Peer id '${peer}' cannot contain ':'.`);
  }
}

// core/event.ts
function transformLaterConcurrentEdit(prior, concurrent) {
  return prior.transformLaterConcurrentEdit(concurrent);
}
var Event = class {
  constructor(id, parents, edit, clock) {
    this.id = id;
    this.parents = parents;
    this.edit = edit;
    this.clock = clock;
  }
  equals(other) {
    if (!this.id.equals(other.id)) return false;
    if (this.parents.length !== other.parents.length) return false;
    for (let i = 0; i < this.parents.length; i++) {
      if (!this.parents[i].equals(other.parents[i])) return false;
    }
    if (!this.clock.equals(other.clock)) return false;
    return this.edit.equals(other.edit);
  }
  isConcurrentWith(other) {
    return this !== other && !this.clock.dominates(other.clock) && !other.clock.dominates(this.clock);
  }
  validate(known) {
    const key = this.id.format();
    validatePeerId(this.id.peer);
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
    for (const [peer, seq] of Object.entries(this.clock.toRecord())) {
      validatePeerId(peer);
      if (!Number.isInteger(seq) || seq < 0) {
        throw new Error(
          `Invalid vector clock entry '${peer}:${seq}' for '${key}'.`
        );
      }
    }
    if (this.clock.get(this.id.peer) !== this.id.seq) {
      throw new Error(
        `Event '${key}' must have vector clock entry ${this.id.peer}=${this.id.seq}, but found ${this.clock.get(this.id.peer)}.`
      );
    }
    for (const parent of this.parents) {
      const parentEvent = known.get(parent.format());
      if (!this.clock.dominates(parentEvent.clock)) {
        throw new Error(
          `Event '${key}' clock ${JSON.stringify(this.clock.toRecord())} must dominate parent '${parent.format()}' clock ${JSON.stringify(parentEvent.clock.toRecord())}.`
        );
      }
    }
  }
  /**
   * Transforms this event's edit against all concurrent prior edits.
   * Most edit pairs map through unchanged, but some concurrent edits rewrite a
   * later edit's selector or inserted payload during deterministic replay.
   */
  resolveAgainst(applied, doc) {
    let edit = this.edit;
    let sawConcurrentEdit = false;
    let sawConcurrentTransform = false;
    for (const prior of applied) {
      if (this.clock.dominates(prior.ev.clock)) continue;
      if (this.isConcurrentWith(prior.ev)) {
        sawConcurrentEdit = true;
        sawConcurrentTransform = true;
        edit = transformLaterConcurrentEdit(prior.edit, edit);
      }
    }
    if (sawConcurrentTransform && !edit.canApply(doc)) {
      return new NoOpEdit(
        edit.target,
        `Concurrent replay left '${edit.target.format()}' unavailable before ${this.edit.constructor.name} could replay.`
      );
    }
    if (sawConcurrentEdit) {
      try {
        edit.validate(doc);
      } catch (error) {
        if (!(error instanceof ProtectedTargetError) && !(error instanceof MissingReferenceTargetError)) throw error;
        return new NoOpEdit(
          edit.target,
          error instanceof ProtectedTargetError ? `Concurrent replay left '${edit.target.format()}' protected before ${this.edit.constructor.name} could replay.` : `Concurrent replay left '${edit.target.format()}' referencing a missing target before ${this.edit.constructor.name} could replay.`
        );
      }
    }
    return edit;
  }
};

// core/event-id.ts
var EventId = class _EventId {
  constructor(peer, seq) {
    this.peer = peer;
    this.seq = seq;
  }
  static validatePeer(peer) {
    validatePeerId(peer);
  }
  static parse(value) {
    const [peer, seqText] = value.split(":");
    const seq = Number(seqText);
    if (peer === void 0 || seqText === void 0 || !Number.isInteger(seq) || seq < 0) {
      throw new Error(`Invalid event id '${value}'.`);
    }
    _EventId.validatePeer(peer);
    return new _EventId(peer, seq);
  }
  format() {
    return `${this.peer}:${this.seq}`;
  }
  compareTo(other) {
    if (this.peer < other.peer) return -1;
    if (this.peer > other.peer) return 1;
    return this.seq - other.seq;
  }
  equals(other) {
    return this.peer === other.peer && this.seq === other.seq;
  }
};

// core/vector-clock.ts
function validateClockEntry(peer, seq) {
  EventId.validatePeer(peer);
  if (!Number.isSafeInteger(seq) || seq < 0) {
    throw new Error(
      `Invalid vector clock entry ${peer}=${seq}. Expected a non-negative safe integer.`
    );
  }
}
var VectorClock = class _VectorClock {
  entries;
  constructor(entries) {
    this.entries = {};
    if (entries !== void 0) {
      for (const [peer, seq] of Object.entries(entries)) {
        validateClockEntry(peer, seq);
        this.entries[peer] = seq;
      }
    }
  }
  get(peer) {
    return this.entries[peer] ?? -1;
  }
  set(peer, seq) {
    validateClockEntry(peer, seq);
    this.entries[peer] = seq;
  }
  tick(peer) {
    const next = this.get(peer) + 1;
    this.set(peer, next);
    return next;
  }
  dominates(other) {
    return Object.entries(other.entries).every(
      ([peer, seq]) => this.get(peer) >= seq
    );
  }
  merge(other) {
    for (const [peer, seq] of Object.entries(other.entries)) {
      this.set(peer, Math.max(this.get(peer), seq));
    }
  }
  equals(other) {
    const aKeys = Object.keys(this.entries);
    if (aKeys.length !== Object.keys(other.entries).length) return false;
    return aKeys.every((k) => this.entries[k] === other.get(k));
  }
  clone() {
    return new _VectorClock(this.entries);
  }
  entryRecords() {
    return Object.entries(this.entries);
  }
  toRecord() {
    return { ...this.entries };
  }
};

// core/event-graph.ts
var MAX_BUFFERED_REMOTE_EVENTS = 1e4;
var MAX_REPLAY_TRANSFORMATIONS = 1e4;
var EventGraph = class {
  initial;
  events;
  _frontierIds;
  cachedOrder = null;
  bufferedEvents = [];
  constructor(initial, events, frontiers) {
    this.initial = initial;
    this.events = events ?? /* @__PURE__ */ new Map();
    this._frontierIds = frontiers ?? [];
  }
  get frontiers() {
    return [...this._frontierIds];
  }
  hasEvent(key) {
    return this.events.has(key);
  }
  getEvent(key) {
    return this.events.get(key);
  }
  /**
   * Resolves an event into the edit shape it should replay against the current
   * graph state.
   *
   * The returned edit first reuses the same conflict-resolution path as normal
   * materialization, then it is transformed through every later structural edit
   * that changed the document shape after the source event was recorded. This
   * lets replay follow renamed, wrapped, or reindexed targets instead of using
   * the source event's stale original selectors.
   *
   * Throws when the source event is unknown, already resolves to a conflict, or
   * later structural history has removed the replay target entirely.
   */
  resolveReplayEdit(key) {
    const sourceEvent = this.events.get(key);
    if (sourceEvent === void 0) {
      throw new Error(
        `Unknown event '${key}'. Events must be recorded locally or received before they can be replayed.`
      );
    }
    const ordered = this.cachedOrder ??= this.computeTopologicalOrder();
    const doc = this.initial.clone();
    const applied = [];
    let replayEdit = null;
    let replayTransformationCount = 0;
    for (const orderedKey of ordered) {
      const event = this.events.get(orderedKey);
      const edit = event.resolveAgainst(applied, doc);
      if (orderedKey === key) {
        if (edit instanceof NoOpEdit) {
          throw new Error(
            `Cannot replay event '${key}' because it currently resolves to a conflict.`
          );
        }
        replayEdit = edit;
      } else if (replayEdit !== null && edit.isStructural) {
        replayTransformationCount++;
        if (replayTransformationCount > MAX_REPLAY_TRANSFORMATIONS) {
          throw new Error(
            `Cannot replay event '${key}' through more than ${MAX_REPLAY_TRANSFORMATIONS} structural transformations.`
          );
        }
        replayEdit = edit.transformLaterConcurrentEdit(replayEdit);
        if (replayEdit instanceof NoOpEdit) {
          throw new Error(
            `Cannot replay event '${key}' because later structural edits removed its target.`
          );
        }
      }
      if (edit instanceof NoOpEdit) {
        continue;
      }
      edit.apply(doc);
      applied.push({ ev: event, edit });
    }
    if (replayEdit === null) {
      throw new Error(
        `Unknown event '${key}'. Events must be recorded locally or received before they can be replayed.`
      );
    }
    return replayEdit;
  }
  insertEvent(event) {
    event.validate(this.events);
    this.validateEventAgainstCausalState(event);
    this.events.set(event.id.format(), event);
    const parentKeys = new Set(event.parents.map((p) => p.format()));
    this._frontierIds = [
      ...this._frontierIds.filter((h) => !parentKeys.has(h.format())),
      event.id
    ].sort((a, b) => a.compareTo(b));
    this.cachedOrder = null;
  }
  validateEventAgainstCausalState(event) {
    const { doc } = this.materialize(event.parents);
    event.edit.validate(doc);
  }
  /** Creates a new event from a local edit, inserts it, and returns it. */
  createEvent(peer, edit) {
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
  collectPendingEvents(incomingEvents) {
    const pendingByKey = {};
    for (const event of [...this.bufferedEvents, ...incomingEvents]) {
      const key = event.id.format();
      const existing = this.events.get(key);
      if (existing != null) {
        if (!existing.equals(event)) {
          throw new Error(`Conflicting payload for event '${key}'.`);
        }
        continue;
      }
      const pendingEvent = pendingByKey[key];
      if (pendingEvent !== void 0 && !pendingEvent.equals(event)) {
        throw new Error(`Conflicting payload for event '${key}'.`);
      }
      pendingByKey[key] = event;
    }
    return pendingByKey;
  }
  computePendingDependencyIndex(pendingByKey) {
    const missingParentCountsByKey = {};
    const childKeysByMissingParent = {};
    const readyKeys = [];
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
      if (missingParentCount === 0) readyKeys.push(key);
    }
    return { missingParentCountsByKey, childKeysByMissingParent, readyKeys };
  }
  drainReadyEvents(pendingByKey, missingParentCountsByKey, childKeysByMissingParent, readyKeys) {
    while (readyKeys.length > 0) {
      const key = readyKeys.pop();
      const event = pendingByKey[key];
      this.insertEvent(event);
      delete pendingByKey[key];
      const childKeys = childKeysByMissingParent[key];
      if (childKeys != null) {
        for (const childKey of childKeys) {
          const newMissingParentCount = missingParentCountsByKey[childKey] - 1;
          missingParentCountsByKey[childKey] = newMissingParentCount;
          if (newMissingParentCount === 0 && pendingByKey[childKey] !== void 0) {
            readyKeys.push(childKey);
          }
        }
      }
    }
    return Object.values(pendingByKey);
  }
  /** Ingests remote events, buffering out-of-order ones. Returns the current buffer. */
  ingestEvents(incomingEvents) {
    const pendingByKey = this.collectPendingEvents(incomingEvents);
    if (Object.keys(pendingByKey).length === 0) {
      this.bufferedEvents = [];
      return [];
    }
    const { missingParentCountsByKey, childKeysByMissingParent, readyKeys } = this.computePendingDependencyIndex(pendingByKey);
    this.bufferedEvents = this.drainReadyEvents(
      pendingByKey,
      missingParentCountsByKey,
      childKeysByMissingParent,
      readyKeys
    );
    if (this.bufferedEvents.length > MAX_BUFFERED_REMOTE_EVENTS) {
      throw new Error(
        `Cannot buffer more than ${MAX_BUFFERED_REMOTE_EVENTS} out-of-order remote events.`
      );
    }
    return [...this.bufferedEvents];
  }
  /** Returns events not known by a peer with the given frontiers. */
  eventsSince(remoteFrontiers) {
    const remoteKnown = this.filterCausalPast(remoteFrontiers, false);
    return [...this.events.values()].filter(
      (ev) => !remoteKnown.has(ev.id.format())
    );
  }
  filterCausalPast(frontier, strict = true) {
    const causalPast = /* @__PURE__ */ new Set();
    const stack = frontier.map((id) => id.format());
    while (stack.length > 0) {
      const key = stack.pop();
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
  /**
   * Computes a deterministic topological order with plain Kahn scheduling.
   *
   * The only tie-break among currently ready nodes is EventId ordering; there
   * are no replay-specific heuristics here. Any semantics that depend on
   * concurrent ordering must therefore be expressed by edit transforms rather
   * than by materialization order.
   */
  computeTopologicalOrder(frontier) {
    const front = frontier ?? this._frontierIds;
    const causalPast = this.filterCausalPast(front);
    const indegree = {};
    const children = {};
    for (const key of causalPast) {
      indegree[key] = 0;
      children[key] = [];
    }
    for (const key of causalPast) {
      const ev = this.events.get(key);
      for (const p of ev.parents) {
        const pk = p.format();
        if (!causalPast.has(pk)) continue;
        indegree[key] = (indegree[key] ?? 0) + 1;
        children[pk]?.push(key);
      }
    }
    const queue = new BinaryHeap(
      (leftKey, rightKey) => this.events.get(leftKey).id.compareTo(
        this.events.get(rightKey).id
      )
    );
    for (const key of Object.keys(indegree)) {
      if (indegree[key] === 0) queue.push(key);
    }
    const ordered = [];
    while (queue.length > 0) {
      const key = queue.pop();
      ordered.push(key);
      for (const ch of children[key]) {
        indegree[ch] = (indegree[ch] ?? 0) - 1;
        if (indegree[ch] === 0) queue.push(ch);
      }
    }
    if (ordered.length !== causalPast.size) {
      throw new Error("Event graph contains a cycle.");
    }
    return ordered;
  }
  materialize(frontier) {
    const ordered = frontier ? this.computeTopologicalOrder(frontier) : this.cachedOrder ??= this.computeTopologicalOrder();
    const doc = this.initial.clone();
    const applied = [];
    const conflicts = [];
    for (const key of ordered) {
      const ev = this.events.get(key);
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
   * initial document and discarding all events once the caller confirms the
   * currently acknowledged frontier set.
   *
   * After compaction, the graph has zero events and the current materialized
   * state becomes the new initial document.
   */
  compact(acknowledgedFrontiers) {
    const expectedFrontiers = [...this._frontierIds].map(
      (eventId) => eventId.format()
    ).sort();
    const providedFrontiers = acknowledgedFrontiers.map(
      (eventId) => eventId.format()
    ).sort();
    if (expectedFrontiers.length !== providedFrontiers.length || expectedFrontiers.some(
      (frontier, index) => frontier !== providedFrontiers[index]
    )) {
      throw new Error(
        "Cannot compact with stale frontiers. Pass the current acknowledged frontiers."
      );
    }
    if (this.bufferedEvents.length > 0) {
      throw new Error(
        "Cannot compact while out-of-order remote events are still buffered."
      );
    }
    const { doc } = this.materialize();
    this.initial = doc;
    this.events = /* @__PURE__ */ new Map();
    this._frontierIds = [];
    this.cachedOrder = null;
  }
  /** Returns a serializable snapshot of all known events for UI inspection. */
  snapshotEvents() {
    return [...this.events.values()].map((ev) => ({
      id: ev.id.format(),
      peer: ev.id.peer,
      seq: ev.id.seq,
      parents: ev.parents.map((p) => p.format()),
      editKind: ev.edit.kind,
      target: ev.edit.target.format()
    }));
  }
};

// core/remote-events.ts
function checkIsRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function decodeRemoteEventId(encodedEventId) {
  if (!checkIsRecord2(encodedEventId)) {
    throw new Error("Remote event ids must be objects.");
  }
  if (typeof encodedEventId.peer !== "string") {
    throw new Error("Remote event id peer must be a string.");
  }
  if (!Number.isSafeInteger(encodedEventId.seq) || encodedEventId.seq < 0) {
    throw new Error("Remote event id seq must be a non-negative safe integer.");
  }
  EventId.validatePeer(encodedEventId.peer);
  return new EventId(encodedEventId.peer, encodedEventId.seq);
}
function encodeRemoteEventId(eventId) {
  return { peer: eventId.peer, seq: eventId.seq };
}
function encodeRemoteEvent(event) {
  return {
    id: encodeRemoteEventId(event.id),
    parents: event.parents.map(encodeRemoteEventId),
    edit: event.edit.encodeRemoteEdit(),
    clock: event.clock.toRecord()
  };
}
function decodeRemoteEvent(encodedEvent) {
  if (!checkIsRecord2(encodedEvent)) {
    throw new Error("Remote events must be objects.");
  }
  if (!Array.isArray(encodedEvent.parents)) {
    throw new Error("Remote event parents must be an array.");
  }
  if (!checkIsRecord2(encodedEvent.clock)) {
    throw new Error("Remote event clock must be an object.");
  }
  return new Event(
    decodeRemoteEventId(encodedEvent.id),
    encodedEvent.parents.map(decodeRemoteEventId),
    decodeRemoteEdit(encodedEvent.edit),
    new VectorClock(encodedEvent.clock)
  );
}

// core/formula-engine.ts
var FormulaError = class {
  constructor(message) {
    this.message = message;
  }
  toString() {
    return `#ERR: ${this.message}`;
  }
};
function isPlainRef(node) {
  return typeof node === "object" && node !== null && "$ref" in node && typeof node.$ref === "string";
}
function isPlainList(node) {
  return typeof node === "object" && node !== null && "$tag" in node && "$items" in node;
}
function isPlainRecord(node) {
  return typeof node === "object" && node !== null && "$tag" in node && !("$items" in node);
}
function isFormulaNode(node) {
  return isPlainRecord(node) && typeof node.$tag === "string" && node.$tag.startsWith("x-formula");
}
function isPrimitive(node) {
  return typeof node === "string" || typeof node === "number" || typeof node === "boolean";
}
var operations = /* @__PURE__ */ new Map();
function registerFormulaOperation(name, fn) {
  operations.set(name, fn);
}
function lookupOperation(name) {
  return operations.get(name);
}
function coerceNumbers(args, opName) {
  return args.map((a) => {
    const n = Number(a);
    if (Number.isNaN(n)) {
      throw new Error(`${opName}: argument '${String(a)}' is not a number`);
    }
    return n;
  });
}
function requireArity(args, expected, opName) {
  if (args.length !== expected) {
    throw new Error(
      `${opName}: expected ${expected} argument(s), got ${args.length}`
    );
  }
}
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
  return args.map(String).join("");
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
    (ch) => ch.toUpperCase()
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
registerFormulaOperation("countChildren", (args) => {
  requireArity(args, 1, "countChildren");
  return coerceNumbers(args, "countChildren")[0];
});
function navigatePlainNode(root, segments) {
  let current = [{ node: root, parents: [] }];
  for (const seg of segments) {
    const next = [];
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
              parents: [...parents, node]
            });
          }
        }
        continue;
      }
      if (isPlainRecord(node) && seg in node && seg !== "$tag") {
        next.push({
          node: node[seg],
          parents: [...parents, node]
        });
      } else if (isPlainList(node)) {
        const idx = Number(seg);
        if (!Number.isNaN(idx) && idx >= 0 && idx < node.$items.length) {
          next.push({
            node: node.$items[idx],
            parents: [...parents, node]
          });
        }
      }
    }
    current = next;
  }
  return current.map((e) => e.node);
}
function parseRefPath(refPath) {
  const cleaned = refPath.startsWith("/") ? refPath.slice(1) : refPath;
  if (cleaned === "") return [];
  return cleaned.split("/");
}
function resolveRefPath(refPath, root, formulaPath) {
  if (refPath.startsWith("/")) {
    return navigatePlainNode(root, parseRefPath(refPath));
  }
  const formulaSegments = formulaPath === "" ? [] : formulaPath.split("/");
  const refSegments = parseRefPath(refPath);
  const combined = [...formulaSegments, ...refSegments];
  const resolved = [];
  for (const seg of combined) {
    if (seg === "..") {
      resolved.pop();
    } else {
      resolved.push(seg);
    }
  }
  return navigatePlainNode(root, resolved);
}
var MAX_DEPTH = 100;
function evaluateFormulaNode(formula, root, formulaPath, visiting = /* @__PURE__ */ new Set(), depth = 0) {
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
    depth
  );
  visiting.delete(formulaPath);
  return result;
}
function evaluateFormulaInner(formula, root, formulaPath, visiting, depth) {
  const opName = formula.operation;
  if (typeof opName !== "string") {
    return new FormulaError("formula missing 'operation' field");
  }
  const argsField = formula.args;
  let argNodes;
  if (argsField === void 0) {
    argNodes = [];
  } else if (isPlainList(argsField)) {
    argNodes = argsField.$items;
  } else {
    return new FormulaError("formula 'args' must be a list node");
  }
  const resolvedArgs = [];
  for (const argNode of argNodes) {
    const result = resolveArgument(
      argNode,
      root,
      formulaPath,
      opName,
      visiting,
      depth
    );
    if (result instanceof FormulaError) return result;
    for (const v of result) {
      resolvedArgs.push(v);
    }
  }
  const op = lookupOperation(opName);
  if (!op) {
    return new FormulaError(`unknown operation '${opName}'`);
  }
  try {
    return op(resolvedArgs);
  } catch (err) {
    return new FormulaError(
      err instanceof Error ? err.message : String(err)
    );
  }
}
function resolveArgument(argNode, root, formulaPath, opName, visiting, depth) {
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
      depth
    );
  }
  if (isFormulaNode(argNode)) {
    const nestedPath = formulaPath + "/$nested";
    const result = evaluateFormulaNode(
      argNode,
      root,
      nestedPath,
      visiting,
      depth + 1
    );
    if (result instanceof FormulaError) return result;
    return [result];
  }
  if (isPlainList(argNode)) {
    if (opName === "countChildren") {
      return [argNode.$items.length];
    }
    return new FormulaError("cannot use list node as formula argument");
  }
  return new FormulaError("unsupported argument type");
}
function resolveRefArgument(ref, root, formulaPath, opName, visiting, depth) {
  const targets = resolveRefPath(ref.$ref, root, formulaPath);
  if (targets.length === 0) {
    return new FormulaError(`reference '${ref.$ref}' not found`);
  }
  if (opName === "countChildren") {
    if (targets.length === 1 && isPlainList(targets[0])) {
      return [targets[0].$items.length];
    }
    return [targets.length];
  }
  const values = [];
  for (const target of targets) {
    if (isFormulaNode(target)) {
      const targetPath = computeTargetPath(ref.$ref, formulaPath);
      const result = evaluateFormulaNode(
        target,
        root,
        targetPath,
        visiting,
        depth + 1
      );
      if (result instanceof FormulaError) return result;
      values.push(result);
    } else if (isPrimitive(target)) {
      values.push(target);
    } else if (isPlainList(target)) {
      for (const item of target.$items) {
        if (isPrimitive(item)) {
          values.push(item);
        } else {
          return new FormulaError(
            `reference '${ref.$ref}' resolved to non-primitive list item`
          );
        }
      }
    } else {
      return new FormulaError(
        `reference '${ref.$ref}' resolved to non-primitive value`
      );
    }
  }
  return values;
}
function computeTargetPath(refPath, formulaPath) {
  if (refPath.startsWith("/")) {
    const cleaned = refPath.startsWith("/") ? refPath.slice(1) : refPath;
    return cleaned;
  }
  const formulaSegments = formulaPath === "" ? [] : formulaPath.split("/");
  const refSegments = parseRefPath(refPath);
  const combined = [...formulaSegments, ...refSegments];
  const resolved = [];
  for (const seg of combined) {
    if (seg === "..") {
      resolved.pop();
    } else {
      resolved.push(seg);
    }
  }
  return resolved.join("/");
}
function evaluateAllFormulas(doc) {
  const results = /* @__PURE__ */ new Map();
  const visiting = /* @__PURE__ */ new Set();
  function walk(node, path) {
    if (isPrimitive(node) || isPlainRef(node)) return;
    if (isFormulaNode(node)) {
      if (!results.has(path)) {
        results.set(
          path,
          evaluateFormulaNode(node, doc, path, visiting, 0)
        );
      }
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
          path === "" ? key : `${path}/${key}`
        );
      }
    }
  }
  walk(doc, "");
  return results;
}

// core/denicek.ts
var Denicek = class {
  /** Stable identifier of the local peer that produces events. */
  peer;
  graph;
  pendingEvents = [];
  cachedDoc = null;
  undoStack = [];
  redoStack = [];
  isUndoRedoCommit = false;
  constructor(peer, arg) {
    validatePeerId(peer);
    this.peer = peer;
    this.graph = new EventGraph(Node.fromPlain(arg ?? { $tag: "root" }));
  }
  /** Registers a named primitive edit implementation used by local and remote replay. */
  static registerPrimitiveEdit(name, implementation) {
    registerPrimitiveEdit(name, implementation);
  }
  /**
   * Applies a validated local edit, records the resulting event, and returns its id.
   *
   * The returned string is the formatted stable event identifier (`${peer}:${seq}`)
   * assigned to the newly created local event. It can later be passed to
   * {@link replayEditFromEventId}, {@link repeatEditFromEventId}, or persisted
   * in application data.
   */
  commit(edit) {
    const doc = this.cachedDoc ?? this.rematerialize();
    try {
      edit.apply(doc);
      const event = this.graph.createEvent(this.peer, edit);
      this.pendingEvents.push(event);
      if (!this.isUndoRedoCommit) {
        this.undoStack.push(event.id.format());
        this.redoStack = [];
      }
      this.cachedDoc = doc;
      return event.id.format();
    } catch (e) {
      this.cachedDoc = null;
      throw e;
    }
  }
  /** Whether there is a local edit that can be undone. */
  get canUndo() {
    return this.undoStack.length > 0;
  }
  /** Whether a previously undone edit can be redone. */
  get canRedo() {
    return this.redoStack.length > 0;
  }
  /**
   * Undoes the most recent local edit by appending its inverse to the DAG.
   *
   * The inverse is computed against the document state just before the
   * original edit was applied (materialized at the event's parent frontier).
   * The resulting inverse event is a regular DAG event, so remote peers
   * converge on the same undone state automatically.
   *
   * Returns the formatted event id of the newly created inverse event.
   */
  undo() {
    if (this.undoStack.length === 0) {
      throw new Error("Nothing to undo.");
    }
    const eventId = this.undoStack.pop();
    const event = this.graph.getEvent(eventId);
    if (event === void 0) {
      throw new Error(`Cannot undo unknown event '${eventId}'.`);
    }
    const { doc: preDoc } = this.graph.materialize(event.parents);
    const inverseEdit = event.edit.computeInverse(preDoc);
    this.isUndoRedoCommit = true;
    try {
      const inverseEventId = this.commit(inverseEdit);
      this.redoStack.push(eventId);
      return inverseEventId;
    } finally {
      this.isUndoRedoCommit = false;
    }
  }
  /**
   * Redoes the most recently undone edit by replaying it from the event DAG.
   *
   * Returns the formatted event id of the newly created redo event.
   */
  redo() {
    if (this.redoStack.length === 0) {
      throw new Error("Nothing to redo.");
    }
    const eventId = this.redoStack.pop();
    const event = this.graph.getEvent(eventId);
    if (event === void 0) {
      throw new Error(`Cannot redo unknown event '${eventId}'.`);
    }
    this.isUndoRedoCommit = true;
    try {
      const redoEventId = this.commit(event.edit);
      this.undoStack.push(eventId);
      return redoEventId;
    } finally {
      this.isUndoRedoCommit = false;
    }
  }
  /** Returns and clears opaque event payloads produced by local edits since the last drain. */
  drain() {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events.map(encodeRemoteEvent);
  }
  /** Returns the current frontier as formatted event id strings. */
  get frontiers() {
    return this.graph.frontiers.map((eventId) => eventId.format());
  }
  /** Returns opaque event payloads unknown to a peer with the given frontier strings. */
  eventsSince(remoteFrontiers) {
    return this.graph.eventsSince(
      remoteFrontiers.map((frontier) => EventId.parse(frontier))
    ).map(encodeRemoteEvent);
  }
  /** Ingests an opaque event payload produced by another peer. Buffers out-of-order events. */
  applyRemote(event) {
    this.graph.ingestEvents([decodeRemoteEvent(event)]);
    this.cachedDoc = null;
  }
  /**
   * Adds a named field to every record matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  add(target, field, value) {
    validateFieldName(field);
    this.validateLocalAddTarget(target, field);
    const path = target === "" ? field : `${target}/${field}`;
    return this.commit(
      new RecordAddEdit(Selector.parse(path), Node.fromPlain(value))
    );
  }
  /**
   * Deletes a named field from every record matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  delete(target, field) {
    validateFieldName(field);
    const path = target === "" ? field : `${target}/${field}`;
    return this.commit(new RecordDeleteEdit(Selector.parse(path)));
  }
  /**
   * Renames a field on every record matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  rename(target, from, to) {
    validateFieldName(from);
    validateFieldName(to);
    this.validateLocalRenameTarget(target, from, to);
    const path = target === "" ? from : `${target}/${from}`;
    return this.commit(new RecordRenameFieldEdit(Selector.parse(path), to));
  }
  /**
   * Replaces every primitive node matched by `target` with `value`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  set(target, value) {
    return this.commit(
      new ApplyPrimitiveEdit(Selector.parse(target), "set", [value])
    );
  }
  /**
   * Returns the plain nodes matched by `target` in the current materialized document.
   *
   * Missing paths return an empty array, while wildcard selectors naturally return
   * multiple concrete matches. Callers can pick one match or iterate all of them
   * without converting the whole document to plain first.
   */
  get(target) {
    const doc = this.cachedDoc ?? this.rematerialize();
    this.cachedDoc = doc;
    return doc.navigate(Selector.parse(target)).map(
      (node) => node.toPlain()
    );
  }
  /**
   * Applies a registered named primitive edit to every primitive node matched by `target`.
   * Additional primitive arguments are serialized with the event and passed back
   * to the registered implementation during replay.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  applyPrimitiveEdit(target, editName, ...args) {
    return this.commit(
      new ApplyPrimitiveEdit(Selector.parse(target), editName, args)
    );
  }
  /**
   * Replays the edit carried by an existing event onto a different target.
   *
   * This is the explicit retargeting variant: callers choose both the source
   * event id and the new target selector. It reuses the stored edit through
   * `Edit.withTarget(...)`, so callers should use it only when replaying that
   * edit against a different selector is the behavior they want and the new
   * selector is compatible with that edit kind. In practice that means the
   * target must resolve to the same kind of nodes the original edit expects,
   * such as replaying a primitive edit onto primitive nodes or a list edit
   * onto list nodes. Use {@link repeatEditFromEventId} when you want the same
   * event to follow later wraps, renames, or reindexing automatically instead
   * of choosing a new selector yourself.
   * Returns the formatted id (`${peer}:${seq}`) of the newly recorded replay event.
   */
  replayEditFromEventId(eventId, target) {
    const edit = this.resolveReplaySourceEdit(eventId);
    return this.commit(edit.withTarget(Selector.parse(target)));
  }
  /**
   * Replays the edit carried by an existing event at its original target.
   *
   * This is the simplest replay path when the caller wants to repeat the
   * recorded edit semantics without choosing a new selector manually. Unlike
   * {@link replayEditFromEventId}, this keeps the source event's own selector
   * intent and retargets it through later structural history before replaying.
   * Returns the formatted id (`${peer}:${seq}`) of the newly recorded replay event.
   */
  repeatEditFromEventId(eventId) {
    return this.commit(this.resolveReplaySourceEdit(eventId));
  }
  /**
   * Repeats every recorded step stored in the matched replay-step lists.
   *
   * Each matched node must be a list whose items are records containing a string
   * `eventId` field. Steps are read in list order and replayed through the same
   * repeat-edit semantics as {@link repeatEditFromEventId}.
   *
   * All source edits are resolved before any are committed, so multi-step
   * structural recipes (such as wrap + rename + add) replay correctly: each
   * step's selector is retargeted through the graph's structural history
   * without being affected by the other replayed steps in the batch.
   *
   * Returns the formatted ids of the newly recorded replay events.
   */
  repeatEditsFrom(target) {
    const edits = this.collectRepeatEditEventIds(target).map(
      (eventId) => this.resolveReplaySourceEdit(eventId)
    );
    return edits.map((edit) => this.commit(edit));
  }
  /**
   * Appends `value` to every list matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  pushBack(target, value) {
    return this.commit(
      new ListPushBackEdit(Selector.parse(target), Node.fromPlain(value))
    );
  }
  /**
   * Prepends `value` to every list matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  pushFront(target, value) {
    return this.commit(
      new ListPushFrontEdit(Selector.parse(target), Node.fromPlain(value))
    );
  }
  /**
   * Removes the last item from every list matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  popBack(target) {
    return this.commit(new ListPopBackEdit(Selector.parse(target)));
  }
  /**
   * Removes the first item from every list matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  popFront(target) {
    return this.commit(new ListPopFrontEdit(Selector.parse(target)));
  }
  /**
   * Updates the structural tag on every matched record or list node.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  updateTag(target, tag) {
    return this.commit(new UpdateTagEdit(Selector.parse(target), tag));
  }
  /**
   * Wraps every node matched by `target` in a record with the given field and tag.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  wrapRecord(target, field, tag) {
    validateFieldName(field);
    return this.commit(new WrapRecordEdit(Selector.parse(target), field, tag));
  }
  /**
   * Wraps every node matched by `target` in a single-item list with the given tag.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  wrapList(target, tag) {
    return this.commit(new WrapListEdit(Selector.parse(target), tag));
  }
  /**
   * Copies nodes from `source` into `target` following the package copy semantics.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  copy(target, source) {
    return this.commit(
      new CopyEdit(Selector.parse(target), Selector.parse(source))
    );
  }
  /** Materializes the current document into a plain serializable tree. */
  materialize() {
    if (this.cachedDoc !== null) return this.cachedDoc.toPlain();
    const doc = this.rematerialize();
    this.cachedDoc = doc;
    return doc.toPlain();
  }
  /** Returns the plain conflict nodes produced during the last materialization. */
  get conflicts() {
    return this.lastConflicts.map(
      (conflict) => conflict.toPlain()
    );
  }
  lastConflicts = [];
  /** Rebuilds the internal mutable document tree and refreshes cached conflicts. */
  rematerialize() {
    const { doc, conflicts } = this.graph.materialize();
    this.lastConflicts = conflicts;
    return doc;
  }
  /**
   * Compacts the event graph after the caller confirms the current globally
   * acknowledged frontier set. This refuses stale frontiers and buffered events.
   */
  compact(acknowledgedFrontiers) {
    if (!Array.isArray(acknowledgedFrontiers)) {
      throw new Error(
        "Compaction frontiers must be provided as an array of event ids."
      );
    }
    if (acknowledgedFrontiers.some((frontier) => typeof frontier !== "string")) {
      throw new Error(
        "Compaction frontiers must only contain event id strings."
      );
    }
    this.graph.compact(
      acknowledgedFrontiers.map((frontier) => EventId.parse(frontier))
    );
    this.cachedDoc = null;
  }
  /** Returns the current document as a plain serializable tree. */
  toPlain() {
    return this.materialize();
  }
  /** Returns a serializable snapshot of all known events for UI inspection. */
  inspectEvents() {
    return this.graph.snapshotEvents();
  }
  /** Resolves and validates an event id before replaying its retargeted edit payload. */
  resolveReplaySourceEdit(eventId) {
    return this.graph.resolveReplayEdit(EventId.parse(eventId).format());
  }
  /** Collects replayable event ids from step lists without materializing the whole document to plain. */
  collectRepeatEditEventIds(target) {
    const doc = this.cachedDoc ?? this.rematerialize();
    this.cachedDoc = doc;
    const matchedNodes = doc.navigate(Selector.parse(target));
    if (matchedNodes.length === 0) return [];
    const eventIds = [];
    for (const node of matchedNodes) {
      if (!(node instanceof ListNode)) {
        throw new Error(
          `repeatEditsFrom expects list nodes at '${target}', found '${node.constructor.name}'.`
        );
      }
      for (const stepNode of node.items) {
        eventIds.push(this.readRepeatEditEventId(stepNode, target));
      }
    }
    return eventIds;
  }
  /** Reads a single repeat-edit step record and validates that it carries a string event id. */
  readRepeatEditEventId(stepNode, target) {
    if (!(stepNode instanceof RecordNode)) {
      throw new Error(
        `repeatEditsFrom expects replay-step records in '${target}', found '${stepNode.constructor.name}'.`
      );
    }
    const eventIdNode = stepNode.fields.eventId;
    if (!(eventIdNode instanceof PrimitiveNode) || typeof eventIdNode.value !== "string") {
      throw new Error(
        `repeatEditsFrom expects each step in '${target}' to contain a string eventId field.`
      );
    }
    return eventIdNode.value;
  }
  /** Rejects local adds that would overwrite an existing record field. */
  validateLocalAddTarget(target, field) {
    const doc = this.cachedDoc ?? this.rematerialize();
    this.cachedDoc = doc;
    for (const node of doc.navigate(Selector.parse(target))) {
      if (node instanceof RecordNode && field in node.fields) {
        throw new Error(
          `Cannot add field '${field}' because it already exists at '${target || "/"}'.`
        );
      }
    }
  }
  /**
   * Evaluates all formula nodes in the current document and returns their results.
   *
   * Formula nodes are tagged records whose `$tag` starts with `"x-formula"`.
   * Results are returned as a map from formula path to computed value or error.
   */
  evaluateFormulas() {
    return evaluateAllFormulas(this.materialize());
  }
  /**
   * Evaluates all formula nodes and writes their results back into the document.
   *
   * For each formula that evaluates to a primitive value (not an error), this
   * sets the `result` field on the formula record. Formula errors are skipped.
   * Returns the evaluation results map for inspection.
   */
  recomputeFormulas() {
    const results = this.evaluateFormulas();
    for (const [path, result] of results) {
      if (!(result instanceof FormulaError)) {
        try {
          this.set(`${path}/result`, result);
        } catch {
        }
      }
    }
    return results;
  }
  /** Rejects local renames that would overwrite an existing sibling field. */
  validateLocalRenameTarget(target, from, to) {
    if (from === to) return;
    const doc = this.cachedDoc ?? this.rematerialize();
    this.cachedDoc = doc;
    for (const node of doc.navigate(Selector.parse(target))) {
      if (node instanceof RecordNode && from in node.fields && to in node.fields) {
        throw new Error(
          `Cannot rename field '${from}' to '${to}' at '${target || "/"}' because '${to}' already exists.`
        );
      }
    }
  }
};

// core/document-adapter.ts
var METADATA_FIELDS = /* @__PURE__ */ new Set(["$tag", "$id", "$kind", "$order"]);
function isPlainRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "$tag" in value && !("$ref" in value) && !("$items" in value);
}
var DocumentAdapter = class {
  denicek;
  nodeIndex = /* @__PURE__ */ new Map();
  childIndex = /* @__PURE__ */ new Map();
  parentIndex = /* @__PURE__ */ new Map();
  pathIndex = /* @__PURE__ */ new Map();
  idByPath = /* @__PURE__ */ new Map();
  rootId = null;
  _version = 0;
  listeners = /* @__PURE__ */ new Set();
  constructor(peer, initializer) {
    this.denicek = new Denicek(peer);
    if (initializer) {
      initializer(this);
    }
    this.rebuildIndexes();
  }
  // ── Read API ────────────────────────────────────────────────────
  /** Returns the {@link NodeData} for the given ID, or `null` if absent. */
  getNode(id) {
    return this.nodeIndex.get(id) ?? null;
  }
  /** Returns ordered child IDs of the given parent, or an empty array. */
  getChildIds(parentId) {
    return this.childIndex.get(parentId) ?? [];
  }
  /** Returns the parent ID of the given node, or `null` for the root. */
  getParentId(nodeId) {
    return this.parentIndex.get(nodeId) ?? null;
  }
  /** Returns the root node ID, or `null` if no root has been created. */
  getRootId() {
    return this.rootId;
  }
  /** Returns a snapshot of every indexed node keyed by ID. */
  getAllNodes() {
    const result = {};
    for (const [id, data] of this.nodeIndex) {
      result[id] = data;
    }
    return result;
  }
  /** Monotonically-increasing version counter bumped on every mutation. */
  get currentVersion() {
    return this._version;
  }
  // ── Mutation API ────────────────────────────────────────────────
  /** Creates the root element node and returns its ID. */
  createRootNode(tag) {
    const id = crypto.randomUUID();
    const record = {
      $tag: tag,
      $id: id,
      $kind: "element",
      $order: ""
    };
    this.denicek.add("", "root", record);
    this.notifyAfterMutation();
    return id;
  }
  /**
   * Adds children to a parent element at an optional index.
   * Returns the IDs of the newly created child nodes.
   */
  addChildren(parentId, children, startIndex) {
    const parentPath = this.requirePath(parentId);
    const newIds = [];
    for (const input of children) {
      const id = crypto.randomUUID();
      const record = this.buildPlainRecord(input, id);
      this.denicek.add(parentPath, id, record);
      newIds.push(id);
    }
    this.insertIntoOrder(parentPath, newIds, startIndex);
    this.notifyAfterMutation();
    return newIds;
  }
  /** Deletes the given nodes from their parents. */
  deleteNodes(nodeIds) {
    for (const id of nodeIds) {
      const parentId = this.parentIndex.get(id);
      if (parentId == null) continue;
      const parentPath = this.pathIndex.get(parentId);
      if (parentPath == null) continue;
      this.denicek.delete(parentPath, id);
      this.removeFromOrder(parentPath, id);
    }
    this.notifyAfterMutation();
  }
  /** Moves nodes to a new parent at an optional index. */
  moveNodes(nodeIds, newParentId, index) {
    for (const id of nodeIds) {
      const oldParentId = this.parentIndex.get(id);
      if (oldParentId == null) continue;
      const oldParentPath = this.pathIndex.get(oldParentId);
      if (oldParentPath == null) continue;
      const subtreePlain = this.denicek.get(
        oldParentPath + "/" + id
      )[0];
      this.denicek.delete(oldParentPath, id);
      this.removeFromOrder(oldParentPath, id);
      const newParentPath2 = this.requirePath(newParentId);
      this.denicek.add(newParentPath2, id, subtreePlain);
    }
    const newParentPath = this.requirePath(newParentId);
    this.insertIntoOrder(newParentPath, nodeIds, index);
    this.notifyAfterMutation();
  }
  /** Sets or deletes an attribute on the given nodes. Pass `undefined` to delete. */
  updateAttribute(nodeIds, key, value) {
    for (const id of nodeIds) {
      const path = this.requirePath(id);
      if (value === void 0) {
        this.denicek.delete(path, key);
      } else {
        const existing = this.denicek.get(path + "/" + key);
        if (existing.length > 0) {
          this.denicek.set(
            path + "/" + key,
            value
          );
        } else {
          this.denicek.add(
            path,
            key,
            value
          );
        }
      }
    }
    this.notifyAfterMutation();
  }
  /** Updates the tag on the given element nodes. */
  updateTag(nodeIds, newTag) {
    for (const id of nodeIds) {
      const path = this.requirePath(id);
      this.denicek.set(path + "/$tag", newTag);
    }
    this.notifyAfterMutation();
  }
  /**
   * Replaces a value node's content. The `oldValue` parameter is kept for
   * API compatibility but the adapter always overwrites with `newValue`.
   */
  updateValue(nodeIds, _oldValue, newValue) {
    for (const id of nodeIds) {
      const path = this.requirePath(id);
      this.denicek.set(path + "/value", newValue);
    }
    this.notifyAfterMutation();
  }
  /** Updates the operation field on a formula node. */
  updateFormulaOperation(id, operation) {
    const path = this.requirePath(id);
    this.denicek.set(path + "/operation", operation);
    this.notifyAfterMutation();
  }
  /** Updates the target field on a ref node. */
  updateRefTarget(id, target) {
    const path = this.requirePath(id);
    this.denicek.set(path + "/target", target);
    this.notifyAfterMutation();
  }
  // ── Undo / Redo ─────────────────────────────────────────────────
  /** Undoes the last local edit. Returns `true` if an undo was performed. */
  undo() {
    if (!this.denicek.canUndo) return false;
    this.denicek.undo();
    this.notifyAfterMutation();
    return true;
  }
  /** Redoes the last undone edit. Returns `true` if a redo was performed. */
  redo() {
    if (!this.denicek.canRedo) return false;
    this.denicek.redo();
    this.notifyAfterMutation();
    return true;
  }
  /** Whether there is a local edit that can be undone. */
  get canUndo() {
    return this.denicek.canUndo;
  }
  /** Whether a previously undone edit can be redone. */
  get canRedo() {
    return this.denicek.canRedo;
  }
  // ── Subscription ────────────────────────────────────────────────
  /** Registers a listener called after every mutation. Returns an unsubscribe function. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  // ── Sync ────────────────────────────────────────────────────────
  /** Drains pending local events for replication. */
  drain() {
    return this.denicek.drain();
  }
  /** Ingests a remote event and rebuilds indexes. */
  applyRemote(event) {
    this.denicek.applyRemote(event);
    this.notifyAfterMutation();
  }
  /** Current causal frontier as formatted event-id strings. */
  get frontiers() {
    return this.denicek.frontiers;
  }
  /** Returns events unknown to a peer with the given frontiers. */
  eventsSince(remoteFrontiers) {
    return this.denicek.eventsSince(remoteFrontiers);
  }
  // ── Advanced access ─────────────────────────────────────────────
  /** Exposes the underlying {@link Denicek} instance for advanced operations. */
  get denicekInstance() {
    return this.denicek;
  }
  // ── Private helpers ─────────────────────────────────────────────
  /**
   * Materializes the Denicek document and walks the tree to rebuild every
   * lookup index (nodeIndex, childIndex, parentIndex, pathIndex, idByPath).
   */
  rebuildIndexes() {
    this.nodeIndex.clear();
    this.childIndex.clear();
    this.parentIndex.clear();
    this.pathIndex.clear();
    this.idByPath.clear();
    this.rootId = null;
    const doc = this.denicek.materialize();
    if (!isPlainRecord2(doc)) return;
    const rootNode = doc["root"];
    if (rootNode === void 0 || !isPlainRecord2(rootNode)) return;
    this.indexRecord(rootNode, "root", null);
  }
  /** Recursively indexes a PlainRecord node and its children. */
  indexRecord(record, selectorPath, parentId) {
    const id = record["$id"];
    if (id === void 0) return;
    const kind = record["$kind"];
    if (kind === void 0) return;
    this.pathIndex.set(id, selectorPath);
    this.idByPath.set(selectorPath, id);
    this.parentIndex.set(id, parentId);
    if (parentId === null) {
      this.rootId = id;
    }
    switch (kind) {
      case "element":
        this.indexElementNode(record, id, selectorPath);
        break;
      case "value":
        this.nodeIndex.set(id, {
          id,
          kind: "value",
          value: record["value"]
        });
        break;
      case "action":
        this.nodeIndex.set(id, {
          id,
          kind: "action",
          label: record["label"],
          actions: record["actions"],
          target: record["target"],
          ...record["replayMode"] !== void 0 ? { replayMode: record["replayMode"] } : {}
        });
        break;
      case "ref":
        this.nodeIndex.set(id, {
          id,
          kind: "ref",
          target: record["target"]
        });
        break;
      case "formula":
        this.nodeIndex.set(id, {
          id,
          kind: "formula",
          operation: record["operation"]
        });
        break;
    }
  }
  /** Indexes an element node: extracts attrs, discovers children via $order. */
  indexElementNode(record, id, selectorPath) {
    const attrs = {};
    const childIds = [];
    const orderStr = record["$order"];
    const orderedIds = orderStr ? orderStr.split(",").filter((s) => s.length > 0) : [];
    const childRecords = /* @__PURE__ */ new Map();
    for (const key of Object.keys(record)) {
      if (METADATA_FIELDS.has(key)) continue;
      const value = record[key];
      if (isPlainRecord2(value)) {
        childRecords.set(key, value);
      } else {
        attrs[key] = value;
      }
    }
    for (const childKey of orderedIds) {
      const childRecord = childRecords.get(childKey);
      if (childRecord) {
        childIds.push(childKey);
        this.indexRecord(childRecord, selectorPath + "/" + childKey, id);
      }
    }
    for (const [childKey, childRecord] of childRecords) {
      if (!orderedIds.includes(childKey)) {
        childIds.push(childKey);
        this.indexRecord(childRecord, selectorPath + "/" + childKey, id);
      }
    }
    this.nodeIndex.set(id, {
      id,
      kind: "element",
      tag: record["$tag"],
      attrs
    });
    this.childIndex.set(id, childIds);
  }
  /** Converts a {@link NodeInput} into a {@link PlainRecord} for the Denicek. */
  buildPlainRecord(input, id) {
    switch (input.kind) {
      case "element": {
        const record = {
          $tag: input.tag,
          $id: id,
          $kind: "element",
          $order: ""
        };
        if (input.attrs) {
          for (const [key, value] of Object.entries(input.attrs)) {
            record[key] = value;
          }
        }
        if (input.children && input.children.length > 0) {
          const childIds = [];
          for (const child of input.children) {
            const childId = crypto.randomUUID();
            childIds.push(childId);
            record[childId] = this.buildPlainRecord(child, childId);
          }
          record["$order"] = childIds.join(",");
        }
        return record;
      }
      case "value":
        return {
          $tag: "$value",
          $id: id,
          $kind: "value",
          value: input.value
        };
      case "action": {
        const rec = {
          $tag: "$action",
          $id: id,
          $kind: "action",
          label: input.label,
          actions: input.actions,
          target: input.target
        };
        if (input.replayMode !== void 0) {
          rec["replayMode"] = input.replayMode;
        }
        return rec;
      }
      case "ref":
        return {
          $tag: "$ref",
          $id: id,
          $kind: "ref",
          target: input.target
        };
      case "formula":
        return {
          $tag: "$formula",
          $id: id,
          $kind: "formula",
          operation: input.operation
        };
    }
  }
  /** Returns the selector path for the given node ID, throwing if not found. */
  requirePath(id) {
    const path = this.pathIndex.get(id);
    if (path === void 0) {
      throw new Error(`Node not found: ${id}`);
    }
    return path;
  }
  /** Reads the current $order value from a parent path. */
  readOrder(parentPath) {
    const values = this.denicek.get(parentPath + "/$order");
    const orderStr = values.length > 0 ? String(values[0]) : "";
    return orderStr.length > 0 ? orderStr.split(",") : [];
  }
  /** Inserts new IDs into a parent's $order at the specified index. */
  insertIntoOrder(parentPath, newIds, startIndex) {
    const order = this.readOrder(parentPath);
    const idx = startIndex !== void 0 ? Math.min(startIndex, order.length) : order.length;
    order.splice(idx, 0, ...newIds);
    this.denicek.set(parentPath + "/$order", order.join(","));
  }
  /** Removes an ID from a parent's $order. */
  removeFromOrder(parentPath, childId) {
    const order = this.readOrder(parentPath);
    const filtered = order.filter((id) => id !== childId);
    this.denicek.set(parentPath + "/$order", filtered.join(","));
  }
  /** Increments version, rebuilds indexes, and notifies all listeners. */
  notifyAfterMutation() {
    this._version++;
    this.rebuildIndexes();
    for (const listener of this.listeners) {
      listener();
    }
  }
};
export {
  Denicek,
  DocumentAdapter,
  FormulaError,
  evaluateAllFormulas,
  evaluateFormulaNode,
  registerFormulaOperation,
  registerPrimitiveEdit
};
