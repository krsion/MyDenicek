import { makeStyles, mergeClasses } from "@fluentui/react-components";
import { type DenicekDocument, evaluateFormula, type GeneralizedPatch, getNodeValue, isFormulaError, type Operation } from "@mydenicek/core";
import { DENICEK_NODE_ID_ATTR, type FormulaViewMode } from "@mydenicek/react";
import React from "react";

import { defaultOperationsMap } from "./formula";

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
  formula: {
    display: "inline-block",
    backgroundColor: "#e8f4e8",
    padding: "2px 6px",
    borderRadius: "4px",
    fontFamily: "monospace",
    fontSize: "0.9em",
  },
  formulaError: {
    backgroundColor: "#ffe8e8",
    color: "#c00",
  },
  formulaStructure: {
    backgroundColor: "#f0f0ff",
    border: "1px dashed #aaf",
  },
  ref: {
    display: "inline-block",
    backgroundColor: "#fff8e0",
    padding: "2px 6px",
    borderRadius: "4px",
    fontStyle: "italic",
  },
  refTarget: {
    color: "#666",
    fontSize: "0.8em",
  },
});


interface RenderedDocumentProps {
  document: DenicekDocument;
  onActionClick?: (actions: GeneralizedPatch[], target: string) => void;
  /** View mode for formulas: "result" shows computed values, "formula" shows structure */
  viewMode?: FormulaViewMode;
  /** Custom operations map. If not provided, uses defaultOperationsMap */
  operations?: Map<string, Operation>;
  /** Callback when a ref link is clicked */
  onRefClick?: (targetId: string) => void;
  /** Node IDs that are currently cut (will be styled with dimmed appearance) */
  cutNodeIds?: string[];
}

export function RenderedDocument({ document, onActionClick, viewMode = "result", operations, onRefClick, cutNodeIds = [] }: RenderedDocumentProps) {
  const styles = useStyles();

  // Use provided operations or default ones
  const opsMap = React.useMemo(() => operations ?? defaultOperationsMap, [operations]);

  // Create formula context for evaluation
  const formulaContext = React.useMemo(() => ({
    operations: opsMap,
    document: {
      getNode: (id: string) => document.getNode(id) ?? undefined,
      getChildIds: (id: string) => document.getChildIds(id),
    },
  }), [opsMap, document]);

  // Sync input value to CRDT on Enter key (so copy can read the current value)
  const handleInputKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>, nodeId: string) => {
    if (e.key !== "Enter") return;
    const value = e.currentTarget.value;
    document.updateAttribute([nodeId], "data-copy-value", value);
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

    // Handle ref nodes
    if (node.kind === "ref") {
      const targetNode = document.getNode(node.target);
      const value = getNodeValue(node.target, formulaContext);
      const displayValue = isFormulaError(value) ? value : String(value ?? "");
      const targetLabel = targetNode?.kind === "value" ? `"${displayValue}"` :
        targetNode?.kind === "formula" ? `ƒ ${(targetNode as { operation: string }).operation}` :
          targetNode?.kind === "element" ? `<${(targetNode as { tag: string }).tag}>` :
            node.target.slice(0, 8);

      if (viewMode === "formula") {
        // Show the reference structure with clickable link
        return React.createElement(
          'x-ref',
          {
            [DENICEK_NODE_ID_ATTR]: id,
            className: styles.ref,
          },
          "→ ",
          React.createElement(
            'a',
            {
              href: "#",
              className: styles.refTarget,
              style: { cursor: 'pointer', textDecoration: 'underline' },
              onClick: (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                onRefClick?.(node.target);
              },
            },
            targetLabel
          )
        );
      } else {
        // Show the resolved value with clickable indicator
        return React.createElement(
          'x-ref',
          {
            [DENICEK_NODE_ID_ATTR]: id,
            className: mergeClasses(styles.ref, isFormulaError(value) ? styles.formulaError : undefined),
            title: `Click to go to: ${targetLabel}`,
            style: { cursor: 'pointer' },
            onClick: (e: React.MouseEvent) => {
              if (e.ctrlKey || e.metaKey) {
                e.stopPropagation();
                onRefClick?.(node.target);
              }
            },
          },
          displayValue,
          React.createElement(
            'span',
            {
              style: { fontSize: '0.7em', opacity: 0.6, marginLeft: 4 },
            },
            "↗"
          )
        );
      }
    }

    // Handle formula nodes
    if (node.kind === "formula") {
      if (viewMode === "formula") {
        // Show the formula structure: operation(arg1, arg2, ...)
        const childIds = document.getChildIds(id);
        const childElements = childIds.map((childId, idx) => {
          const rendered = renderById(childId);
          return React.createElement(
            'span',
            { key: childId },
            idx > 0 ? ", " : "",
            rendered
          );
        });

        return React.createElement(
          'x-formula',
          {
            [DENICEK_NODE_ID_ATTR]: id,
            className: mergeClasses(styles.formula, styles.formulaStructure),
          },
          `${node.operation}(`,
          ...childElements,
          ")"
        );
      } else {
        // Show the computed result
        const result = evaluateFormula(id, formulaContext);
        const displayValue = isFormulaError(result) ? result : String(result ?? "");
        return React.createElement(
          'x-formula',
          {
            [DENICEK_NODE_ID_ATTR]: id,
            className: mergeClasses(styles.formula, isFormulaError(result) ? styles.formulaError : undefined),
            title: `Formula: ${node.operation}`,
          },
          displayValue
        );
      }
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

    // Apply cut styling if this node is in the cut list
    const isCut = cutNodeIds.includes(id);

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

    // Apply cut node styling (dimmed with dashed border)
    if (isCut) {
      const existingStyle = (attrs["style"] as React.CSSProperties) || {};
      attrs["style"] = {
        ...existingStyle,
        opacity: 0.5,
        borderStyle: "dashed",
        borderWidth: existingStyle.borderWidth || "1px",
        borderColor: existingStyle.borderColor || "#999",
      };
    }

    // Add keydown handler for input elements to sync value to CRDT on Enter
    if (node.tag === "input") {
      attrs["onKeyDown"] = (e: React.KeyboardEvent<HTMLInputElement>) => handleInputKeyDown(e, id);
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
