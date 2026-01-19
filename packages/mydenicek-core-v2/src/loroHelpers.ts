/**
 * Loro helper functions and constants
 * Internal utilities for working with Loro CRDT types
 */

import { LoroDoc, LoroMap, LoroText, LoroTree, LoroTreeNode, TreeID } from "loro-crdt";
import type { ElementNode, Node, ValueNode } from "./types.js";
import { DocumentView, type InternalNode, type InternalElementNode, type InternalValueNode } from "./DocumentView.js";

/**
 * Internal constants for Loro container names
 */
export const TREE_CONTAINER = "tree";
export const CONFIG_CONTAINER = "config";

/**
 * Node data keys
 */
export const NODE_KIND = "kind";
export const NODE_TAG = "tag";
export const NODE_ATTRS = "attrs";
export const NODE_TEXT = "text";

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
export function loroNodeToNode(treeNode: LoroTreeNode, tree: LoroTree): Node {
    const data = treeNode.data;
    const kind = data.get(NODE_KIND) as "element" | "value" | undefined;

    if (kind === "value") {
        const textContainer = data.get(NODE_TEXT) as LoroText | undefined;
        const value = textContainer ? textContainer.toString() : "";
        const node: ValueNode = {
            kind: "value",
            value,
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
        };
        return node;
    }
}

/**
 * Convert a LoroTreeNode to internal nested node structure for DocumentView
 */
function loroNodeToInternalNode(treeNode: LoroTreeNode, tree: LoroTree): InternalNode {
    const id = treeIdToString(treeNode.id);
    const data = treeNode.data;
    const kind = data.get(NODE_KIND) as "element" | "value" | undefined;

    if (kind === "value") {
        const textContainer = data.get(NODE_TEXT) as LoroText | undefined;
        const value = textContainer ? textContainer.toString() : "";
        const node: InternalValueNode = {
            id,
            kind: "value",
            value,
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

        // Recursively convert children
        const children: InternalNode[] = [];
        const childNodes = treeNode.children();
        if (childNodes) {
            for (const child of childNodes) {
                children.push(loroNodeToInternalNode(child, tree));
            }
        }

        const node: InternalElementNode = {
            id,
            kind: "element",
            tag,
            attrs,
            children,
        };
        return node;
    }
}

/**
 * Create a DocumentView from a LoroDoc
 */
export function createDocumentView(doc: LoroDoc): DocumentView {
    const tree = doc.getTree(TREE_CONTAINER);
    const roots = tree.roots();

    if (roots.length === 0) {
        return new DocumentView(null);
    }

    const root = loroNodeToInternalNode(roots[0], tree);
    return new DocumentView(root);
}
