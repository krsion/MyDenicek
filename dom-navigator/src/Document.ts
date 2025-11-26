import { insertAfter as insertNodeAfter, insertBefore as insertNodeBefore, type OrderedDictionary, push as pushNode } from "./OrderedDictionary";

// Flat graph representation: nodes + edges
export type Node = {
  tag?: string; // element tag (e.g. 'div', 'p'); absent for text-only fragments
  attrs?: Record<string, unknown>;
  value?: string; // textual content
  children?: Record<string, boolean>; // child node ids
};

export type JsonDoc = {
  root: string | null;
  nodes: OrderedDictionary<string, Node>;
  transformations?: Transformation[];
};

export type Transformation = {
  parent: string | null;
  version: number; // 1-based incrementing version for this parent
  type: "wrap" | "rename";
  tag: string;
};

function parents(doc: JsonDoc, childId: string): (string | null)[] {
  const parents = [];
  const nodes = doc.nodes.entities;
  for (const parentId of Object.keys(nodes)) {
    if (nodes[parentId] && nodes[parentId].children && nodes[parentId].children[childId]) {
      parents.push(parentId);
    }
  }
  return parents;
}

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

export function wrapNode(doc: JsonDoc, targetId: string, wrapperTag: string): void {
  const nodes = doc.nodes;
  const wrapperId = "wrapper-"+targetId;
  for (const parentId of parents(doc, targetId)) {
    const parentNode = parentId ? nodes.entities[parentId] : null;
    if (parentNode && parentNode.children) {
      delete parentNode.children[targetId];
      parentNode.children[wrapperId] = true;
    }
  }
  insertNodeBefore(nodes, targetId, wrapperId, { tag: wrapperTag, attrs: {}, children: {[targetId]:true} });
}

export function renameNode(doc: JsonDoc, targetId: string, newTag: string): void {
  const node = doc.nodes.entities[targetId];
  if (!node) return;
  node.tag = newTag;
}

export function setNodeValue(doc: JsonDoc, targetId: string, value: string | undefined): void {
  const node = doc.nodes.entities[targetId];
  if (!node) return;
  if (value === undefined || value === null) {
    delete node.value;
  } else {
    node.value = value;
  }
}

export function addTransformation(doc: JsonDoc, parent: string | null, type: "wrap" | "rename", tag: string) {
  if (!parent) return;
  if (!doc.transformations) doc.transformations = [];
  const current = latestVersionForParent(doc, parent);
  const t: Transformation = { parent, version: current + 1, type, tag };
  doc.transformations.push(t);

  // eagerly apply the transformation to existing children of the parent
  const children = doc.nodes.entities[parent]?.children ? Object.keys(doc.nodes.entities[parent]!.children!) : [];
  for (const child of children) {
    if (t.type === "rename") {
      renameNode(doc, child, t.tag);
    } else if (t.type === "wrap") {
      wrapNode(doc, child, t.tag);
    }
  }
}

export function firstChildsTag(doc: JsonDoc, parentId: string): string | undefined {
  if (!doc.nodes.entities[parentId] || !doc.nodes.entities[parentId].children) return undefined;
  const children = doc.nodes.entities[parentId].children;
  for (const childId of Object.keys(children)) {
    if (children[childId]) {
      const childTag = doc.nodes.entities[childId].tag;
      if (childTag) return childTag;
    }
  }
  return undefined; 
}

export function addChildNode(doc: JsonDoc, parentId: string | null, tag: string) {
  if (!parentId) return;
  const nodes = doc.nodes;
  const id = `n_${getUUID()}`;
  const node: Node = { tag, attrs: {} };
  pushNode(nodes, id, node);
  if (!doc.nodes.entities[parentId].children) doc.nodes.entities[parentId].children = {};
  doc.nodes.entities[parentId].children[id] = true;
  return id;
}

