import React from "react";

import { type JsonDoc } from "./Document.ts";


export function RenderedDocument({ tree }: { tree: JsonDoc; }) {

  function renderById(id: string, path: string): React.ReactNode {
    const node = tree.nodes.entities[id];
    if (!node) return null;
    const children = tree.nodes.entities[id].children ? Object.keys(tree.nodes.entities[id].children) : [];
    // order the children by the global order in tree.nodes.order
    children.sort((a, b) => tree.nodes.order.indexOf(a) - tree.nodes.order.indexOf(b));
    if (!node.tag) {
      if (node.value !== undefined) return node.value as React.ReactNode;
      return (
        <>
          {children.map((child, i) => (
            <React.Fragment key={child}>{renderById(child, `${path}.${i}`)}</React.Fragment>
          ))}
        </>
      );
    }

    // Render as an element; if node.value exists, render it before children
    const attrs = { ...(node.attrs || {}), "data-node-guid": id } as Record<string, unknown>;
    const renderedChildren: React.ReactNode[] = [];
    if (node.value !== undefined) renderedChildren.push(node.value as React.ReactNode);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const rendered = renderById(child, `${path}.${i}`);

      if (React.isValidElement(rendered)) renderedChildren.push(React.cloneElement(rendered as React.ReactElement<unknown>, { key: child }));
      else renderedChildren.push(rendered);
    }
    return React.createElement(node.tag, attrs as Record<string, unknown>, ...renderedChildren);
  }

  return <>{renderById(tree.root!, "")}</>;
}
