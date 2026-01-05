import { type Patch } from "@automerge/automerge";

import type { ElementNode, JsonDoc, Node, Transformation, ValueNode } from "./types";

function parents(nodes: Record<string, Node>, childId: string): ElementNode[] {
  const parents = [];
  for (const [_, parentNode] of Object.entries(nodes)) {
    if (parentNode.kind == "element" && parentNode.children.includes(childId)) {
      parents.push(parentNode);
    }
  }
  return parents;
}

/**
 * Loops through transformations to find the latest transformation version for a given parent.
 */
function latestVersionForParent(doc: JsonDoc, parent: string | null) {
  const t = doc.transformations || [];
  let max = 0;
  for (const x of t) {
    if (x.parent === parent && x.version > max) max = x.version;
  }
  return max;
}

const getUUID = () => {
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : Date.now().toString(36);
};

export function wrapNode(nodes: Record<string, Node>, targetId: string, wrapperTag: string): void {
  let wrapperId = "w-"+targetId;
  while(nodes[wrapperId]) wrapperId = wrapperId + "_w";
  for (const parent of parents(nodes, targetId)) {
      parent.children[parent.children.indexOf(targetId)] = wrapperId;
  }
  nodes[wrapperId] =  { kind: "element", tag: wrapperTag, attrs: {}, children: [targetId] };
}

export function addTransformation(doc: JsonDoc, parent: string, type: "wrap" | "rename", tag: string) {
  const nodes = doc.nodes;
  if (nodes[parent]?.kind !== "element") return;

  const current = latestVersionForParent(doc, parent);
  const t: Transformation = { parent, version: current + 1, type, tag };
  doc.transformations.push(t);

  const children = nodes[parent].children;

  for (const childId of children) {
    const childNode = nodes[childId];
    if (t.type == "rename" && childNode?.kind == "element") {
      childNode.tag = t.tag;
    }
    if (t.type == "wrap") {
      wrapNode(doc.nodes, childId, t.tag);
    }
  }
}

export function addChildNode(nodes: Record<string, Node>, parent: ElementNode, child: Node) {
  const id = `n_${getUUID()}`;
  nodes[id] = child;
  parent.children.push(id);
  return id;
}

export function firstChildsTag(nodes: Record<string, Node>, node: ElementNode): string | undefined {
  if (!node.children[0]) return undefined;
  const childNode = nodes[node.children[0]];
  if (childNode?.kind === "element") {
    return childNode.tag;
  }
  return undefined; 
}

export class NodeWrapper {
  doc: JsonDoc;
  id: string;

  constructor(doc: JsonDoc, id: string) {
    this.doc = doc;
    this.id = id;
  }

  get node(): Node {
    const n = this.doc.nodes[this.id];
    if (!n) throw new Error(`Node ${this.id} not found`);
    return n;
  }

  addChild(tag: string, setup?: (w: NodeWrapper) => void): NodeWrapper {
    if (this.node.kind !== 'element') throw new Error("Cannot add child to value node");
    const child = addElementChildNode(this.doc, this.node as ElementNode, tag);
    if (setup) setup(child);
    return this;
  }

  addValue(value: string): NodeWrapper {
    if (this.node.kind !== 'element') throw new Error("Cannot add child to value node");
    addValueChildNode(this.doc, this.node as ElementNode, value);
    return this;
  }
  
  addChildren(tags: string[]): NodeWrapper {
      tags.forEach(tag => this.addChild(tag));
      return this;
  }
  
  withAttrs(attrs: Record<string, unknown>): NodeWrapper {
      const n = this.node;
      if (n.kind === 'element') {
          n.attrs = { ...n.attrs, ...attrs };
      }
      return this;
  }
}

export function addElementChildNode(doc: JsonDoc, parent: ElementNode, tag: string) {
  const node: Node = { kind: "element", tag, attrs: {}, children: [] };
  const id = addChildNode(doc.nodes, parent, node);
  return new NodeWrapper(doc, id);
}

