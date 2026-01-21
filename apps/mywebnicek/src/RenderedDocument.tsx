import { makeStyles, mergeClasses } from "@fluentui/react-components";
import { type DenicekDocument, type GeneralizedPatch } from "@mydenicek/core";
import { DENICEK_NODE_ID_ATTR } from "@mydenicek/react";
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


interface RenderedDocumentProps {
  document: DenicekDocument;
  version?: unknown;
  onActionClick?: (actions: GeneralizedPatch[], target: string) => void;
}

export function RenderedDocument({ document, onActionClick }: RenderedDocumentProps) {
  const styles = useStyles();

  // Sync input value to CRDT on blur (so copy can read the current value)
  const handleInputBlur = React.useCallback((e: React.FocusEvent<HTMLInputElement>, nodeId: string) => {
    const value = e.target.value;
    document.change((model) => {
      model.updateAttribute(nodeId, "data-copy-value", value);
    });
  }, [document]);

  // Handler for action button clicks
  const handleActionClick = React.useCallback((nodeId: string) => {
    const node = document.getNode(nodeId);
    if (!node || node.kind !== "action") return;

    // Get the action node's script and target
    const { actions, target } = node;
    if (!actions.length || !target) return;

    // Call the handler or replay directly
    if (onActionClick) {
      onActionClick(actions, target);
    } else {
      // Fallback: replay directly on the document
      document.replay(actions, target);
    }
  }, [document, onActionClick]);

  function renderById(id: string): React.ReactNode {
    const node = document.getNode(id);
    if (!node) return undefined;

    if (node.kind === "value") {
      return React.createElement('x-value', { [DENICEK_NODE_ID_ATTR]: id }, node.value);
    }

    // Handle action nodes - render as buttons
    if (node.kind === "action") {
      return React.createElement(
        'button',
        {
          [DENICEK_NODE_ID_ATTR]: id,
          className: styles.button,
          onClick: (e: React.MouseEvent) => {
            // Allow Ctrl+click/Shift+click for selection (don't execute)
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
              return; // Let event bubble for selection
            }
            e.stopPropagation();  // Don't trigger selection on regular click
            handleActionClick(id);
          },
          title: `Target: ${node.target}`,
        },
        node.label
      );
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

    // Add blur handler for input elements to sync value to CRDT
    if (node.tag === "input") {
      attrs["onBlur"] = (e: React.FocusEvent<HTMLInputElement>) => handleInputBlur(e, id);
    }

    const childIds = document.getChildIds(id);
    const renderedChildren: React.ReactNode[] = [];
    for (const childId of childIds) {
      const rendered = renderById(childId);
      if (React.isValidElement(rendered)) {
        renderedChildren.push(React.cloneElement(rendered as React.ReactElement<unknown>, { key: childId }));
      } else {
        renderedChildren.push(rendered);
      }
    }

    // Guard against empty tag names which cause React errors
    const tagName = node.tag || 'div';
    return React.createElement(tagName, attrs as Record<string, unknown>, ...renderedChildren);
  }

  // Document might not be ready initially if doc is loading
  const rootId = document?.getRootId();
  if (!rootId) return null;

  return <>{renderById(rootId)}</>;
}