export function addSiblingNodeBefore(doc: JsonDoc, siblingId: string, tag: string) {
  const nodes = doc.nodes;
  const id = `n_${getUUID()}`;
  const node: Node = { tag, attrs: {} };
  
  insertNodeBefore(nodes, siblingId, id, node);
  
  const parentIds = parents(doc, siblingId);
  for (const parentId of parentIds) {
    if (parentId && doc.nodes.entities[parentId]) {
       if (!doc.nodes.entities[parentId].children) doc.nodes.entities[parentId].children = {};
       doc.nodes.entities[parentId].children[id] = true;
    }
  }
  return id;
}

export function addSiblingNodeAfter(doc: JsonDoc, siblingId: string, tag: string) {
  const nodes = doc.nodes;
  const id = `n_${getUUID()}`;
  const node: Node = { tag, attrs: {} };
  
  insertNodeAfter(nodes, siblingId, id, node);
  
  const parentIds = parents(doc, siblingId);
  for (const parentId of parentIds) {
    if (parentId && doc.nodes.entities[parentId]) {
       if (!doc.nodes.entities[parentId].children) doc.nodes.entities[parentId].children = {};
       doc.nodes.entities[parentId].children[id] = true;
    }
  }
  return id;
}

export type ConflictParent = { parent: string | null; peerId?: string | null };

export type Conflict = {
  child: string;
  parents: ConflictParent[];
  // chosen parent according to deterministic rule (smallest key)
  chosenParent: string | null;
};

export function initialDocument(): JsonDoc | undefined {
  const nodesEntities: Record<string, Node> = {
      'n-root' : {tag: 'section', children: {'n-inner': true} },
      'n-inner' : {tag: 'section', children: {'article-a': true, 'article-b': true, 'article-c': true}, attrs: { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, 'data-testid': 'section' } },
      'article-a' : {tag: 'article', children: {'h2-a': true, 'p-a': true, 'ul-a': true} },
      'h2-a' : {tag: 'h2', value: 'Article A' },
      'p-a' : {tag: 'p', value: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
      'ul-a' : {tag: 'ul', children: {'li-a1': true, 'li-a2': true, 'li-a3': true} },
      'li-a1' : {tag: 'li', value: 'Item A1' },
      'li-a2' : {tag: 'li', value: 'Item A2' },
      'li-a3' : {tag: 'li', value: 'Item A3' },
      'article-b' : {tag: 'article', children: {'h2-b': true, 'p-b': true, 'div-b-buttons': true} },
      'h2-b' : {tag: 'h2', value: 'Article B' },
      'p-b' : {tag: 'p', value: 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.' },
      'div-b-buttons' : {tag: 'div', children: {'btn1': true, 'btn2': true, 'btn3': true}, attrs: { style: { display: 'flex', gap: 8 } } },
      'btn1' : {tag: 'button', value: 'Button 1' },
      'btn2' : {tag: 'button', value: 'Button 2' },
      'btn3' : {tag: 'button', value: 'Button 3' },
      'article-c' : {tag: 'article', children: {'h2-c': true, 'grid-c': true}, attrs: { style: { gridColumn: 'span 2' } } },
      'h2-c' : {tag: 'h2', value: 'Article C' },
      'grid-c' : {tag: 'div', children: {'box-1': true, 'box-2': true, 'box-3': true, 'box-4': true, 'box-5': true, 'box-6': true, 'box-7': true, 'box-8': true, 'box-9': true}, attrs: { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 } } },
  };
  Array.from({ length: 9 }).map((_, i) => (nodesEntities[`box-${i + 1}`] = { tag: 'div', attrs: { style: { padding: 12, background: '#f7f7f7', border: '1px dashed #ccc', borderRadius: 6 } }, value: `Box ${i + 1}` }));
  const nodesOrders = Object.keys(nodesEntities);

  const nodes: OrderedDictionary<string, Node> = {entities: nodesEntities, order: nodesOrders};

  return {
    root: 'n-root',
    nodes,
  };
}
