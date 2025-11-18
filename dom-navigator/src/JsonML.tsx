import React from "react";

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
};

export type JsonDoc = {
  nodes: Node[];
  edges: Edge[];
};

function buildMaps(doc: JsonDoc) {
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

export function JsonMLRenderer({ tree }: { tree: JsonDoc }) {
  const { nodesById, childrenMap } = buildMaps(tree);

  function renderById(id: string, path: string): React.ReactNode {
    const node = nodesById.get(id);
    if (!node) return null;
    const children = childrenMap.get(node.id) || [];

    // If there's no tag, treat this as a text node or a fragment of children
    if (!node.tag) {
      if (node.value !== undefined) return node.value as any;
      return (
        <>
          {children.map((e, i) => (
            <React.Fragment key={e.child}>{renderById(e.child, `${path}.${i}`)}</React.Fragment>
          ))}
        </>
      );
    }

    // Render as an element; if node.value exists, render it before children
    const tag = node.tag;
    const attrs = { ...(node.attrs || {}), "data-jsonml-path": node.id } as Record<string, any>;
    const renderedChildren: React.ReactNode[] = [];
    if (node.value !== undefined) renderedChildren.push(node.value as any);
    for (let i = 0; i < children.length; i++) {
      const e = children[i];
      const rendered = renderById(e.child, `${path}.${i}`);
      if (React.isValidElement(rendered)) renderedChildren.push(React.cloneElement(rendered, { key: e.child }));
      else renderedChildren.push(rendered);
    }
    return React.createElement(tag, attrs, ...renderedChildren);
  }

  const roots = childrenMap.get(null) || [];
  return <>{roots.map((r, i) => <React.Fragment key={r.child}>{renderById(r.child, `0.${i}`)}</React.Fragment>)}</>;
}

// Pure functional wrapper: returns a new JsonDoc (does not mutate input)
export function wrapJsonML(doc: JsonDoc, targetId: string, wrapperTag: string): JsonDoc {
  const nodes = doc.nodes.slice();
  const edges = doc.edges.slice();

  const targetIndex = nodes.findIndex((n) => n.id === targetId);
  if (targetIndex === -1) return doc;

  const wrapperId = `w_${typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Date.now().toString(36)}`;
  // insert wrapper just before target so node-order determines children order
  nodes.splice(targetIndex, 0, { id: wrapperId, tag: wrapperTag, attrs: {} });

  const parentEdgeIndex = edges.findIndex((e) => e.child === targetId);
  const parent = parentEdgeIndex >= 0 ? edges[parentEdgeIndex].parent : null;

  const newEdges = edges.slice();
  if (parentEdgeIndex >= 0) newEdges.splice(parentEdgeIndex, 1);
  newEdges.push({ parent, child: wrapperId });
  newEdges.push({ parent: wrapperId, child: targetId });

  return { nodes, edges: newEdges };
}

// Mutable variant for use inside Automerge `change` callbacks. Mutates doc in-place.
export function wrapJsonMLMutable(doc: JsonDoc, targetId: string, wrapperTag: string): void {
  const nodes = doc.nodes;
  const edges = doc.edges;

  const targetIndex = nodes.findIndex((n) => n.id === targetId);
  if (targetIndex === -1) return;

  const wrapperId = `w_${typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Date.now().toString(36)}`;
  nodes.splice(targetIndex, 0, { id: wrapperId, tag: wrapperTag, attrs: {} });

  const parentEdgeIndex = edges.findIndex((e) => e.child === targetId);
  const parent = parentEdgeIndex >= 0 ? edges[parentEdgeIndex].parent : null;

  if (parentEdgeIndex >= 0) {
    // replace parent->target with parent->wrapper
    edges.splice(parentEdgeIndex, 1, { parent, child: wrapperId });
  } else {
    edges.push({ parent: null, child: wrapperId });
  }

  // wrapper -> target
  edges.push({ parent: wrapperId, child: targetId });
}