export function addValueChildNode(doc: JsonDoc, parent: ElementNode, value: string) {
  const node: Node = { kind: "value", value };
  const id = addChildNode(doc.nodes, parent, node);
  return new NodeWrapper(doc, id);
}

function addSiblingNode(nodes: Record<string, Node>, relativeIndex: number, siblingId: string) {
  const sibling = nodes[siblingId];
  if (!sibling) return;
  const node: Node = sibling.kind === "element" ? { kind: "element", tag: sibling.tag, attrs: {}, children: [] } : { kind: "value", value: (sibling as ValueNode).value };
  const id = `n_${getUUID()}`;
  nodes[id] = node;
  for (const parent of  parents(nodes, siblingId)) {
    parent.children.splice(parent.children.indexOf(siblingId) + relativeIndex, 0, id);
  }
  return id;
}

export function addSiblingNodeBefore(nodes: Record<string, Node>, siblingId: string) {
  return addSiblingNode(nodes, 0, siblingId);
}

export function addSiblingNodeAfter(nodes: Record<string, Node>, siblingId: string) {
  return addSiblingNode(nodes, 1, siblingId);
}

function buildParentMap(nodes: Record<string, Node>): Record<string, string> {
  const parentMap: Record<string, string> = {};
  for (const [parentId, node] of Object.entries(nodes)) {
    if (node.kind === "element") {
      for (const childId of node.children) {
        parentMap[childId] = parentId;
      }
    }
  }
  return parentMap;
}

export function LowestCommonAncestor(doc: JsonDoc, nodeIds: string[]): string | null {
  if (nodeIds.length === 0) return null;
  const parentMap = buildParentMap(doc.nodes);
  
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
        currentLca = doc.root;
    }
  }

  return currentLca || null;
}

export function generalizeSelection(doc: JsonDoc, nodeIds: string[]): string[] {
  const lcaId = LowestCommonAncestor(doc, nodeIds);
  if (!lcaId) return [];

  const targetTags = new Set<string>();
  let matchAllValues = false;

  for (const id of nodeIds) {
    const node = doc.nodes[id];
    if (!node) continue;
    if (node.kind === 'element') {
      targetTags.add(node.tag);
    } else if (node.kind === 'value') {
      matchAllValues = true;
    }
  }

  const results: string[] = [];

  function traverse(currentId: string) {
    const node = doc.nodes[currentId];
    if (!node) return;

    if (node.kind === 'element') {
      if (targetTags.has(node.tag)) {
        results.push(currentId);
      }
      for (const childId of node.children) {
        traverse(childId);
      }
    } else if (node.kind === 'value' && matchAllValues) {
      results.push(currentId);
    }
  }

  traverse(lcaId);
  return results;
}

