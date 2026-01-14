import { next as Automerge } from "@automerge/automerge";
import type { ElementNode, JsonDoc, Node, Transformation, ValueNode } from "./types";

/**
 * Splice info for edit transformations.
 */
export interface SpliceInfo {
  /** Index in the string where the splice starts */
  index: number;
  /** Number of characters to delete */
  deleteCount: number;
  /** Text to insert at the index */
  insertText: string;
}

/**
 * Options for adding a transformation.
 * Includes both selector options (which nodes to match) and payload options (what to do).
 */
export interface AddTransformationOptions {
  // === Selector options ===
  /** Only apply to descendants matching this tag */
  selectorTag?: string;
  /** Only apply to descendants at this depth from LCA (1 = direct children) */
  selectorDepth?: number;
  /** Only apply to nodes of this kind (element or value) */
  selectorKind?: "element" | "value";

  // === Payload options (depends on transformation type) ===
  /** The tag to use for wrap/rename transformations */
  tag?: string;
  /** Splice info for edit transformations */
  splice?: SpliceInfo;
  /** 
   * Optional prefix for generating wrapper IDs (for wrap transformations).
   * If not provided, a default prefix based on transformation key will be used.
   */
  wrapperIdPrefix?: string;
}

export class DenicekModel {
  private doc: JsonDoc;
  constructor(doc: JsonDoc) {
    this.doc = doc;
  }

  // ==================== READ Methods ====================

  get rootId(): string {
    return this.doc.root;
  }

  getNode(id: string): Node | undefined {
    return this.doc.nodes[id];
  }

  getRootNode(): Node | undefined {
    return this.getNode(this.rootId);
  }

  getAllNodes(): Record<string, Node> {
    return this.doc.nodes;
  }

  get transformations(): Transformation[] {
    const t = this.doc.transformations || {};
    return Object.values(t);
  }

  getSnapshot(): JsonDoc {
    return this.doc;
  }

  getParents(childId: string): ElementNode[] {
    const parents: ElementNode[] = [];
    for (const [_, parentNode] of Object.entries(this.doc.nodes) as [string, Node][]) {
      if (parentNode.kind === "element" && parentNode.children.includes(childId)) {
        parents.push(parentNode);
      }
    }
    return parents;
  }

  getFirstChildTag(node: ElementNode): string | undefined {
    if (!node.children[0]) return undefined;
    const childNode = this.getNode(node.children[0]);
    if (childNode?.kind === "element") {
      return childNode.tag;
    }
    return undefined;
  }

  getChildrenIds(node: ElementNode): string[] {
    return node.children;
  }

  // ==================== WRITE Methods ====================
  // Note: These methods assume `this.doc` is a mutable proxy (during Automerge.change)
  // or that the caller handles immutability if not using Automerge.
  // In the context of this app, these are called inside handle.change((doc) => { new DenicekModel(doc).update... })

