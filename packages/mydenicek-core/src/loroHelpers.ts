/**
 * Loro helper functions and constants
 * Internal utilities for working with Loro CRDT types
 */

import { LoroDoc, LoroList, LoroMap, LoroText, LoroTreeNode, type TreeID } from "loro-crdt";

import type { ActionNode, ElementNode, FormulaNode, GeneralizedPatch, Node, NodeData, RefNode, ValueNode } from "./types.js";

/**
 * Internal constants for Loro container names
 */
export const TREE_CONTAINER = "tree";

/**
 * Node data keys
 */
export const NODE_KIND = "kind";
export const NODE_TAG = "tag";
export const NODE_ATTRS = "attrs";
export const NODE_TEXT = "text";
export const NODE_SOURCE_ID = "sourceId";

/**
 * Action node data keys
 */
export const NODE_LABEL = "label";
export const NODE_ACTIONS = "actions";
export const NODE_TARGET = "target";

/**
 * Formula node data keys
 */
export const NODE_OPERATION = "operation";

/**
 * Ref node data keys
 */
export const NODE_REF_TARGET = "refTarget";

/**
 * Convert TreeID to a stable string ID for our public API
 */
export function treeIdToString(id: TreeID): string {
    return id;
}

/**
 * Parse our string ID back to TreeID
 */
export function stringToTreeId(id: string): TreeID {
    if (!id.includes("@")) {
        throw new Error(`Invalid TreeID format: ${id}`);
    }
    return id as TreeID;
}

/**
 * Convert a LoroTreeNode to our public Node type
 */
export function loroNodeToNode(treeNode: LoroTreeNode): Node {
    const data = treeNode.data;
    const kind = data.get(NODE_KIND) as "element" | "value" | "action" | "ref" | "formula" | undefined;
    const sourceId = data.get(NODE_SOURCE_ID) as string | undefined;

    if (kind === "value") {
        const textContainer = data.get(NODE_TEXT) as LoroText | undefined;
        if (!textContainer) {
            throw new Error("Value node missing text container");
        }
        const node: ValueNode = {
            kind: "value",
            value: textContainer,
            ...(sourceId && { sourceId }),
        };
        return node;
    } else if (kind === "action") {
        const label = (data.get(NODE_LABEL) as string) || "Action";
        const actionsContainer = data.get(NODE_ACTIONS) as LoroList | undefined;
        if (!actionsContainer) {
            throw new Error("Action node missing actions container");
        }
        const target = (data.get(NODE_TARGET) as string) || "";
        const node: ActionNode = {
            kind: "action",
            label,
            actions: actionsContainer,
            target,
            ...(sourceId && { sourceId }),
        };
        return node;
    } else if (kind === "ref") {
        const target = (data.get(NODE_REF_TARGET) as string) || "";
        const node: RefNode = {
            kind: "ref",
            target,
            ...(sourceId && { sourceId }),
        };
        return node;
    } else if (kind === "formula") {
        const operation = (data.get(NODE_OPERATION) as string) || "";
        const node: FormulaNode = {
            kind: "formula",
            operation,
            ...(sourceId && { sourceId }),
        };
        return node;
    } else {
        const tag = (data.get(NODE_TAG) as string) || "div";
        const attrsData = data.get(NODE_ATTRS);
        let attrs: Record<string, unknown> = {};
        if (attrsData && typeof attrsData === "object") {
            if (attrsData instanceof LoroMap) {
                attrs = attrsData.toJSON() as Record<string, unknown>;
            } else {
                attrs = { ...(attrsData as object) };
            }
        }

        // Get children IDs
        const children: string[] = [];
        const childNodes = treeNode.children();
        if (childNodes) {
            for (const child of childNodes) {
                children.push(treeIdToString(child.id));
            }
        }

        const node: ElementNode = {
            kind: "element",
            tag,
            attrs,
            children,
            ...(sourceId && { sourceId }),
        };
        return node;
    }
}

