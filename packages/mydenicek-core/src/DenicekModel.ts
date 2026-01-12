import { next as Automerge } from "@automerge/automerge";
import type { ElementNode, JsonDoc, Node, Transformation, ValueNode } from "./types";

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
    return this.doc.transformations || [];
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

  addTransformation(parent: string, type: "wrap" | "rename", tag: string): void {
    const nodes = this.doc.nodes;
    if (nodes[parent]?.kind !== "element") return;

    const current = this.latestVersionForParent(parent);
    const t: Transformation = { parent, version: current + 1, type, tag };
    this.doc.transformations.push(t);

    // Apply transformation to all current children
    this.applyTransformationsToChildren(parent);
  }

  /**
   * Applies all pending transformations to children of a given parent.
   * Should be called after sync to handle newly added children.
   */
  applyTransformationsToChildren(parentId: string): void {
    const nodes = this.doc.nodes;
    const parentNode = nodes[parentId];
    if (parentNode?.kind !== "element") return;

    const transformations = (this.doc.transformations || [])
      .filter(t => t.parent === parentId)
      .sort((a, b) => a.version - b.version);

    if (transformations.length === 0) return;

    // We need to iterate over a copy since wrap modifies the children array
    const childrenSnapshot = [...parentNode.children];

    for (const childId of childrenSnapshot) {
      const childNode = nodes[childId];
      if (!childNode) continue;

      const childVersion = childNode.version ?? 0;
      
      // Find transformations that haven't been applied to this child yet
      const pendingTransformations = transformations.filter(t => t.version > childVersion);
      
      for (const t of pendingTransformations) {
        if (t.type === "rename" && childNode.kind === "element") {
          childNode.tag = t.tag;
        }
        if (t.type === "wrap") {
          this.wrapNode(childId, t.tag);
        }
        // Update child's version to the latest applied transformation
        childNode.version = t.version;
      }
    }
  }

  /**
   * Applies all pending transformations across the entire document.
   * Should be called after each Automerge sync to handle new children.
   */
  applyAllPendingTransformations(): void {
    const transformations = this.doc.transformations || [];
    const parentIds = new Set(transformations.map(t => t.parent));
    
    for (const parentId of parentIds) {
      this.applyTransformationsToChildren(parentId);
    }
  }

  private latestVersionForParent(parent: string | null): number {
    const t = this.doc.transformations || [];
    let max = 0;
    for (const x of t) {
      if (x.parent === parent && x.version > max) max = x.version;
    }
    return max;
  }

  addChildNode(parent: ElementNode, child: Node, id?: string): string {
    const newId = id || `n_${this.getUUID()}`;
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
    this.doc.nodes[id] = node;
    
    for (const parent of this.getParents(siblingId)) {
      parent.children.splice(parent.children.indexOf(siblingId) + relativeIndex, 0, id);
    }
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
        transformations: [],
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
