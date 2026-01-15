/**
 * NodeWriter - Write operations for the document tree
 */

import { LoroMap, LoroTree } from "loro-crdt";
import {
    NODE_ATTRS,
    NODE_KIND,
    NODE_TAG,
    NODE_TEXT,
    stringToTreeId,
    treeIdToString,
} from "../internal/LoroDocWrapper.js";
import type { GeneralizedPatch } from "../types.js";
import { handleModelError } from "../errors.js";
import type { LoroText } from "loro-crdt";

export type PatchEmitter = (patch: GeneralizedPatch) => void;

/**
 * Update an attribute on an element node
 */
export function updateAttribute(
    tree: LoroTree,
    emitPatch: PatchEmitter,
    id: string,
    key: string,
    value: unknown | undefined
): void {
    try {
        const treeId = stringToTreeId(id);
        const treeNode = tree.getNodeByID(treeId);
        if (!treeNode) return;

        const data = treeNode.data;
        const kind = data.get(NODE_KIND);
        if (kind !== "element") return;

        let attrsMap = data.get(NODE_ATTRS) as LoroMap | undefined;
        if (!attrsMap) {
            attrsMap = data.setContainer(NODE_ATTRS, new LoroMap()) as LoroMap;
        }

        if (value === undefined) {
            attrsMap.delete(key);
            emitPatch({
                action: "del",
                path: ["nodes", id, "attrs", key]
            });
        } else {
            attrsMap.set(key, value);
            emitPatch({
                action: "put",
                path: ["nodes", id, "attrs", key],
                value: value
            });
        }
    } catch (e) {
        handleModelError("updateAttribute", e);
    }
}

/**
 * Update the tag of an element node
 */
export function updateTag(
    tree: LoroTree,
    emitPatch: PatchEmitter,
    id: string,
    newTag: string
): void {
    try {
        const treeId = stringToTreeId(id);
        const treeNode = tree.getNodeByID(treeId);
        if (!treeNode) return;

        const data = treeNode.data;
        const kind = data.get(NODE_KIND);
        if (kind !== "element") return;

        data.set(NODE_TAG, newTag);
        emitPatch({
            action: "put",
            path: ["nodes", id, "tag"],
            value: newTag
        });
    } catch (e) {
        handleModelError("updateTag", e);
    }
}

/**
 * Splice a string value in a value node
 */
export function spliceValue(
    tree: LoroTree,
    emitPatch: PatchEmitter,
    id: string,
    index: number,
    deleteCount: number,
    insertText: string
): void {
    try {
        const treeId = stringToTreeId(id);
        const treeNode = tree.getNodeByID(treeId);
        if (!treeNode) return;

        const data = treeNode.data;
        const kind = data.get(NODE_KIND);
        if (kind !== "value") return;

        const text = data.get(NODE_TEXT) as LoroText | undefined;
        if (!text) return;

        if (deleteCount > 0) text.delete(index, deleteCount);
        if (insertText) text.insert(index, insertText);

        emitPatch({
            action: "splice",
            path: ["nodes", id, "value", index],
            length: deleteCount,
            value: insertText
        });
    } catch (e) {
        handleModelError("spliceValue", e);
    }
}

/**
 * Delete a node from the tree
 */
export function deleteNode(
    tree: LoroTree,
    emitPatch: PatchEmitter,
    id: string
): void {
    try {
        const treeId = stringToTreeId(id);
        tree.delete(treeId);
        emitPatch({
            action: "del",
            path: ["nodes", id]
        });
    } catch (e) {
        handleModelError("deleteNode", e);
    }
}

/**
 * Move a node to a new parent
 */
export function moveNode(
    tree: LoroTree,
    emitPatch: PatchEmitter,
    nodeId: string,
    newParentId: string,
    index?: number
): void {
    try {
        const treeId = stringToTreeId(nodeId);
        const parentTreeId = stringToTreeId(newParentId);
        const treeNode = tree.getNodeByID(treeId);
        const parentNode = tree.getNodeByID(parentTreeId);
        if (!treeNode || !parentNode) return;

        if (index !== undefined) {
            treeNode.move(parentNode, index);
        } else {
            treeNode.move(parentNode);
        }

        emitPatch({
            action: "move",
            path: ["nodes", nodeId],
            value: { parentId: newParentId, index }
        });
    } catch (e) {
        handleModelError("moveNode", e);
    }
}