  private getUUID(): string {
    const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
    return c && typeof c.randomUUID === 'function' ? c.randomUUID() : `uuid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Applies a splice operation to a value node.
   * This is a primitive operation - callers should calculate the splice info externally.
   */
  spliceValue(id: string, index: number, deleteCount: number, insertText: string): void {
    const node = this.doc.nodes[id];
    if (node?.kind === "value") {
      const safeIndex = Math.min(index, node.value.length);
      const safeDeleteCount = Math.min(deleteCount, node.value.length - safeIndex);
      Automerge.splice(this.doc, ['nodes', id, 'value'], safeIndex, safeDeleteCount, insertText);
    }
  }

  updateAttribute(id: string, key: string, value: unknown | undefined): void {
    const node = this.doc.nodes[id];
    if (node && node.kind === "element") {
      if (value === undefined) {
        delete node.attrs[key];
      } else {
        node.attrs[key] = value;
      }
    }
  }

  updateTag(id: string, newTag: string): void {
    const node = this.doc.nodes[id];
    if (node && node.kind === "element") {
      node.tag = newTag;
    }
  }

  deleteNode(id: string): void {
    const parentNodes = this.getParents(id);
    for (const parent of parentNodes) {
      const idx = parent.children.indexOf(id);
      if (idx !== -1) {
        parent.children.splice(idx, 1);
      }
    }
  }

  wrapNode(targetId: string, wrapperTag: string, wrapperId?: string): string {
    // If wrapperId is provided (from transformation), use it; otherwise generate one
    let actualWrapperId = wrapperId ?? ("w-" + targetId);
    
    // If no explicit wrapperId was provided, ensure uniqueness
    if (!wrapperId) {
      while (this.doc.nodes[actualWrapperId]) actualWrapperId = actualWrapperId + "_w";
    }
    
    // If wrapper already exists with correct structure, this is idempotent
    const existingWrapper = this.doc.nodes[actualWrapperId];
    if (existingWrapper?.kind === "element" && 
        existingWrapper.tag === wrapperTag && 
        existingWrapper.children.length === 1 && 
        existingWrapper.children[0] === targetId) {
      return actualWrapperId; // Already correctly wrapped
    }
    
    for (const parent of this.getParents(targetId)) {
       const idx = parent.children.indexOf(targetId);
       if (idx !== -1) {
           parent.children[idx] = actualWrapperId;
       }
    }
    this.doc.nodes[actualWrapperId] = { kind: "element", tag: wrapperTag, attrs: {}, children: [targetId] };
    return actualWrapperId;
  }

  /**
   * Unwraps a node by removing its wrapper and moving the wrapped node to the wrapper's parent.
   * Returns true if unwrap was successful.
   */
  unwrapNode(wrapperId: string): boolean {
    const wrapper = this.doc.nodes[wrapperId];
    if (wrapper?.kind !== "element" || wrapper.children.length !== 1) return false;
    
    const wrappedId = wrapper.children[0];
    const parents = this.getParents(wrapperId);
    
    for (const parent of parents) {
      const idx = parent.children.indexOf(wrapperId);
      if (idx !== -1) {
        parent.children[idx] = wrappedId;
      }
    }
    
    delete this.doc.nodes[wrapperId];
    return true;
  }

  // ==================== TRANSFORMATION Methods ====================

  /**
   * Gets the specificity order for this document.
   * 'depth-first' means depth-only selectors are more specific than tag-only.
   * 'tag-first' means tag-only selectors are more specific than depth-only.
   */
  get specificityOrder(): 'depth-first' | 'tag-first' {
    return this.doc.specificityOrder ?? 'depth-first';
  }

  /**
   * Sets the specificity order for this document.
   */
  setSpecificityOrder(order: 'depth-first' | 'tag-first'): void {
    this.doc.specificityOrder = order;
  }

  /**
   * Calculates the specificity of a transformation.
   * Higher specificity = higher priority.
   * - 3: both tag and depth specified (most specific)
   * - 2: depth-only or tag-only (depends on specificityOrder)
   * - 1: the other of depth-only or tag-only
   */
  getTransformationSpecificity(t: Transformation): number {
    const hasTag = t.selectorTag !== undefined;
    const hasDepth = t.selectorDepth !== undefined;
    
    if (hasTag && hasDepth) return 3;
    
    if (this.specificityOrder === 'depth-first') {
      if (hasDepth) return 2;
      if (hasTag) return 1;
    } else {
      if (hasTag) return 2;
      if (hasDepth) return 1;
    }
    
    return 0; // matches all (no selector)
  }

  /**
   * Generates a transformation key from a transformation.
   */
  getTransformationKey(t: Transformation): string {
    const tag = t.selectorTag ?? '*';
    const depth = t.selectorDepth !== undefined ? String(t.selectorDepth) : '*';
    return `${t.lca}:${tag}:${depth}:${t.version}`;
  }

  /**
   * Parses a transformation key into its components.
   */
  parseTransformationKey(key: string): { lca: string; selectorTag?: string; selectorDepth?: number; version: number } {
    const parts = key.split(':');
    return {
      lca: parts[0],
      selectorTag: parts[1] === '*' ? undefined : parts[1],
      selectorDepth: parts[2] === '*' ? undefined : Number(parts[2]),
      version: Number(parts[3]),
    };
  }

  /**
   * Adds a transformation for descendants of the given LCA.
   * 
   * For 'wrap' and 'rename': pass options.tag
   * For 'edit': pass options.splice (pre-calculated splice info)
   */
  addTransformation(lca: string, type: "wrap" | "rename" | "edit", options: AddTransformationOptions = {}): void {
    const nodes = this.doc.nodes;
    if (nodes[lca]?.kind !== "element") return;

    const current = this.latestVersionForSelector(lca, options.selectorTag, options.selectorDepth);
    const version = current + 1;
    
    // Build transformation object without undefined values (Automerge doesn't allow undefined)
    const t: Transformation = {
      lca,
      version,
      type,
    };

    // Add payload based on type
    if (type === "wrap" && options.tag !== undefined) {
      t.tag = options.tag;
      // Generate stable wrapper ID prefix for CRDT-friendly idempotent wrapping
      // The actual wrapperId per node will be generated during application
      t.wrapperId = options.wrapperIdPrefix ?? `wrap-${lca}-${version}`;
    } else if (type === "rename" && options.tag !== undefined) {
      t.tag = options.tag;
    } else if (type === "edit" && options.splice !== undefined) {
      t.splice = options.splice;
    }

    // Add selector options
    if (options.selectorTag !== undefined) {
      t.selectorTag = options.selectorTag;
    }
    if (options.selectorDepth !== undefined) {
      t.selectorDepth = options.selectorDepth;
    }
    if (options.selectorKind !== undefined) {
      t.selectorKind = options.selectorKind;
    }
    
    const key = this.getTransformationKey(t);
    
    if (!this.doc.transformations) {
      this.doc.transformations = {};
    }
    this.doc.transformations[key] = t;

    // Apply transformation to all matching descendants
    this.applyTransformationsFromLca(lca);
  }

  /**
   * Gets the latest version for a specific LCA + selector combination.
   */
  private latestVersionForSelector(lca: string, selectorTag?: string, selectorDepth?: number): number {
    const transformations = Object.values(this.doc.transformations || {});
    let max = 0;
    for (const t of transformations) {
      if (t.lca === lca && t.selectorTag === selectorTag && t.selectorDepth === selectorDepth) {
        if (t.version > max) max = t.version;
      }
    }
    return max;
  }

  /**
   * Gets the depth of a node relative to an ancestor.
   * Returns undefined if nodeId is not a descendant of ancestorId.
   */
  getDepthFromAncestor(nodeId: string, ancestorId: string): number | undefined {
    const parentMap = this.buildParentMap();
    let depth = 0;
    let current: string | undefined = nodeId;
    
    while (current) {
      if (current === ancestorId) return depth;
      current = parentMap[current];
      depth++;
    }
    
    return undefined;
  }

  /**
   * Checks if a node matches a transformation's selector.
   */
  nodeMatchesTransformation(nodeId: string, t: Transformation): { matches: boolean; depth: number } {
    const node = this.doc.nodes[nodeId];
    if (!node) return { matches: false, depth: 0 };
    
    const depth = this.getDepthFromAncestor(nodeId, t.lca);
    if (depth === undefined || depth === 0) return { matches: false, depth: 0 }; // not a descendant or is the LCA itself
    
    // Check kind selector (element vs value)
    if (t.selectorKind !== undefined) {
      if (node.kind !== t.selectorKind) {
        return { matches: false, depth };
      }
    }
    
    // Check tag selector (only applies to elements)
    if (t.selectorTag !== undefined) {
      if (node.kind !== "element" || node.tag !== t.selectorTag) {
        return { matches: false, depth };
      }
    }
    
    // Check depth selector
    if (t.selectorDepth !== undefined) {
      if (depth !== t.selectorDepth) {
        return { matches: false, depth };
      }
    }
    
    return { matches: true, depth };
  }

  /**
   * Finds all transformations that match a given node, sorted by priority.
   * Priority order:
   * 1. Closest ancestor (lower depth from node to LCA)
   * 2. Higher specificity (tag+depth > depth-only/tag-only based on config)
   * 3. Higher version
   */
  findMatchingTransformations(nodeId: string): Array<{ transformation: Transformation; key: string; depth: number; specificity: number }> {
    const results: Array<{ transformation: Transformation; key: string; depth: number; specificity: number }> = [];
    
    for (const [key, t] of Object.entries(this.doc.transformations || {})) {
      const match = this.nodeMatchesTransformation(nodeId, t);
      if (match.matches) {
        results.push({
          transformation: t,
          key,
          depth: match.depth,
          specificity: this.getTransformationSpecificity(t),
        });
      }
    }
    
    // Sort by priority: lower depth first, then higher specificity, then higher version
    results.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      if (a.specificity !== b.specificity) return b.specificity - a.specificity;
      return b.transformation.version - a.transformation.version;
    });
    
    return results;
  }

  /**
   * Determines the winning transformation for a node, considering applied transformations.
   * Returns the transformation to apply, or null if no action needed.
   */
  resolveTransformationForNode(nodeId: string): { transformation: Transformation; key: string } | null {
    const matching = this.findMatchingTransformations(nodeId);
    if (matching.length === 0) return null;
    
    // The first one is the winner (highest priority)
    const winner = matching[0];
    
    // Check if already applied
    const node = this.doc.nodes[nodeId];
    if (!node) return null;
    
    const applied = node.appliedTransformations?.[winner.specificity];
    if (applied && applied.key === winner.key) {
      // Already applied this exact transformation
      return null;
    }
    
    return { transformation: winner.transformation, key: winner.key };
  }

  /**
   * Applies a transformation to a node.
   * For wrap transformations, uses the stable wrapperId from the transformation for idempotency.
   */
  applyTransformationToNode(nodeId: string, t: Transformation, key: string): void {
    const node = this.doc.nodes[nodeId];
    if (!node) return;
    
    const specificity = this.getTransformationSpecificity(t);
    
    // Check if already applied this exact transformation
    const applied = node.appliedTransformations?.[specificity];
    if (applied && applied.key === key) {
      return; // Already applied, idempotent
    }
    
    // Apply the new transformation
    if (t.type === "rename" && node.kind === "element" && t.tag) {
      node.tag = t.tag;
    } else if (t.type === "wrap" && t.tag && t.wrapperId) {
      // Generate stable per-node wrapper ID from the transformation's wrapper ID prefix
      // This ensures each target node gets a unique but deterministic wrapper
      const perNodeWrapperId = `${t.wrapperId}-${nodeId}`;
      this.wrapNode(nodeId, t.tag, perNodeWrapperId);
    } else if (t.type === "edit" && node.kind === "value" && t.splice) {
      // Apply smart splice to value node
      const { index, deleteCount, insertText } = t.splice;
      const safeIndex = Math.min(index, node.value.length);
      const safeDeleteCount = Math.min(deleteCount, node.value.length - safeIndex);
      Automerge.splice(this.doc, ['nodes', nodeId, 'value'], safeIndex, safeDeleteCount, insertText);
    }
    
    // Record that this transformation was applied
    if (!node.appliedTransformations) {
      node.appliedTransformations = {};
    }
    node.appliedTransformations[specificity] = { version: t.version, key };
    node.version = Math.max(node.version ?? 0, t.version);
  }

  /**
   * Applies all transformations originating from a given LCA to matching descendants.
   */
  applyTransformationsFromLca(lcaId: string): void {
    const descendants = this.getAllDescendants(lcaId);
    
    for (const nodeId of descendants) {
      const result = this.resolveTransformationForNode(nodeId);
      if (result) {
        this.applyTransformationToNode(nodeId, result.transformation, result.key);
      }
    }
  }

  /**
   * Gets all descendant node IDs of a given ancestor.
   */
  private getAllDescendants(ancestorId: string): string[] {
    const descendants: string[] = [];
    const visited = new Set<string>();
    
    const traverse = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      if (nodeId !== ancestorId) {
        descendants.push(nodeId);
      }
      
      const node = this.doc.nodes[nodeId];
      if (node?.kind === "element") {
        for (const childId of node.children) {
          traverse(childId);
        }
      }
    };
    
    traverse(ancestorId);
    return descendants;
  }

  /**
   * Applies all pending transformations across the entire document.
   * Should be called after each Automerge sync to reconcile conflicts.
   */
  applyAllPendingTransformations(): void {
    // Get all LCAs that have transformations
    const transformations = Object.values(this.doc.transformations || {});
    const lcaIds = new Set(transformations.map(t => t.lca));
    
    // For each node in the document, resolve and apply the winning transformation
    for (const nodeId of Object.keys(this.doc.nodes)) {
      const result = this.resolveTransformationForNode(nodeId);
      if (result) {
        this.applyTransformationToNode(nodeId, result.transformation, result.key);
      }
    }
  }

  /**
   * Gets the latest version for any transformation on the given LCA.
   * Used for setting version on newly added children.
   */
  private latestVersionForLca(lca: string): number {
    const transformations = Object.values(this.doc.transformations || {});
    let max = 0;
    for (const t of transformations) {
      if (t.lca === lca && t.version > max) max = t.version;
    }
    return max;
  }

  // Legacy compatibility - use latestVersionForLca for parent-based lookups
  private latestVersionForParent(parent: string | null): number {
    if (!parent) return 0;
    return this.latestVersionForLca(parent);
  }

  private getNodeId(node: Node): string | undefined {
    for (const [id, n] of Object.entries(this.doc.nodes)) {
      if (n === node) return id;
    }
    return undefined;
  }

  addChildNode(parent: ElementNode, child: Node, id?: string): string {
    const newId = id || `n_${this.getUUID()}`;
    
    // Set version to parent's latest transformation version + 1
    // so existing transformations won't be applied to this new child
    const parentId = this.getNodeId(parent);
    if (parentId) {
      const latestVersion = this.latestVersionForParent(parentId);
      if (latestVersion > 0) {
        child.version = latestVersion + 1;
      }
    }
    
    this.doc.nodes[newId] = child;
    parent.children.push(newId);
    return newId;
  }

  addElementChildNode(parent: ElementNode, tag: string, id?: string): string {
    const node: Node = { kind: "element", tag, attrs: {}, children: [] };
    return this.addChildNode(parent, node, id);
  }

  addValueChildNode(parent: ElementNode, value: string, id?: string): string {
    const node: Node = { kind: "value", value };
    return this.addChildNode(parent, node, id);
  }

  addSiblingNodeBefore(siblingId: string): string | undefined {
    return this.addSiblingNode(0, siblingId);
  }

  addSiblingNodeAfter(siblingId: string): string | undefined {
    return this.addSiblingNode(1, siblingId);
  }

  private addSiblingNode(relativeIndex: number, siblingId: string): string | undefined {
    const sibling = this.doc.nodes[siblingId];
    if (!sibling) return undefined;
    const node: Node = sibling.kind === "element" 
      ? { kind: "element", tag: sibling.tag, attrs: {}, children: [] } 
      : { kind: "value", value: (sibling as ValueNode).value };
      
    const id = `n_${this.getUUID()}`;
    
    // Set version based on parent's latest transformation + 1
    const parents = this.getParents(siblingId);
    for (const parent of parents) {
      const parentId = this.getNodeId(parent);
      if (parentId) {
        const latestVersion = this.latestVersionForParent(parentId);
        if (latestVersion > 0) {
          node.version = latestVersion + 1;
        }
      }
      parent.children.splice(parent.children.indexOf(siblingId) + relativeIndex, 0, id);
    }
    
    this.doc.nodes[id] = node;
    return id;
  }

  // Static Helpers (Logic that doesn't strictly depend on a single doc instance state but is useful)
  
  static LowestCommonAncestor(doc: JsonDoc, nodeIds: string[]): string | null {
      // This implementation was strictly functional. We can keep it static or make it instance method.
      // Instance method is better for encapsulation.
      return new DenicekModel(doc).findLowestCommonAncestor(nodeIds);
  }
  
  findLowestCommonAncestor(nodeIds: string[]): string | null {
    if (nodeIds.length === 0) return null;
    const parentMap = this.buildParentMap();
    
    let currentLca: string | undefined = nodeIds[0];
  
    for (let i = 1; i < nodeIds.length; i++) {
      if (!currentLca) break;
      const nextNode = nodeIds[i];
      
      const ancestors = new Set<string>();
      let curr: string | undefined = currentLca;
      while (curr) {
        ancestors.add(curr);
        curr = parentMap[curr];
      }
  
      let runner: string | undefined = nextNode;
      let found = false;
      while (runner) {
        if (ancestors.has(runner)) {
          currentLca = runner;
          found = true;
          break;
        }
        runner = parentMap[runner];
      }
      if (!found) {
          currentLca = this.doc.root;
      }
    }
  
    return currentLca || null;
  }

  /**
   * Result of generalizing a selection, including selector information for transformations.
   */
  generalizeSelectionWithInfo(nodeIds: string[]): {
    lcaId: string | null;
    selectorTag: string | undefined;
    selectorDepth: number | undefined;
    selectorKind: "element" | "value" | undefined;
    matchingNodeIds: string[];
  } {
    if (nodeIds.length === 0) {
      return { lcaId: null, selectorTag: undefined, selectorDepth: undefined, selectorKind: undefined, matchingNodeIds: [] };
    }
    
    let lcaId = this.findLowestCommonAncestor(nodeIds);
    if (!lcaId) {
      return { lcaId: null, selectorTag: undefined, selectorDepth: undefined, selectorKind: undefined, matchingNodeIds: [] };
    }

    const parentMap = this.buildParentMap();
    
    // When a single node is selected, the LCA is the node itself.
    // For transformations to target siblings, we use the parent as the LCA.
    if (nodeIds.length === 1 && parentMap[lcaId]) {
      lcaId = parentMap[lcaId]!;
    }

    // Calculate depth of a node from the LCA
    const getDepthFromLca = (nodeId: string): number => {
      let depth = 0;
      let current: string | undefined = nodeId;
      while (current && current !== lcaId) {
        depth++;
        current = parentMap[current];
      }
      return current === lcaId ? depth : -1;
    };

    // Gather tags, depths, and kinds from selected nodes
    const selectedTags = new Set<string>();
    const selectedDepths = new Set<number>();
    let hasValues = false;
    let hasElements = false;

    for (const id of nodeIds) {
      const node = this.doc.nodes[id];
      if (!node) continue;
      
      const depth = getDepthFromLca(id);
      if (depth >= 0) selectedDepths.add(depth);

      if (node.kind === 'element') {
        selectedTags.add(node.tag);
        hasElements = true;
      } else if (node.kind === 'value') {
        hasValues = true;
      }
    }

    const allSameTag = selectedTags.size === 1 && !hasValues;
    const allSameDepth = selectedDepths.size === 1;
    
    // Determine selectorKind: if all selected are values, use "value"; if all are elements, use "element"
    // If mixed, don't set selectorKind
    const selectorKind: "element" | "value" | undefined = 
      (hasValues && !hasElements) ? "value" : 
      (hasElements && !hasValues) ? "element" : 
      undefined;

    // Case 4: Different tags AND different depths → no generalization
    if (!allSameTag && !allSameDepth) {
      return { 
        lcaId, 
        selectorTag: undefined, 
        selectorDepth: undefined,
        selectorKind,
        matchingNodeIds: [...nodeIds] 
      };
    }

    const selectorTag = allSameTag ? [...selectedTags][0] : undefined;
    const selectorDepth = allSameDepth ? [...selectedDepths][0] : undefined;

    const results: string[] = [];

    const traverse = (currentId: string, currentDepth: number) => {
      const node = this.doc.nodes[currentId];
      if (!node) return;

      if (node.kind === 'element') {
        const tagMatches = selectorTag === undefined || node.tag === selectorTag;
        const depthMatches = selectorDepth === undefined || currentDepth === selectorDepth;
        const kindMatches = selectorKind === undefined || selectorKind === 'element';

        if (tagMatches && depthMatches && kindMatches && currentDepth > 0) {
          results.push(currentId);
        }

        for (const childId of node.children) {
          traverse(childId, currentDepth + 1);
        }
      } else if (node.kind === 'value') {
        const depthMatches = selectorDepth === undefined || currentDepth === selectorDepth;
        const kindMatches = selectorKind === undefined || selectorKind === 'value';
        if (depthMatches && kindMatches && currentDepth > 0) {
          results.push(currentId);
        }
      }
    };

    traverse(lcaId, 0);
    return { lcaId, selectorTag, selectorDepth, selectorKind, matchingNodeIds: results };
  }

  generalizeSelection(nodeIds: string[]): string[] {
    if (nodeIds.length === 0) return [];
    
    const lcaId = this.findLowestCommonAncestor(nodeIds);
    if (!lcaId) return [];

    const parentMap = this.buildParentMap();

    // Calculate depth of a node from the LCA
    const getDepthFromLca = (nodeId: string): number => {
      let depth = 0;
      let current: string | undefined = nodeId;
      while (current && current !== lcaId) {
        depth++;
        current = parentMap[current];
      }
      return current === lcaId ? depth : -1;
    };

    // Gather tags and depths from selected nodes
    const selectedTags = new Set<string>();
    const selectedDepths = new Set<number>();
    let hasValues = false;

    for (const id of nodeIds) {
      const node = this.doc.nodes[id];
      if (!node) continue;
      
      const depth = getDepthFromLca(id);
      if (depth >= 0) selectedDepths.add(depth);

      if (node.kind === 'element') {
        selectedTags.add(node.tag);
      } else if (node.kind === 'value') {
        hasValues = true;
      }
    }

    const allSameTag = selectedTags.size === 1 && !hasValues;
    const allSameDepth = selectedDepths.size === 1;

    // Case 4: Different tags AND different depths → return only selected nodes
    if (!allSameTag && !allSameDepth) {
      return [...nodeIds];
    }

    const targetTag = allSameTag ? [...selectedTags][0] : null;
    const targetDepth = allSameDepth ? [...selectedDepths][0] : null;

    const results: string[] = [];

    const traverse = (currentId: string, currentDepth: number) => {
      const node = this.doc.nodes[currentId];
      if (!node) return;

      if (node.kind === 'element') {
        const tagMatches = targetTag === null || node.tag === targetTag;
        const depthMatches = targetDepth === null || currentDepth === targetDepth;

        // Case 1: Same tag + same depth → match both
        // Case 2: Same tag + different depth → match tag only (targetDepth is null)
        // Case 3: Different tag + same depth → match depth only (targetTag is null)
        if (tagMatches && depthMatches) {
          results.push(currentId);
        }

        for (const childId of node.children) {
          traverse(childId, currentDepth + 1);
        }
      } else if (node.kind === 'value' && hasValues) {
        const depthMatches = targetDepth === null || currentDepth === targetDepth;
        if (depthMatches) {
          results.push(currentId);
        }
      }
    };

    traverse(lcaId, 0);
    return results;
  }

  private buildParentMap(): Record<string, string> {
      const parentMap: Record<string, string> = {};
      for (const [parentId, node] of Object.entries(this.doc.nodes) as [string, Node][]) {
        if (node.kind === "element") {
          for (const childId of node.children) {
            parentMap[childId] = parentId;
          }
        }
      }
      return parentMap;
    }

    static createInitialDocument(): JsonDoc {
      const rootId = 'n-root';
      const nodes: Record<string, Node> = {
          [rootId]: { kind: 'element', tag: 'section', attrs: {}, children: [] }
      };
    
      const doc: JsonDoc = {
        root: rootId,
        nodes,
        transformations: {},
      };
    
      const model = new DenicekModel(doc);

      function add(parentId: string, tag: string, setup?: (id: string, node: ElementNode) => void) {
          const parentNode = nodes[parentId] as ElementNode;
          const id = model.addElementChildNode(parentNode, tag);
          if (setup) setup(id, nodes[id] as ElementNode);
          return id;
      }
    
      function addVal(parentId: string, value: string) {
          const parentNode = nodes[parentId] as ElementNode;
          return model.addValueChildNode(parentNode, value);
      }
    
      add(rootId, 'section', (sectionId, sectionNode) => {
          sectionNode.attrs = { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, 'data-testid': 'section' };
          
          add(sectionId, 'article', (aId) => {
              add(aId, 'h2', (hId) => addVal(hId, 'Article A'));
              add(aId, 'p', (pId) => addVal(pId, 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'));
              add(aId, 'ul', (ulId) => {
                  add(ulId, 'li', (liId) => addVal(liId, 'Item A1'));
                  add(ulId, 'li', (liId) => addVal(liId, 'Item A2'));
                  add(ulId, 'li', (liId) => addVal(liId, 'Item A3'));
              });
          });
    
          add(sectionId, 'article', (bId) => {
              add(bId, 'h2', (hId) => addVal(hId, 'Article B'));
              add(bId, 'p', (pId) => addVal(pId, 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'));
              add(bId, 'div', (divId, divNode) => {
                  divNode.attrs = { style: { display: 'flex', gap: 8 } };
                  add(divId, 'button', (btnId) => addVal(btnId, 'Button 1'));
                  add(divId, 'button', (btnId) => addVal(btnId, 'Button 2'));
                  add(divId, 'button', (btnId) => addVal(btnId, 'Button 3'));
              });
          });
    
          add(sectionId, 'article', (cId, cNode) => {
              cNode.attrs = { style: { gridColumn: 'span 2' } };
              add(cId, 'h2', (hId) => addVal(hId, 'Article C'));
              add(cId, 'div', (gridId, gridNode) => {
                  gridNode.attrs = { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 } };
                  Array.from({ length: 9 }).forEach((_, i) => {
                      add(gridId, 'div', (boxId, boxNode) => {
                          boxNode.attrs = { style: { padding: 12, background: '#f7f7f7', border: '1px dashed #ccc', borderRadius: 6 } };
                          addVal(boxId, `Box ${i + 1}`);
                      });
                  });
              });
          });
    
          add(sectionId, 'article', (dId, dNode) => {
              dNode.attrs = { style: { gridColumn: 'span 2' } };
              add(dId, 'h2', (hId) => addVal(hId, 'Table Data'));
              add(dId, 'table', (tId, tNode) => {
                  tNode.attrs = { border: '1', style: { width: '100%', borderCollapse: 'collapse' } };
                  add(tId, 'thead', (theadId) => {
                      add(theadId, 'tr', (trId) => {
                          add(trId, 'th', (thId) => addVal(thId, 'Name'));
                          add(trId, 'th', (thId) => addVal(thId, 'Role'));
                          add(trId, 'th', (thId) => addVal(thId, 'Status'));
                      });
                  });
                  add(tId, 'tbody', (tbodyId) => {
                      add(tbodyId, 'tr', (trId) => {
                          add(trId, 'td', (tdId) => addVal(tdId, 'Alice'));
                          add(trId, 'td', (tdId) => addVal(tdId, 'Developer'));
                          add(trId, 'td', (tdId) => addVal(tdId, 'Active'));
                      });
                      add(tbodyId, 'tr', (trId) => {
                          add(trId, 'td', (tdId) => addVal(tdId, 'Bob'));
                          add(trId, 'td', (tdId) => addVal(tdId, 'Designer'));
                          add(trId, 'td', (tdId) => addVal(tdId, 'Inactive'));
                      });
                  });
              });
          });
      });
    
      return doc;
    }
}
