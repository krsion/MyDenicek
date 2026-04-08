import { Denicek } from "./denicek.ts";
import type { PlainNode, PlainRecord } from "./nodes/plain.ts";
import type { EncodedRemoteEvent } from "./remote-events.ts";

// ── Node data types ─────────────────────────────────────────────────

/** An element node with a tag, optional attributes, and ordered children. */
export interface ElementNodeData {
  /** Stable unique identifier for this node. */
  id: string;
  /** Discriminator tag identifying this as an element node. */
  kind: "element";
  /** The structural tag name (e.g. "div", "p"). */
  tag: string;
  /** Key–value attributes attached to this element. */
  attrs: Record<string, unknown>;
}

/** A leaf value node holding a string or number. */
export interface ValueNodeData {
  /** Stable unique identifier for this node. */
  id: string;
  /** Discriminator tag identifying this as a value node. */
  kind: "value";
  /** The primitive content of this leaf. */
  value: string | number;
}

/** An action node describing a replayable operation. */
export interface ActionNodeData {
  /** Stable unique identifier for this node. */
  id: string;
  /** Discriminator tag identifying this as an action node. */
  kind: "action";
  /** Human-readable label for the action button. */
  label: string;
  /** JSON-serialised array of GeneralizedPatch objects. */
  actions: string;
  /** Node ID that acts as `$0` during replay. */
  target: string;
  /** Whether replay binds to the fixed target or the current selection. */
  replayMode?: "fixed" | "selected";
}

/** A reference node pointing at another node by ID. */
export interface RefNodeData {
  /** Stable unique identifier for this node. */
  id: string;
  /** Discriminator tag identifying this as a ref node. */
  kind: "ref";
  /** ID of the referenced node. */
  target: string;
}

/** A formula node that computes a derived value. */
export interface FormulaNodeData {
  /** Stable unique identifier for this node. */
  id: string;
  /** Discriminator tag identifying this as a formula node. */
  kind: "formula";
  /** The operation name (e.g. "SUM", "COUNT"). */
  operation: string;
}

/** Discriminated union of every node variant the adapter exposes. */
export type NodeData =
  | ElementNodeData
  | ValueNodeData
  | ActionNodeData
  | RefNodeData
  | FormulaNodeData;

/** Input shape accepted by {@link DocumentAdapter.addChildren}. */
export type NodeInput =
  | {
    kind: "element";
    tag: string;
    attrs?: Record<string, unknown>;
    children?: NodeInput[];
  }
  | { kind: "value"; value: string }
  | {
    kind: "action";
    label: string;
    actions: string;
    target: string;
    replayMode?: "fixed" | "selected";
  }
  | { kind: "ref"; target: string }
  | { kind: "formula"; operation: string };

// ── Metadata field helpers ──────────────────────────────────────────

const METADATA_FIELDS = new Set(["$tag", "$id", "$kind", "$order"]);

function isPlainRecord(value: PlainNode): value is PlainRecord {
  return typeof value === "object" && value !== null &&
    !Array.isArray(value) && "$tag" in value && !("$ref" in value) &&
    !("$items" in value);
}

// ── DocumentAdapter ─────────────────────────────────────────────────

/**
 * Bridges the selector-based {@link Denicek} CRDT and a DenicekDocument-
 * compatible ID-based tree API expected by the MyDenicek web app.
 *
 * Every mutation delegates to the underlying Denicek instance (preserving
 * full OT / causal semantics) then rebuilds lightweight indexes so that
 * read queries resolve by stable node ID rather than positional selector.
 */
export class DocumentAdapter {
  private denicek: Denicek;
  private nodeIndex: Map<string, NodeData> = new Map();
  private childIndex: Map<string, string[]> = new Map();
  private parentIndex: Map<string, string | null> = new Map();
  private pathIndex: Map<string, string> = new Map();
  private idByPath: Map<string, string> = new Map();
  private rootId: string | null = null;
  private _version = 0;
  private listeners: Set<() => void> = new Set();

  /** Creates a new adapter for the given peer, optionally seeding initial state. */
  constructor(peer: string, initializer?: (adapter: DocumentAdapter) => void) {
    this.denicek = new Denicek(peer);
    if (initializer) {
      initializer(this);
    }
    this.rebuildIndexes();
  }

