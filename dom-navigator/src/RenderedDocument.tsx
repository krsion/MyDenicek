import { makeStyles, mergeClasses } from "@fluentui/react-components";
import React from "react";

import { type JsonDoc } from "./Document.ts";

const useStyles = makeStyles({
  article: {
    padding: "12px",
    background: "#fff",
    borderRadius: "8px",
    border: "1px solid #ddd",
  },
  button: {
    padding: "6px 12px",
    cursor: "pointer",
  },
  ul: {
    padding: "0 0 0 20px",
  },
  li: {
    margin: "4px 0",
  },
  table: {
    borderCollapse: "collapse",
    width: "100%",
  },
  th: {
    border: "1px solid #ddd",
    padding: "8px",
    backgroundColor: "#f2f2f2",
    textAlign: "left",
  },
  td: {
    border: "1px solid #ddd",
    padding: "8px",
  },
  tr: {
    "&:nth-child(even)": {
      backgroundColor: "#f9f9f9",
    },
  },

});


export function RenderedDocument({ tree }: { tree: JsonDoc; }) {
  const styles = useStyles();

  function renderById(id: string, path: string): React.ReactNode {
    const node = tree.nodes[id];
    if (!node) return undefined;

    if (node.kind === "value") {
      return React.createElement('x-value', { 'data-node-guid': id }, node.value);
    }

    const attrs = { ...(node.attrs || {}), "data-node-guid": id } as Record<string, unknown>;

    const classNames = [];
    if (node.tag === "article") classNames.push(styles.article);
    if (node.tag === "button") classNames.push(styles.button);
    if (node.tag === "ul") classNames.push(styles.ul);
    if (node.tag === "li") classNames.push(styles.li);
    if (node.tag === "table") classNames.push(styles.table);
    if (node.tag === "th") classNames.push(styles.th);
    if (node.tag === "td") classNames.push(styles.td);
    if (node.tag === "tr") classNames.push(styles.tr);

    if (attrs["className"] && typeof attrs["className"] === "string") {
      classNames.push(attrs["className"]);
    }
    if (classNames.length > 0) attrs["className"] = mergeClasses(...classNames);

    const renderedChildren: React.ReactNode[] = [];
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (!child) continue;
      const rendered = renderById(child, `${path}.${i}`);
      if (React.isValidElement(rendered)) renderedChildren.push(React.cloneElement(rendered as React.ReactElement<unknown>, { key: child }));
      else renderedChildren.push(rendered);
    }
    return React.createElement(node.tag, attrs as Record<string, unknown>, ...renderedChildren);
  }

  return <>{renderById(tree.root!, "")}</>;
}
