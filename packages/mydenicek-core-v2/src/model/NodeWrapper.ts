/**
 * NodeWrapper - Wrap and unwrap operations for the document tree
 */

import { LoroMap, LoroTree } from "loro-crdt";
import {
    NODE_ATTRS,
    NODE_KIND,
    NODE_TAG,
    stringToTreeId,
    treeIdToString,
} from "../internal/LoroDocWrapper.js";
import type { GeneralizedPatch } from "../types.js";
import { handleModelError } from "../errors.js";

export type PatchEmitter = (patch: GeneralizedPatch) => void;

/**
 * Wrap a node with a new element
 */
export function wrapNode(
    tree: LoroTree,
    emitPatch: PatchEmitter,
    targetId: string,
    wrapperTag: string,
    wrapperId?: string
): string {
    try {
        const targetTreeId = stringToTreeId(targetId);
        const targetNode = tree.getNodeByID(targetTreeId);
        if (!targetNode) return "";

        const actualWrapperId = wrapperId ?? ("w-" + targetId);

        // Check if wrapper already exists with correct structure
        try {
            const existingTreeId = stringToTreeId(actualWrapperId);
            const existingWrapper = tree.getNodeByID(existingTreeId);
            if (existingWrapper) {
                const data = existingWrapper.data;
                const kind = data.get(NODE_KIND);
                const tag = data.get(NODE_TAG);
                const children = existingWrapper.children();

                if (kind === "element" && tag === wrapperTag &&
                    children && children.length === 1 &&
                    treeIdToString(children[0].id) === targetId) {
                    return actualWrapperId;
                }
            }
        } catch {
            // Wrapper doesn't exist, continue
        }

        const parent = targetNode.parent();
        if (!parent) return "";

        const siblings = parent.children();
        if (!siblings) return "";

        let targetIndex = 0;
        for (let i = 0; i < siblings.length; i++) {
            if (treeIdToString(siblings[i].id) === targetId) {
                targetIndex = i;
                break;
            }
        }

        // Create wrapper node at the same position
        const wrapperNode = parent.createNode(targetIndex);
        const wrapperData = wrapperNode.data;
        wrapperData.set(NODE_KIND, "element");
        wrapperData.set(NODE_TAG, wrapperTag);
        wrapperData.setContainer(NODE_ATTRS, new LoroMap());

        // Move target to be child of wrapper
        targetNode.move(wrapperNode, 0);

        const createdWrapperId = treeIdToString(wrapperNode.id);
        const parentId = treeIdToString(parent.id);

        emitPatch({
            action: "insert",
            path: ["nodes", parentId, "children", targetIndex],
            value: {
                id: createdWrapperId,
                kind: "element",
                tag: wrapperTag,
                attrs: {},
                children: []
            }
        });
        emitPatch({
            action: "move",
            path: ["nodes", targetId],
            value: { parentId: createdWrapperId, index: 0 }
        });

        return createdWrapperId;
    } catch (e) {
        handleModelError("wrapNode", e);
        return "";
    }
}

/**
 * Unwrap a node by removing its wrapper
 */
export function unwrapNode(
    tree: LoroTree,
    wrapperId: string
): boolean {
    try {
        const wrapperTreeId = stringToTreeId(wrapperId);
        const wrapperNode = tree.getNodeByID(wrapperTreeId);
        if (!wrapperNode) return false;

        const data = wrapperNode.data;
        const kind = data.get(NODE_KIND);
        if (kind !== "element") return false;

        const children = wrapperNode.children();
        if (!children || children.length !== 1) return false;

        const wrappedNode = children[0];
        const parent = wrapperNode.parent();
        if (!parent) return false;

        const siblings = parent.children();
        if (!siblings) return false;

        let wrapperIndex = 0;
        for (let i = 0; i < siblings.length; i++) {
            if (treeIdToString(siblings[i].id) === wrapperId) {
                wrapperIndex = i;
                break;
            }
        }

        // Move wrapped node to wrapper's parent at wrapper's position
        wrappedNode.move(parent, wrapperIndex);

        // Delete wrapper
        tree.delete(wrapperTreeId);

        return true;
    } catch (e) {
        handleModelError("unwrapNode", e);
        return false;
    }
}