/**
 * Result of building document index
 */
export interface DocumentIndex {
    nodes: Map<string, NodeData>;
    parents: Map<string, string | null>;
    childIds: Map<string, string[]>;
    rootId: string | null;
}

/**
 * Build document index from a LoroDoc.
 * Returns flat maps for O(1) lookups.
 */
export function buildDocumentIndex(doc: LoroDoc): DocumentIndex {
    const tree = doc.getTree(TREE_CONTAINER);
    const roots = tree.roots();

    const nodes = new Map<string, NodeData>();
    const parents = new Map<string, string | null>();
    const childIds = new Map<string, string[]>();

    const rootNode = roots[0];
    if (!rootNode) {
        return { nodes, parents, childIds, rootId: null };
    }

    const rootId = treeIdToString(rootNode.id);

    function walkNode(treeNode: LoroTreeNode, parentId: string | null): void {
        const id = treeIdToString(treeNode.id);
        const data = treeNode.data;
        const kind = data.get(NODE_KIND) as "element" | "value" | "action" | "ref" | "formula" | undefined;
        const sourceId = data.get(NODE_SOURCE_ID) as string | undefined;

        parents.set(id, parentId);

        if (kind === "value") {
            const textContainer = data.get(NODE_TEXT) as LoroText | undefined;
            if (!textContainer) {
                throw new Error(`Value node ${id} missing text container`);
            }
            // Convert LoroText to string for public API (no Loro types exposed)
            nodes.set(id, { id, kind: "value", value: textContainer.toString(), ...(sourceId && { sourceId }) });
            childIds.set(id, []);
        } else if (kind === "action") {
            const label = (data.get(NODE_LABEL) as string) || "Action";
            const actionsContainer = data.get(NODE_ACTIONS) as LoroList | undefined;
            if (!actionsContainer) {
                throw new Error(`Action node ${id} missing actions container`);
            }
            // Convert LoroList to array for public API (no Loro types exposed)
            const actions = actionsContainer.toJSON() as GeneralizedPatch[];
            const target = (data.get(NODE_TARGET) as string) || "";
            nodes.set(id, { id, kind: "action", label, actions, target, ...(sourceId && { sourceId }) });
            childIds.set(id, []);  // Action nodes have no children
        } else if (kind === "ref") {
            const target = (data.get(NODE_REF_TARGET) as string) || "";
            nodes.set(id, { id, kind: "ref", target, ...(sourceId && { sourceId }) });
            childIds.set(id, []);  // Ref nodes have no children
        } else if (kind === "formula") {
            const operation = (data.get(NODE_OPERATION) as string) || "";
            nodes.set(id, { id, kind: "formula", operation, ...(sourceId && { sourceId }) });
            // Formula nodes CAN have children (their arguments)
            const children: string[] = [];
            const childNodes = treeNode.children();
            if (childNodes) {
                for (const child of childNodes) {
                    children.push(treeIdToString(child.id));
                    walkNode(child, id);
                }
            }
            childIds.set(id, children);
        } else {
            const tag = (data.get(NODE_TAG) as string) || "div";
            const attrsData = data.get(NODE_ATTRS);
            let attrs: Record<string, unknown> = {};
            if (attrsData && typeof attrsData === "object") {
                if (attrsData instanceof LoroMap) {
                    attrs = attrsData.toJSON() as Record<string, unknown>;
                } else {
                    attrs = { ...(attrsData as object) };
                }
            }

            nodes.set(id, { id, kind: "element", tag, attrs, ...(sourceId && { sourceId }) });

            const children: string[] = [];
            const childNodes = treeNode.children();
            if (childNodes) {
                for (const child of childNodes) {
                    children.push(treeIdToString(child.id));
                    walkNode(child, id);
                }
            }
            childIds.set(id, children);
        }
    }

    walkNode(rootNode, null);

    return { nodes, parents, childIds, rootId };
}
