// Flat graph representation: nodes + edges
export type Node = {
  id: string;
  tag?: string; // element tag (e.g. 'div', 'p'); absent for text-only fragments
  attrs?: Record<string, any>;
  value?: string | number; // textual content
};

export type Edge = {
  parent: string | null; // null => root-level
  child: string; // node id
  version?: number; // version of transformations applied when this child was added
};

export type JsonDoc = {
  nodes: Node[];
  edges: Edge[];
  transformations?: Transformation[];
};

export type Transformation = {
  parent: string | null;
  version: number; // 1-based incrementing version for this parent
  type: "wrap" | "rename";
  tag: string;
};

export function buildMaps(doc: JsonDoc) {
  const nodesById = new Map<string, Node>(doc.nodes.map((n) => [n.id, n] as [string, Node]));
  const nodesOrder = new Map<string, number>(doc.nodes.map((n, i) => [n.id, i]));
  const childrenMap = new Map<string | null, Edge[]>();
  for (const e of doc.edges) {
    const arr = childrenMap.get(e.parent) || [];
    arr.push(e);
    childrenMap.set(e.parent, arr);
  }
  // sort children by position in nodes list
  for (const arr of childrenMap.values()) arr.sort((a, b) => (nodesOrder.get(a.child) ?? 0) - (nodesOrder.get(b.child) ?? 0));
  return { nodesById, childrenMap };
}

function latestVersionForParent(doc: JsonDoc, parent: string | null) {
  const t = doc.transformations || [];
  let max = 0;
  for (const x of t) {
    if (x.parent === parent && x.version > max) max = x.version;
  }
  return max;
}

export function wrapNode(doc: JsonDoc, targetId: string, wrapperTag: string, appliedVersion?: number): void {
  const nodes = doc.nodes;
  const edges = doc.edges;

  const targetIndex = nodes.findIndex((n) => n.id === targetId);
  if (targetIndex === -1) return;

  const wrapperId = `w_${typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Date.now().toString(36)}`;
  nodes.splice(targetIndex, 0, { id: wrapperId, tag: wrapperTag, attrs: {} });

  const parentEdgeIndex = edges.findIndex((e) => e.child === targetId);
  const parent = parentEdgeIndex >= 0 ? edges[parentEdgeIndex].parent : null;

  const parentEdgeVersion = appliedVersion ?? latestVersionForParent(doc, parent);

  if (parentEdgeIndex >= 0) {
    // replace parent->target with parent->wrapper
    edges.splice(parentEdgeIndex, 1, { parent, child: wrapperId, version: parentEdgeVersion });
  } else {
    edges.push({ parent: null, child: wrapperId, version: parentEdgeVersion });
  }

  // wrapper -> target
  const wrapperEdgeVersion = appliedVersion ?? latestVersionForParent(doc, wrapperId);
  edges.push({ parent: wrapperId, child: targetId, version: wrapperEdgeVersion });
}

export function renameNode(doc: JsonDoc, targetId: string, newTag: string): void {
  const node = doc.nodes.find((n) => n.id === targetId);
  if (!node) return;
  node.tag = newTag;
}

export function setNodeValue(doc: JsonDoc, targetId: string, value: string | number | undefined): void {
  const node = doc.nodes.find((n) => n.id === targetId);
  if (!node) return;
  if (value === undefined || value === null) {
    delete node.value;
  } else {
    node.value = value;
  }
}

export function addTransformation(doc: JsonDoc, parent: string | null, type: "wrap" | "rename", tag: string) {
  if (!doc.transformations) doc.transformations = [];
  const current = latestVersionForParent(doc, parent);
  const t: Transformation = { parent, version: current + 1, type, tag };
  doc.transformations.push(t);

  // eagerly apply the transformation to existing children of the parent
  const edges = doc.edges;
  const children = edges.filter((e) => e.parent === parent);
  for (const e of children) {
    const childVersion = e.version ?? 0;
    if (childVersion >= t.version) continue;

    if (t.type === "rename") {
      renameNode(doc, e.child, t.tag);

      // mark this child as having seen the transformation
      // find the edge object in edges and update its version
      const idx = edges.findIndex((x) => x.parent === e.parent && x.child === e.child);
      if (idx >= 0) edges[idx].version = t.version;
    } else if (t.type === "wrap") {
      // wrapping may replace the parent->child edge with parent->wrapper and add wrapper->child
      // wrapNode accepts an optional appliedVersion to stamp created edges
      wrapNode(doc, e.child, t.tag, t.version);
    }
  }
}