export function initialDocument(): JsonDoc | undefined {
  const rootId = 'n-root';
  const nodes: Record<string, Node> = {
      [rootId]: { kind: 'element', tag: 'section', attrs: {}, children: [] }
  };

  const doc: JsonDoc = {
    root: rootId,
    nodes,
    transformations: [],
  };

  new NodeWrapper(doc, rootId)
    .addChild('section', inner => {
        inner.withAttrs({ style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, 'data-testid': 'section' })
             .addChild('article', a => {
                 a.addChild('h2', h => h.addValue('Article A'))
                  .addChild('p', p => p.addValue('Lorem ipsum dolor sit amet, consectetur adipiscing elit.'))
                  .addChild('ul', ul => {
                      ul.addChild('li', li => li.addValue('Item A1'))
                        .addChild('li', li => li.addValue('Item A2'))
                        .addChild('li', li => li.addValue('Item A3'))
                  })
             })
             .addChild('article', b => {
                 b.addChild('h2', h => h.addValue('Article B'))
                  .addChild('p', p => p.addValue('Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'))
                  .addChild('div', div => {
                      div.withAttrs({ style: { display: 'flex', gap: 8 } })
                         .addChild('button', btn => btn.addValue('Button 1'))
                         .addChild('button', btn => btn.addValue('Button 2'))
                         .addChild('button', btn => btn.addValue('Button 3'))
                  })
             })
             .addChild('article', c => {
                 c.withAttrs({ style: { gridColumn: 'span 2' } })
                  .addChild('h2', h => h.addValue('Article C'))
                  .addChild('div', grid => {
                      grid.withAttrs({ style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 } });
                      Array.from({ length: 9 }).forEach((_, i) => {
                          grid.addChild('div', box => {
                              box.withAttrs({ style: { padding: 12, background: '#f7f7f7', border: '1px dashed #ccc', borderRadius: 6 } })
                                 .addValue(`Box ${i + 1}`)
                          })
                      })
                  })
             })
             .addChild('article', d => {
                 d.withAttrs({ style: { gridColumn: 'span 2' } })
                  .addChild('h2', h => h.addValue('Table Data'))
                  .addChild('table', t => {
                      t.withAttrs({ border: '1', style: { width: '100%', borderCollapse: 'collapse' } })
                       .addChild('thead', thead => {
                           thead.addChild('tr', tr => {
                               tr.addChild('th', th => th.addValue('Name'))
                                 .addChild('th', th => th.addValue('Role'))
                                 .addChild('th', th => th.addValue('Status'))
                           })
                       })
                       .addChild('tbody', tbody => {
                           tbody.addChild('tr', tr => {
                               tr.addChild('td', td => td.addValue('Alice'))
                                 .addChild('td', td => td.addValue('Developer'))
                                 .addChild('td', td => td.addValue('Active'))
                           })
                           .addChild('tr', tr => {
                               tr.addChild('td', td => td.addValue('Bob'))
                                 .addChild('td', td => td.addValue('Designer'))
                                 .addChild('td', td => td.addValue('Inactive'))
                           })
                       })
                  })
             })
    });

  return doc;
}

export function applyPatchesManual(d: JsonDoc, patches: Patch[]) {
  patches.forEach((patch, _i) => {
    let target: unknown = d;
    const path = patch.path;
    let i_path = 0;

    // Traverse path until we hit a primitive or end of path
    for (; i_path < path.length - 1; i_path++) {
      const part = path[i_path]!;
      const next = (target as Record<string | number, unknown>)[part];
      if (typeof next === 'string') {
        // Stop if next is string (primitive), so we can modify it on the parent
        break;
      }
      target = next;
    }

    const key = path[i_path]!;
    const remainingPath = path.slice(i_path + 1);
    const targetRecord = target as Record<string | number, unknown>;
    const targetArray = target as unknown[];

    if (patch.action === 'del') {
      if (Array.isArray(target)) {
        targetArray.splice(key as number, 1);
      } else {
        delete targetRecord[key];
      }
    } else if (patch.action === 'put') {
      targetRecord[key] = patch.value;
    } else if (patch.action === 'insert') {
      // Insert into array
      targetArray.splice(key as number, 0, ...patch.values);
    } else if (patch.action === 'splice') {
      // Splice string or array
      // If remainingPath has elements, the first one is likely the index
      const index = remainingPath.length > 0 ? remainingPath[0] as number : key as number;
      const value = patch.value;

      if (typeof targetRecord[key] === 'string') {
        const str = targetRecord[key] as string;
        // Simple string splice simulation
        targetRecord[key] = str.slice(0, index) + value + str.slice(index);
      } else if (Array.isArray(targetRecord[key])) {
        (targetRecord[key] as unknown[]).splice(index, 0, value);
      } else if (Array.isArray(target) && patch.action === 'splice') {
        (targetRecord[key] as unknown[]).splice(index, 0, value);
      }
    }
  });
}
