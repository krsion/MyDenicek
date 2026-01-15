/**
 * NodeCreator - Node creation operations for the document tree
 */

import { LoroMap, LoroText, LoroTree } from "loro-crdt";
import {
    loroNodeToNode,
    NODE_ATTRS,
    NODE_KIND,
    NODE_TAG,
    NODE_TEXT,
    stringToTreeId,
    treeIdToString,
} from "../internal/LoroDocWrapper.js";
import type { ElementNode, GeneralizedPatch, Node, ValueNode } from "../types.js";
import { handleModelError } from "../errors.js";

export type PatchEmitter = (patch: GeneralizedPatch) => void;

/**
 * Add a child node to a parent element
 */
export function addChildNode(
    tree: LoroTree,
    emitPatch: PatchEmitter,
    parentId: string,
    child: Node,
    index?: number
): string {
    try {
        const parentTreeId = stringToTreeId(parentId);
        const parentNode = tree.getNodeByID(parentTreeId);
        if (!parentNode) return "";

        const newNode = parentNode.createNode(index);
        const data = newNode.data;

        if (child.kind === "element") {
            data.set(NODE_KIND, "element");
            data.set(NODE_TAG, child.tag);
            const attrsMap = data.setContainer(NODE_ATTRS, new LoroMap()) as LoroMap;
            for (const [key, value] of Object.entries(child.attrs)) {
                attrsMap.set(key, value);
            }
        } else {
            data.set(NODE_KIND, "value");
            const textContainer = data.setContainer(NODE_TEXT, new LoroText()) as LoroText;
            textContainer.insert(0, child.value);
        }

        const newId = treeIdToString(newNode.id);
        const children = parentNode.children();
        const actualIndex = index ?? (children ? children.length - 1 : 0);

        emitPatch({
            action: "insert",
            path: ["nodes", parentId, "children", actualIndex],
            value: { ...child, id: newId }
        });

        return newId;
    } catch (e) {
        handleModelError("addChildNode", e);
        return "";
    }
}

/**
 * Add an element child to a parent
 */
export function addElementChildNode(
    tree: LoroTree,
    emitPatch: PatchEmitter,
    parentId: string,
    tag: string
): string {
    const node: ElementNode = { kind: "element", tag, attrs: {}, children: [] };
    return addChildNode(tree, emitPatch, parentId, node);
}

/**
 * Add a value child to a parent
 */
export function addValueChildNode(
    tree: LoroTree,
    emitPatch: PatchEmitter,
    parentId: string,
    value: string
): string {
    const node: ValueNode = { kind: "value", value };
    return addChildNode(tree, emitPatch, parentId, node);
}

/**
 * Add a sibling node at an offset from the reference node
 */
export function addSiblingNode(
    tree: LoroTree,
    siblingId: string,
    offset: number
): string | undefined {
    try {
        const siblingTreeId = stringToTreeId(siblingId);
        const siblingNode = tree.getNodeByID(siblingTreeId);
        if (!siblingNode) return undefined;

        const sibling = loroNodeToNode(siblingNode, tree);
        const parent = siblingNode.parent();
        if (!parent) return undefined;

        const siblings = parent.children();
        if (!siblings) return undefined;

        let siblingIndex = 0;
        for (let i = 0; i < siblings.length; i++) {
            if (treeIdToString(siblings[i].id) === siblingId) {
                siblingIndex = i;
                break;
            }
        }

        const newNode = tree.createNode(parent.id, siblingIndex + offset);
        const data = newNode.data;

        if (sibling.kind === "element") {
            data.set(NODE_KIND, "element");
            data.set(NODE_TAG, sibling.tag);
            data.setContainer(NODE_ATTRS, new LoroMap());
        } else {
            data.set(NODE_KIND, "value");
            const textContainer = data.setContainer(NODE_TEXT, new LoroText()) as LoroText;
            textContainer.insert(0, sibling.value);
        }

        return treeIdToString(newNode.id);
    } catch (e) {
        handleModelError("addSiblingNode", e);
        return undefined;
    }
}