export function addChildNode(doc: JsonDoc, parentId: string | null, tag: string) {
  const nodes = doc.nodes;
  const edges = doc.edges;
  const id = `n_${typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Date.now().toString(36)}`;
  const node: Node = { id, tag, attrs: {} };
  nodes.push(node);

  // when adding a new child, set its edge.version to the latest available version for the parent
  const version = latestVersionForParent(doc, parentId);
  edges.push({ parent: parentId, child: id, version });
  return id;
}

export function initialDocument(): JsonDoc | undefined {
  return {
    nodes: [
      { id: 'n-root', tag: 'section' },
      { id: 'n-inner', tag: 'section', attrs: { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, 'data-testid': 'section' } },

      // Article A
      { id: 'article-a', tag: 'article', attrs: { style: { padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #ddd' }, 'data-testid': 'article-a' } },
      { id: 'h2-a', tag: 'h2', value: 'Article A' },
      { id: 'p-a', tag: 'p', value: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
      { id: 'ul-a', tag: 'ul' },
      { id: 'li-a1', tag: 'li', value: 'Item A1' },
      { id: 'li-a2', tag: 'li', value: 'Item A2' },
      { id: 'li-a3', tag: 'li', value: 'Item A3' },

      // Article B
      { id: 'article-b', tag: 'article', attrs: { style: { padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #ddd' }, 'data-testid': 'article-b' } },
      { id: 'h2-b', tag: 'h2', value: 'Article B' },
      { id: 'p-b', tag: 'p', value: 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.' },
      { id: 'div-b-buttons', tag: 'div', attrs: { style: { display: 'flex', gap: 8 } } },
      { id: 'btn1', tag: 'button', value: 'Button 1' },
      { id: 'btn2', tag: 'button', value: 'Button 2' },
      { id: 'btn3', tag: 'button', value: 'Button 3' },

      // Article C (spans two columns)
      { id: 'article-c', tag: 'article', attrs: { style: { padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #ddd', gridColumn: 'span 2' }, 'data-testid': 'article-c' } },
      { id: 'h2-c', tag: 'h2', value: 'Article C' },
      { id: 'grid-c', tag: 'div', attrs: { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 } } },
      // boxes (box-1 .. box-9)
      ...Array.from({ length: 9 }).map((_, i) => ({ id: `box-${i + 1}`, tag: 'div', attrs: { style: { padding: 12, background: '#f7f7f7', border: '1px dashed #ccc', borderRadius: 6 } }, value: `Box ${i + 1}` }))
    ],
    edges: [
      // root -> inner
      { parent: 'n-root', child: 'n-inner' },
      { parent: null, child: 'n-root' },

      // inner -> articles
      { parent: 'n-inner', child: 'article-a' },
      { parent: 'n-inner', child: 'article-b' },
      { parent: 'n-inner', child: 'article-c' },

      // article-a children
      { parent: 'article-a', child: 'h2-a' },
      { parent: 'article-a', child: 'p-a' },
      { parent: 'article-a', child: 'ul-a' },
      { parent: 'ul-a', child: 'li-a1' }, { parent: 'ul-a', child: 'li-a2' }, { parent: 'ul-a', child: 'li-a3' },

      // article-b children
      { parent: 'article-b', child: 'h2-b' },
      { parent: 'article-b', child: 'p-b' },
      { parent: 'article-b', child: 'div-b-buttons' },
      { parent: 'div-b-buttons', child: 'btn1' }, { parent: 'div-b-buttons', child: 'btn2' }, { parent: 'div-b-buttons', child: 'btn3' },

      // article-c children
      { parent: 'article-c', child: 'h2-c' },
      { parent: 'article-c', child: 'grid-c' },
      // grid children: boxes
      ...Array.from({ length: 9 }).map((_, i) => ({ parent: 'grid-c', child: `box-${i + 1}` }))
    ]
  };
}
