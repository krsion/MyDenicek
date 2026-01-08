import { next as Automerge } from "@automerge/automerge";

import type { ElementNode, JsonDoc, Node, Transformation, ValueNode } from "./types";

function calculateSplice(oldVal: string, newVal: string) {
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

export function updateValue(doc: JsonDoc, id: string, newValue: string, originalValue: string) {
    const { index, deleteCount, insertText } = calculateSplice(originalValue, newValue);
    const node = doc.nodes[id];
    if (node?.kind === "value") {
        if (index === 0 && deleteCount === originalValue.length && insertText === newValue) {
            node.value = newValue;
        } else {
            const safeIndex = Math.min(index, node.value.length);
            Automerge.splice(doc, ['nodes', id, 'value'], safeIndex, deleteCount, insertText);
        }
    }
}

export function parents(nodes: Record<string, Node>, childId: string): ElementNode[] {
  const parents = [];
  for (const [_, parentNode] of Object.entries(nodes)) {
    if (parentNode.kind == "element" && parentNode.children.includes(childId)) {
      parents.push(parentNode);
    }
  }
  return parents;
}

export function updateAttribute(nodes: Record<string, Node>, id: string, key: string, value: unknown | undefined) {
  const node = nodes[id];
  if (node && node.kind === "element") {
    if (value === undefined) {
      delete node.attrs[key];
    } else {
      node.attrs[key] = value;
    }
  }
}

export function updateTag(nodes: Record<string, Node>, id: string, newTag: string) {
  const node = nodes[id];
  if (node && node.kind === "element") {
    node.tag = newTag;
  }
}

export function deleteNode(nodes: Record<string, Node>, id: string) {
  const parentNodes = parents(nodes, id);
  for (const parent of parentNodes) {
      const idx = parent.children.indexOf(id);
      if (idx !== -1) {
          parent.children.splice(idx, 1);
      }
  }
}

function latestVersionForParent(doc: JsonDoc, parent: string | null) {
  const t = doc.transformations || [];
  let max = 0;
  for (const x of t) {
    if (x.parent === parent && x.version > max) max = x.version;
  }
  return max;
}

export const getUUID = () => {
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

export function addChildNode(nodes: Record<string, Node>, parent: ElementNode, child: Node, id?: string) {
  const newId = id || `n_${getUUID()}`;
  nodes[newId] = child;
  parent.children.push(newId);
  return newId;
}

export function firstChildsTag(nodes: Record<string, Node>, node: ElementNode): string | undefined {
  if (!node.children[0]) return undefined;
  const childNode = nodes[node.children[0]];
  if (childNode?.kind === "element") {
    return childNode.tag;
  }
  return undefined; 
}



export function addElementChildNode(doc: JsonDoc, parent: ElementNode, tag: string, id?: string) {
  const node: Node = { kind: "element", tag, attrs: {}, children: [] };
  const newId = addChildNode(doc.nodes, parent, node, id);
  return newId;
}

export function addValueChildNode(doc: JsonDoc, parent: ElementNode, value: string, id?: string) {
  const node: Node = { kind: "value", value };
  const newId = addChildNode(doc.nodes, parent, node, id);
  return newId;
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

  function add(parentId: string, tag: string, setup?: (id: string, node: ElementNode) => void) {
      const parentNode = nodes[parentId] as ElementNode;
      const id = addElementChildNode(doc, parentNode, tag);
      if (setup) setup(id, nodes[id] as ElementNode);
      return id;
  }

  function addVal(parentId: string, value: string) {
      const parentNode = nodes[parentId] as ElementNode;
      return addValueChildNode(doc, parentNode, value);
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

