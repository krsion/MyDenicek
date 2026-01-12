import { next as Automerge } from "@automerge/automerge";
import type { AppliedTransformations, ElementNode, JsonDoc, Node, Transformation, ValueNode } from "./types";

/**
 * Options for adding a transformation
 */
export interface AddTransformationOptions {
  /** Only apply to descendants matching this tag */
  selectorTag?: string;
  /** Only apply to descendants at this depth from LCA (1 = direct children) */
  selectorDepth?: number;
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

  updateValue(id: string, newValue: string, originalValue: string): void {
    const { index, deleteCount, insertText } = this.calculateSplice(originalValue, newValue);
    const node = this.doc.nodes[id];
    if (node?.kind === "value") {
      if (index === 0 && deleteCount === originalValue.length && insertText === newValue) {
        node.value = newValue;
      } else {
        const safeIndex = Math.min(index, node.value.length);
        Automerge.splice(this.doc, ['nodes', id, 'value'], safeIndex, deleteCount, insertText);
      }
    }
  }

  private calculateSplice(oldVal: string, newVal: string) {
    let start = 0;
    while (start < oldVal.length && start < newVal.length && oldVal[start] === newVal[start]) {
      start++;
    }

    let oldEnd = oldVal.length;
    let newEnd = newVal.length;

    while (oldEnd > start && newEnd > start && oldVal[oldEnd - 1] === newVal[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    const deleteCount = oldEnd - start;
    const insertText = newVal.slice(start, newEnd);

    return { index: start, deleteCount, insertText };
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

  wrapNode(targetId: string, wrapperTag: string): string {
    let wrapperId = "w-" + targetId;
    while (this.doc.nodes[wrapperId]) wrapperId = wrapperId + "_w";
    
    for (const parent of this.getParents(targetId)) {
       const idx = parent.children.indexOf(targetId);
       if (idx !== -1) {
           parent.children[idx] = wrapperId;
       }
    }
    this.doc.nodes[wrapperId] = { kind: "element", tag: wrapperTag, attrs: {}, children: [targetId] };
    return wrapperId;
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
   */
  addTransformation(lca: string, type: "wrap" | "rename", tag: string, options: AddTransformationOptions = {}): void {
    const nodes = this.doc.nodes;
    if (nodes[lca]?.kind !== "element") return;

    const current = this.latestVersionForSelector(lca, options.selectorTag, options.selectorDepth);
    const version = current + 1;
    
    // Build transformation object without undefined values (Automerge doesn't allow undefined)
    const t: Transformation = {
      lca,
      version,
      type,
      tag,
    };
    if (options.selectorTag !== undefined) {
      t.selectorTag = options.selectorTag;
    }
    if (options.selectorDepth !== undefined) {
      t.selectorDepth = options.selectorDepth;
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
    
    // Check tag selector
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
   * Applies a transformation to a node, handling undo of conflicting transformations.
   */
  applyTransformationToNode(nodeId: string, t: Transformation, key: string): void {
    const node = this.doc.nodes[nodeId];
    if (!node) return;
    
    const specificity = this.getTransformationSpecificity(t);
    
    // Check if we need to undo a previous transformation at this specificity
    const applied = node.appliedTransformations?.[specificity];
    if (applied && applied.key !== key) {
      // Need to undo the previous transformation first
      const prevT = this.doc.transformations?.[applied.key];
      if (prevT) {
        this.undoTransformationOnNode(nodeId, prevT);
      }
    }
    
    // Apply the new transformation
    if (t.type === "rename" && node.kind === "element") {
      node.tag = t.tag;
    } else if (t.type === "wrap") {
      // Check if already wrapped with correct tag (idempotent)
      const parents = this.getParents(nodeId);
      const alreadyWrapped = parents.some(p => 
        p.tag === t.tag && 
        p.children.length === 1 && 
        p.children[0] === nodeId
      );
      if (!alreadyWrapped) {
        this.wrapNode(nodeId, t.tag);
      }
    }
    
    // Record that this transformation was applied
    if (!node.appliedTransformations) {
      node.appliedTransformations = {};
    }
    node.appliedTransformations[specificity] = { version: t.version, key };
    node.version = Math.max(node.version ?? 0, t.version);
  }

  /**
   * Undoes a transformation on a node.
   * Note: This doesn't restore the original state perfectly, but prepares for a new transformation.
   */
  private undoTransformationOnNode(nodeId: string, t: Transformation): void {
    if (t.type === "wrap") {
      // Find the wrapper and unwrap
      const parents = this.getParents(nodeId);
      for (const parent of parents) {
        if (parent.children.length === 1 && parent.children[0] === nodeId) {
          const parentId = this.getNodeId(parent);
          if (parentId) {
            this.unwrapNode(parentId);
          }
        }
      }
    }
    // For rename, we don't need to undo - the new rename will overwrite
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
    matchingNodeIds: string[];
  } {
    if (nodeIds.length === 0) {
      return { lcaId: null, selectorTag: undefined, selectorDepth: undefined, matchingNodeIds: [] };
    }
    
    let lcaId = this.findLowestCommonAncestor(nodeIds);
    if (!lcaId) {
      return { lcaId: null, selectorTag: undefined, selectorDepth: undefined, matchingNodeIds: [] };
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

    // Case 4: Different tags AND different depths → no generalization
    if (!allSameTag && !allSameDepth) {
      return { 
        lcaId, 
        selectorTag: undefined, 
        selectorDepth: undefined, 
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

        if (tagMatches && depthMatches && currentDepth > 0) {
          results.push(currentId);
        }

        for (const childId of node.children) {
          traverse(childId, currentDepth + 1);
        }
      } else if (node.kind === 'value' && hasValues) {
        const depthMatches = selectorDepth === undefined || currentDepth === selectorDepth;
        if (depthMatches && currentDepth > 0) {
          results.push(currentId);
        }
      }
    };

    traverse(lcaId, 0);
    return { lcaId, selectorTag, selectorDepth, matchingNodeIds: results };
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
