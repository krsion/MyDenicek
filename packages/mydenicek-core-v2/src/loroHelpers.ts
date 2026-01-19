/**
 * Loro helper functions and constants
 * Internal utilities for working with Loro CRDT types
 */

import { LoroDoc, LoroMap, LoroText, LoroTree, LoroTreeNode, TreeID } from "loro-crdt";
import type { ElementNode, Node, NodeData, ValueNode } from "./types.js";

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

    if (roots.length === 0) {
        return { nodes, parents, childIds, rootId: null };
    }

    const rootId = treeIdToString(roots[0].id);

    function walkNode(treeNode: LoroTreeNode, parentId: string | null): void {
        const id = treeIdToString(treeNode.id);
        const data = treeNode.data;
        const kind = data.get(NODE_KIND) as "element" | "value" | undefined;

        parents.set(id, parentId);

        if (kind === "value") {
            const textContainer = data.get(NODE_TEXT) as LoroText | undefined;
            const value = textContainer ? textContainer.toString() : "";
            nodes.set(id, { id, kind: "value", value });
            childIds.set(id, []);
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

            nodes.set(id, { id, kind: "element", tag, attrs });

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

    walkNode(roots[0], null);

    return { nodes, parents, childIds, rootId };
}
