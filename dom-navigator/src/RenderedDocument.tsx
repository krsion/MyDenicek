import React from "react";

import { buildMaps, type JsonDoc } from "./Document.ts";


export function RenderedDocument({ tree }: { tree: JsonDoc; }) {
  const { nodesById, childrenMap } = buildMaps(tree);

  function renderById(id: string, path: string): React.ReactNode {
    const node = nodesById.get(id);
    if (!node) return null;
    const children = childrenMap.get(node.id) || [];

    // If there's no tag, treat this as a text node or a fragment of children
    if (!node.tag) {
      if (node.value !== undefined) return node.value as React.ReactNode;
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
    const attrs = { ...(node.attrs || {}), "data-node-guid": node.id } as Record<string, unknown>;
    const renderedChildren: React.ReactNode[] = [];
    if (node.value !== undefined) renderedChildren.push(node.value as React.ReactNode);
    for (let i = 0; i < children.length; i++) {
      const e = children[i];
      const rendered = renderById(e.child, `${path}.${i}`);

      // Determine transformations for this parent
      const allTransforms = (tree.transformations || []).filter((t) => t.parent === node.id).sort((a, b) => a.version - b.version);
      const childVersion = e.version ?? 0;
      const toApply = allTransforms.filter((t) => t.version > childVersion);

      // Apply transforms in order to the rendered node (renderer-only)
      let transformed: React.ReactNode = rendered;
      for (const t of toApply) {
        if (t.type === "rename") {
          if (React.isValidElement(transformed) && typeof transformed.type === "string") {
            const el = transformed as React.ReactElement<unknown>;
            const props = { ...(el.props || {}) } as Record<string, unknown>;
            const childrenProp = (el.props as { children?: React.ReactNode }).children;
            transformed = React.createElement(t.tag, props as Record<string, unknown>, childrenProp as React.ReactNode);
          } else {
            // nothing to rename (text node or fragment)
          }
        } else if (t.type === "wrap") {
          transformed = React.createElement(t.tag, {}, transformed);
        }
      }

      if (React.isValidElement(transformed)) renderedChildren.push(React.cloneElement(transformed as React.ReactElement<unknown>, { key: e.child }));
      else renderedChildren.push(transformed);
    }
    return React.createElement(tag, attrs as Record<string, unknown>, ...renderedChildren);
  }

  const roots = childrenMap.get(null) || [];
  return <>{roots.map((r, i) => <React.Fragment key={r.child}>{renderById(r.child, `0.${i}`)}</React.Fragment>)}</>;
}
