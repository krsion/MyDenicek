import { makeStyles, mergeClasses } from "@fluentui/react-components";
import { type DenicekModel } from "@mydenicek/core-v2";
import { DENICEK_NODE_ID_ATTR } from "@mydenicek/react-v2";
import React from "react";

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


export function RenderedDocument({ model }: { model: DenicekModel; version?: unknown }) {
  const styles = useStyles();

  function renderById(id: string, path: string): React.ReactNode {
    const node = model.getNode(id);
    if (!node) return undefined;

    if (node.kind === "value") {
      return React.createElement('x-value', { [DENICEK_NODE_ID_ATTR]: id }, node.value);
    }

    const attrs = { ...(node.attrs || {}), [DENICEK_NODE_ID_ATTR]: id } as Record<string, unknown>;

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

    if (attrs["style"] && typeof attrs["style"] === "string") {
      try {
        attrs["style"] = JSON.parse(attrs["style"]);
      } catch {
        // If style is a string but not valid JSON, we remove it to avoid React warnings
        // about style being a string.
        delete attrs["style"];
      }
    }

    const renderedChildren: React.ReactNode[] = [];
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (!child) continue;
      const rendered = renderById(child, `${path}.${i}`);
      if (React.isValidElement(rendered)) renderedChildren.push(React.cloneElement(rendered as React.ReactElement<unknown>, { key: child }));
      else renderedChildren.push(rendered);
    }

    // Guard against empty tag names which cause React errors
    const tagName = node.tag || 'div';
    return React.createElement(tagName, attrs as Record<string, unknown>, ...renderedChildren);
  }

  // Model might not be ready initially if doc is loading
  if (!model) return null;

  return <>{renderById(model.rootId, "")}</>;
}
