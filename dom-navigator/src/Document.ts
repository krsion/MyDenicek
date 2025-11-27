
type ElementNode = {
  kind: "element";
  tag: string;
  attrs: Record<string, unknown>;
  children: string[];
}

type ValueNode = {
  kind: "value";
  value: string;
};

export type Node = ElementNode | ValueNode;

export type JsonDoc = {
  root: string;
  nodes: Record<string, Node>;
  transformations: Transformation[];
};

type Transformation = {
  parent: string;
  version: number; // 1-based incrementing version for this parent
  type: "wrap" | "rename";
  tag: string;
};

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

function addChildNode(nodes: Record<string, Node>, parent: ElementNode, child: Node) {
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

export function addElementChildNode(doc: JsonDoc, parent: ElementNode, tag: string) {
  const node: Node = { kind: "element", tag, attrs: {}, children: [] };
  return addChildNode(doc.nodes, parent, node);
}

export function addValueChildNode(doc: JsonDoc, parent: ElementNode, value: string) {
  const node: Node = { kind: "value", value };
  return addChildNode(doc.nodes, parent, node);
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

export function initialDocument(): JsonDoc | undefined {
  const nodes: Record<string, Node> = {
      'n-root' : { kind: 'element', tag: 'section', attrs: {}, children: ['n-inner'] },
      'n-inner' : { kind: 'element', tag: 'section', children: ['article-a', 'article-b', 'article-c'], attrs: { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, 'data-testid': 'section' } },
      'article-a' : { kind: 'element', tag: 'article', attrs: {}, children: ['h2-a', 'p-a', 'ul-a'] },
      'h2-a' : { kind: 'element', tag: 'h2', attrs: {}, children: ['h2-a-val'] },
      'h2-a-val': { kind: 'value', value: 'Article A' },
      'p-a' : { kind: 'element', tag: 'p', attrs: {}, children: ['p-a-val'] },
      'p-a-val': { kind: 'value', value: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
      'ul-a' : { kind: 'element', tag: 'ul', attrs: {}, children: ['li-a1', 'li-a2', 'li-a3'] },
      'li-a1' : { kind: 'element', tag: 'li', attrs: {}, children: ['li-a1-val'] },
      'li-a1-val': { kind: 'value', value: 'Item A1' },
      'li-a2' : { kind: 'element', tag: 'li', attrs: {}, children: ['li-a2-val'] },
      'li-a2-val': { kind: 'value', value: 'Item A2' },
      'li-a3' : { kind: 'element', tag: 'li', attrs: {}, children: ['li-a3-val'] },
      'li-a3-val': { kind: 'value', value: 'Item A3' },
      'article-b' : { kind: 'element', tag: 'article', attrs: {}, children: ['h2-b', 'p-b', 'div-b-buttons'] },
      'h2-b' : { kind: 'element', tag: 'h2', attrs: {}, children: ['h2-b-val'] },
      'h2-b-val': { kind: 'value', value: 'Article B' },
      'p-b' : { kind: 'element', tag: 'p', attrs: {}, children: ['p-b-val'] },
      'p-b-val': { kind: 'value', value: 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.' },
      'div-b-buttons' : { kind: 'element', tag: 'div', children: ['btn1', 'btn2', 'btn3'], attrs: { style: { display: 'flex', gap: 8 } } },
      'btn1' : { kind: 'element', tag: 'button', attrs: {}, children: ['btn1-val'] },
      'btn1-val': { kind: 'value', value: 'Button 1' },
      'btn2' : { kind: 'element', tag: 'button', attrs: {}, children: ['btn2-val'] },
      'btn2-val': { kind: 'value', value: 'Button 2' },
      'btn3' : { kind: 'element', tag: 'button', attrs: {}, children: ['btn3-val'] },
      'btn3-val': { kind: 'value', value: 'Button 3' },
      'article-c' : { kind: 'element', tag: 'article', children: ['h2-c', 'grid-c'], attrs: { style: { gridColumn: 'span 2' } } },
      'h2-c' : { kind: 'element', tag: 'h2', attrs: {}, children: ['h2-c-val'] },
      'h2-c-val': { kind: 'value', value: 'Article C' },
      'grid-c' : { kind: 'element', tag: 'div', children: ['box-1', 'box-2', 'box-3', 'box-4', 'box-5', 'box-6', 'box-7', 'box-8', 'box-9'], attrs: { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 } } },
  };
  Array.from({ length: 9 }).map((_, i) => {
      const boxId = `box-${i + 1}`;
      const valId = `box-${i + 1}-val`;
      nodes[boxId] = { kind: 'element', tag: 'div', attrs: { style: { padding: 12, background: '#f7f7f7', border: '1px dashed #ccc', borderRadius: 6 } }, children: [valId] };
      nodes[valId] = { kind:'value', value: `Box ${i + 1}` };
  });


  return {
    root: 'n-root',
    nodes,
    transformations: [],
  };
}