  // ── Read API ────────────────────────────────────────────────────

  /** Returns the {@link NodeData} for the given ID, or `null` if absent. */
  getNode(id: string): NodeData | null {
    return this.nodeIndex.get(id) ?? null;
  }

  /** Returns ordered child IDs of the given parent, or an empty array. */
  getChildIds(parentId: string): string[] {
    return this.childIndex.get(parentId) ?? [];
  }

  /** Returns the parent ID of the given node, or `null` for the root. */
  getParentId(nodeId: string): string | null {
    return this.parentIndex.get(nodeId) ?? null;
  }

  /** Returns the root node ID, or `null` if no root has been created. */
  getRootId(): string | null {
    return this.rootId;
  }

  /** Returns a snapshot of every indexed node keyed by ID. */
  getAllNodes(): Record<string, NodeData> {
    const result: Record<string, NodeData> = {};
    for (const [id, data] of this.nodeIndex) {
      result[id] = data;
    }
    return result;
  }

  /** Monotonically-increasing version counter bumped on every mutation. */
  get currentVersion(): number {
    return this._version;
  }

  // ── Mutation API ────────────────────────────────────────────────

  /** Creates the root element node and returns its ID. */
  createRootNode(tag: string): string {
    const id = crypto.randomUUID();
    const record: PlainRecord = {
      $tag: tag,
      $id: id,
      $kind: "element",
      $order: "",
    };
    this.denicek.add("", "root", record);
    this.notifyAfterMutation();
    return id;
  }

  /**
   * Adds children to a parent element at an optional index.
   * Returns the IDs of the newly created child nodes.
   */
  addChildren(
    parentId: string,
    children: NodeInput[],
    startIndex?: number,
  ): string[] {
    const parentPath = this.requirePath(parentId);
    const newIds: string[] = [];

    for (const input of children) {
      const id = crypto.randomUUID();
      const record = this.buildPlainRecord(input, id);
      this.denicek.add(parentPath, id, record);
      newIds.push(id);
    }

    // Update $order on the parent
    this.insertIntoOrder(parentPath, newIds, startIndex);
    this.notifyAfterMutation();
    return newIds;
  }

