/**
 * NodeReader - Pure read operations for the document tree
 */

import type { LoroTree } from "loro-crdt";
import {
    loroNodeToNode,
    stringToTreeId,
    treeIdToString,
} from "../internal/LoroDocWrapper.js";
import type { ElementNode, Node } from "../types.js";

/**
 * Get the root node ID from the tree
 */
export function getRootId(tree: LoroTree): string {
    const roots = tree.roots();
    if (roots.length === 0) return "";
    return treeIdToString(roots[0].id);
}

/**
 * Get a node by ID
 */
export function getNode(tree: LoroTree, id: string): Node | undefined {
    try {
        const treeId = stringToTreeId(id);
        const treeNode = tree.getNodeByID(treeId);
        if (!treeNode) return undefined;
        if (treeNode.isDeleted?.()) return undefined;
        return loroNodeToNode(treeNode, tree);
    } catch {
        return undefined;
    }
}

/**
 * Get parent elements of a node
 */
export function getParents(tree: LoroTree, childId: string): ElementNode[] {
    try {
        const treeId = stringToTreeId(childId);
        const treeNode = tree.getNodeByID(treeId);
        if (!treeNode) return [];

        const parent = treeNode.parent();
        if (!parent) return [];

        const parentNode = loroNodeToNode(parent, tree);
        if (parentNode.kind === "element") {
            return [parentNode];
        }
        return [];
    } catch {
        return [];
    }
}

/**
 * Get parent ID of a node
 */
export function getParentId(tree: LoroTree, childId: string): string | null {
    try {
        const treeId = stringToTreeId(childId);
        const treeNode = tree.getNodeByID(treeId);
        if (!treeNode) return null;

        const parent = treeNode.parent();
        if (!parent) return null;

        return treeIdToString(parent.id);
    } catch {
        return null;
    }
}

/**
 * Get the tag of the first child element
 */
export function getFirstChildTag(tree: LoroTree, node: ElementNode): string | undefined {
    if (!node.children[0]) return undefined;
    const childNode = getNode(tree, node.children[0]);
    if (childNode?.kind === "element") {
        return childNode.tag;
    }
    return undefined;
}

/**
 * Get children IDs of an element node
 */
export function getChildrenIds(node: ElementNode): string[] {
    return node.children;
}
