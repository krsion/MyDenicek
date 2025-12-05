
export type ElementNode = {
  kind: "element";
  tag: string;
  attrs: Record<string, unknown>;
  children: string[];
}

export type ValueNode = {
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
    });

  return doc;
}