  /** Deletes the given nodes from their parents. */
  deleteNodes(nodeIds: string[]): void {
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
  moveNodes(
    nodeIds: string[],
    newParentId: string,
    index?: number,
  ): void {
    // Remove from old parents
    for (const id of nodeIds) {
      const oldParentId = this.parentIndex.get(id);
      if (oldParentId == null) continue;
      const oldParentPath = this.pathIndex.get(oldParentId);
      if (oldParentPath == null) continue;

      // Snapshot the subtree before deleting
      const subtreePlain = this.denicek.get(
        oldParentPath + "/" + id,
      )[0] as PlainRecord;
      this.denicek.delete(oldParentPath, id);
      this.removeFromOrder(oldParentPath, id);

      // Re-add under new parent
      const newParentPath = this.requirePath(newParentId);
      this.denicek.add(newParentPath, id, subtreePlain);
    }

    // Insert IDs into new parent's $order
    const newParentPath = this.requirePath(newParentId);
    this.insertIntoOrder(newParentPath, nodeIds, index);
    this.notifyAfterMutation();
  }

  /** Sets or deletes an attribute on the given nodes. Pass `undefined` to delete. */
  updateAttribute(
    nodeIds: string[],
    key: string,
    value: unknown | undefined,
  ): void {
    for (const id of nodeIds) {
      const path = this.requirePath(id);
      if (value === undefined) {
        this.denicek.delete(path, key);
      } else {
        // Check if field already exists
        const existing = this.denicek.get(path + "/" + key);
        if (existing.length > 0) {
          this.denicek.set(
            path + "/" + key,
            value as string | number | boolean,
          );
        } else {
          this.denicek.add(
            path,
            key,
            value as string | number | boolean,
          );
        }
      }
    }
    this.notifyAfterMutation();
  }

  /** Updates the tag on the given element nodes. */
  updateTag(nodeIds: string[], newTag: string): void {
    for (const id of nodeIds) {
      const path = this.requirePath(id);
      this.denicek.updateTag(path, newTag);
    }
    this.notifyAfterMutation();
  }

  /**
   * Replaces a value node's content. The `oldValue` parameter is kept for
   * API compatibility but the adapter always overwrites with `newValue`.
   */
  updateValue(
    nodeIds: string[],
    _oldValue: string,
    newValue: string,
  ): void {
    for (const id of nodeIds) {
      const path = this.requirePath(id);
      this.denicek.set(path + "/value", newValue);
    }
    this.notifyAfterMutation();
  }

  /** Updates the operation field on a formula node. */
  updateFormulaOperation(id: string, operation: string): void {
    const path = this.requirePath(id);
    this.denicek.set(path + "/operation", operation);
    this.notifyAfterMutation();
  }

  /** Updates the target field on a ref node. */
  updateRefTarget(id: string, target: string): void {
    const path = this.requirePath(id);
    this.denicek.set(path + "/target", target);
    this.notifyAfterMutation();
  }

  // ── Undo / Redo ─────────────────────────────────────────────────

  /** Undoes the last local edit. Returns `true` if an undo was performed. */
  undo(): boolean {
    if (!this.denicek.canUndo) return false;
    this.denicek.undo();
    this.notifyAfterMutation();
    return true;
  }

  /** Redoes the last undone edit. Returns `true` if a redo was performed. */
  redo(): boolean {
    if (!this.denicek.canRedo) return false;
    this.denicek.redo();
    this.notifyAfterMutation();
    return true;
  }

  /** Whether there is a local edit that can be undone. */
  get canUndo(): boolean {
    return this.denicek.canUndo;
  }

  /** Whether a previously undone edit can be redone. */
  get canRedo(): boolean {
    return this.denicek.canRedo;
  }

  // ── Subscription ────────────────────────────────────────────────

  /** Registers a listener called after every mutation. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── Sync ────────────────────────────────────────────────────────

  /** Drains pending local events for replication. */
  drain(): EncodedRemoteEvent[] {
    return this.denicek.drain();
  }

  /** Ingests a remote event and rebuilds indexes. */
  applyRemote(event: EncodedRemoteEvent): void {
    this.denicek.applyRemote(event);
    this.notifyAfterMutation();
  }

  /** Current causal frontier as formatted event-id strings. */
  get frontiers(): string[] {
    return this.denicek.frontiers;
  }

  /** Returns events unknown to a peer with the given frontiers. */
  eventsSince(remoteFrontiers: string[]): EncodedRemoteEvent[] {
    return this.denicek.eventsSince(remoteFrontiers);
  }

  // ── Advanced access ─────────────────────────────────────────────

  /** Exposes the underlying {@link Denicek} instance for advanced operations. */
  get denicekInstance(): Denicek {
    return this.denicek;
  }

  // ── Private helpers ─────────────────────────────────────────────

  /**
   * Materializes the Denicek document and walks the tree to rebuild every
   * lookup index (nodeIndex, childIndex, parentIndex, pathIndex, idByPath).
   */
  private rebuildIndexes(): void {
    this.nodeIndex.clear();
    this.childIndex.clear();
    this.parentIndex.clear();
    this.pathIndex.clear();
    this.idByPath.clear();
    this.rootId = null;

    const doc = this.denicek.materialize();
    if (!isPlainRecord(doc)) return;

    // The root document is an implicit record wrapping the user root at field "root".
    const rootNode = doc["root"];
    if (rootNode === undefined || !isPlainRecord(rootNode)) return;

    this.indexRecord(rootNode, "root", null);
  }

  /** Recursively indexes a PlainRecord node and its children. */
  private indexRecord(
    record: PlainRecord,
    selectorPath: string,
    parentId: string | null,
  ): void {
    const id = record["$id"] as string | undefined;
    if (id === undefined) return;

    const kind = record["$kind"] as string | undefined;
    if (kind === undefined) return;

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
          value: record["value"] as string | number,
        });
        break;
      case "action":
        this.nodeIndex.set(id, {
          id,
          kind: "action",
          label: record["label"] as string,
          actions: record["actions"] as string,
          target: record["target"] as string,
          ...(record["replayMode"] !== undefined
            ? { replayMode: record["replayMode"] as "fixed" | "selected" }
            : {}),
        });
        break;
      case "ref":
        this.nodeIndex.set(id, {
          id,
          kind: "ref",
          target: record["target"] as string,
        });
        break;
      case "formula":
        this.nodeIndex.set(id, {
          id,
          kind: "formula",
          operation: record["operation"] as string,
        });
        break;
    }
  }

  /** Indexes an element node: extracts attrs, discovers children via $order. */
  private indexElementNode(
    record: PlainRecord,
    id: string,
    selectorPath: string,
  ): void {
    const attrs: Record<string, unknown> = {};
    const childIds: string[] = [];

    // Parse the $order string to get ordered child IDs
    const orderStr = record["$order"] as string | undefined;
    const orderedIds = orderStr
      ? orderStr.split(",").filter((s) => s.length > 0)
      : [];

    // Separate children from attributes
    const childRecords = new Map<string, PlainRecord>();
    for (const key of Object.keys(record)) {
      if (METADATA_FIELDS.has(key)) continue;
      const value = record[key];
      if (isPlainRecord(value)) {
        childRecords.set(key, value);
      } else {
        attrs[key] = value;
      }
    }

    // Index children in $order sequence
    for (const childKey of orderedIds) {
      const childRecord = childRecords.get(childKey);
      if (childRecord) {
        childIds.push(childKey);
        this.indexRecord(childRecord, selectorPath + "/" + childKey, id);
      }
    }

    // Include children not listed in $order (append at end)
    for (const [childKey, childRecord] of childRecords) {
      if (!orderedIds.includes(childKey)) {
        childIds.push(childKey);
        this.indexRecord(childRecord, selectorPath + "/" + childKey, id);
      }
    }

    this.nodeIndex.set(id, {
      id,
      kind: "element",
      tag: record["$tag"] as string,
      attrs,
    });
    this.childIndex.set(id, childIds);
  }

  /** Converts a {@link NodeInput} into a {@link PlainRecord} for the Denicek. */
  private buildPlainRecord(input: NodeInput, id: string): PlainRecord {
    switch (input.kind) {
      case "element": {
        const record: PlainRecord = {
          $tag: input.tag,
          $id: id,
          $kind: "element",
          $order: "",
        };
        if (input.attrs) {
          for (const [key, value] of Object.entries(input.attrs)) {
            record[key] = value as string | number | boolean;
          }
        }
        if (input.children && input.children.length > 0) {
          const childIds: string[] = [];
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
          value: input.value,
        };
      case "action": {
        const rec: PlainRecord = {
          $tag: "$action",
          $id: id,
          $kind: "action",
          label: input.label,
          actions: input.actions,
          target: input.target,
        };
        if (input.replayMode !== undefined) {
          rec["replayMode"] = input.replayMode;
        }
        return rec;
      }
      case "ref":
        return {
          $tag: "$ref",
          $id: id,
          $kind: "ref",
          target: input.target,
        };
      case "formula":
        return {
          $tag: "$formula",
          $id: id,
          $kind: "formula",
          operation: input.operation,
        };
    }
  }

  /** Returns the selector path for the given node ID, throwing if not found. */
  private requirePath(id: string): string {
    const path = this.pathIndex.get(id);
    if (path === undefined) {
      throw new Error(`Node not found: ${id}`);
    }
    return path;
  }

  /** Reads the current $order value from a parent path. */
  private readOrder(parentPath: string): string[] {
    const values = this.denicek.get(parentPath + "/$order");
    const orderStr = values.length > 0 ? String(values[0]) : "";
    return orderStr.length > 0 ? orderStr.split(",") : [];
  }

  /** Inserts new IDs into a parent's $order at the specified index. */
  private insertIntoOrder(
    parentPath: string,
    newIds: string[],
    startIndex?: number,
  ): void {
    const order = this.readOrder(parentPath);
    const idx = startIndex !== undefined
      ? Math.min(startIndex, order.length)
      : order.length;
    order.splice(idx, 0, ...newIds);
    this.denicek.set(parentPath + "/$order", order.join(","));
  }

  /** Removes an ID from a parent's $order. */
  private removeFromOrder(parentPath: string, childId: string): void {
    const order = this.readOrder(parentPath);
    const filtered = order.filter((id) => id !== childId);
    this.denicek.set(parentPath + "/$order", filtered.join(","));
  }

  /** Increments version, rebuilds indexes, and notifies all listeners. */
  private notifyAfterMutation(): void {
    this._version++;
    this.rebuildIndexes();
    for (const listener of this.listeners) {
      listener();
    }
  }
}
