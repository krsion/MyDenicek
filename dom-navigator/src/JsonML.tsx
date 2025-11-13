import React from "react";

// Flexible JsonML type: [tagName, (attributesObject | childNode) ...]
// Attributes object is detected if first non-tag element is a plain object.
export type JsonMLNode = string | [string, ...(Record<string, any> | JsonMLNode)[]];

// Internal render with path propagation.
function renderNode(node: JsonMLNode, path: string): React.ReactNode {
  if (typeof node === "string") return node;
  const [tag, ...rest] = node;
  let attrs: Record<string, any> | undefined;
  let children: JsonMLNode[] = rest as JsonMLNode[];
  if (rest.length && typeof rest[0] === "object" && !Array.isArray(rest[0]) && !React.isValidElement(rest[0])) {
    attrs = { ...(rest[0] as Record<string, any>) }; // clone so we can augment
    children = rest.slice(1) as JsonMLNode[];
  }
  // Add path attribute for mapping back DOM -> JsonML node
  attrs = { ...(attrs || {}), "data-jsonml-path": path };
  return React.createElement(
    tag,
    attrs,
    ...children.map((c, i) => {
      const childPath = `${path}.${i}`;
      const rendered = renderNode(c, childPath);
      if (Array.isArray(c) && React.isValidElement(rendered)) {
        return React.cloneElement(rendered, { key: i });
      }
      return rendered;
    })
  );
}

export function JsonMLRenderer({ tree }: { tree: JsonMLNode }) {
  return <>{renderNode(tree, "0")}</>;
}

// Helper to wrap a node at path with a new tag
export function wrapJsonML(tree: JsonMLNode, path: string, wrapperTag: string): JsonMLNode {
  if (!/^\d+(\.\d+)*$/.test(path)) return tree; // invalid path
  const indices = path.split(".").map(Number);
  function wrapRecursive(node: JsonMLNode, depth: number): JsonMLNode {
    if (typeof node === "string") return node; // cannot wrap a text node
    if (depth === indices.length - 1) {
      // target node
      return [wrapperTag, {}, node];
    }
    const [tag, ...rest] = node;
    let attrs: Record<string, any> | undefined;
    let children: JsonMLNode[] = rest as JsonMLNode[];
    if (rest.length && typeof rest[0] === "object" && !Array.isArray(rest[0]) && !React.isValidElement(rest[0])) {
      attrs = rest[0] as Record<string, any>;
      children = rest.slice(1) as JsonMLNode[];
    }
    const childIndex = indices[depth + 1];
    const newChildren = children.map((c, i) => (i === childIndex ? wrapRecursive(c, depth + 1) : c));
    return attrs ? [tag, attrs, ...newChildren] : [tag, ...newChildren];
  }
  return wrapRecursive(tree, 0);
}
