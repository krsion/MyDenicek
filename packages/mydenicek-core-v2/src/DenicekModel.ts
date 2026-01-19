/**
 * DenicekModel - Read/write operations for the document tree
 *
 * This class wraps Loro's LoroTree and provides a clean API for document manipulation.
 * It is created inside a change() callback and provides methods to read and modify the document.
 */

import { LoroDoc, LoroMap, LoroText, LoroTree } from "loro-crdt";
import {
    loroNodeToNode,
    NODE_ATTRS,
    NODE_KIND,
    NODE_TAG,
    NODE_TEXT,
    stringToTreeId,
    TREE_CONTAINER,
    treeIdToString,
} from "./loroHelpers.js";
import { DocumentView } from "./DocumentView.js";
import type {
    ElementNode,
    GeneralizedPatch,
    Node,
    NodeData,
    ValueNode
} from "./types.js";
import { handleModelError } from "./errors.js";

/**
 * Document reference interface for read operations
 */
interface DocumentRef {
    getSnapshot: () => DocumentView;
    getAllNodes: () => Record<string, NodeData>;
}

/**
 * DenicekModel - Operations on the document
 *
 * This class is created inside a change() callback and provides
 * methods to read and modify the document.
 */
export class DenicekModel {
    private _loroDoc: LoroDoc;
    private docRef: DocumentRef;
    private onPatch?: (patch: GeneralizedPatch) => void;

    constructor(
        loroDoc: LoroDoc,
        docRef: DocumentRef,
        onPatch?: (patch: GeneralizedPatch) => void
    ) {
        this._loroDoc = loroDoc;
        this.docRef = docRef;
        this.onPatch = onPatch;
    }

    private emitPatch(patch: GeneralizedPatch): void {
        if (this.onPatch) {
            this.onPatch(patch);
        }
    }

    private get tree(): LoroTree {
        return this._loroDoc.getTree(TREE_CONTAINER);
    }

    // ==================== READ ====================

    get rootId(): string {
        const roots = this.tree.roots();
        if (roots.length === 0) return "";
        return treeIdToString(roots[0].id);
    }

    getNode(id: string): Node | undefined {
        try {
            const treeId = stringToTreeId(id);
            const treeNode = this.tree.getNodeByID(treeId);
            if (!treeNode) return undefined;
            if (treeNode.isDeleted?.()) return undefined;
            return loroNodeToNode(treeNode, this.tree);
        } catch {
            return undefined;
        }
    }

    getAllNodes(): Record<string, NodeData> {
        return this.docRef.getAllNodes();
    }

    getSnapshot(): DocumentView {
        return this.docRef.getSnapshot();
    }

    getParents(childId: string): ElementNode[] {
        try {
            const treeId = stringToTreeId(childId);
            const treeNode = this.tree.getNodeByID(treeId);
            if (!treeNode) return [];

            const parent = treeNode.parent();
            if (!parent) return [];

            const parentNode = loroNodeToNode(parent, this.tree);
            if (parentNode.kind === "element") {
                return [parentNode];
            }
            return [];
        } catch {
            return [];
        }
    }

    getParentId(childId: string): string | null {
        try {
            const treeId = stringToTreeId(childId);
            const treeNode = this.tree.getNodeByID(treeId);
            if (!treeNode) return null;

            const parent = treeNode.parent();
            if (!parent) return null;

            return treeIdToString(parent.id);
        } catch {
            return null;
        }
    }

    getFirstChildTag(parentId: string): string | undefined {
        const parentNode = this.getNode(parentId);
        if (!parentNode || parentNode.kind !== "element") return undefined;
        if (!parentNode.children[0]) return undefined;
        const childNode = this.getNode(parentNode.children[0]);
        if (childNode?.kind === "element") {
            return childNode.tag;
        }
        return undefined;
    }

    getChildrenIds(parentId: string): string[] {
        const node = this.getNode(parentId);
        return (node?.kind === "element") ? node.children : [];
    }

    // ==================== WRITE ====================

    updateAttribute(id: string, key: string, value: unknown | undefined): void {
        try {
            const treeId = stringToTreeId(id);
            const treeNode = this.tree.getNodeByID(treeId);
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
                this.emitPatch({
                    action: "del",
                    path: ["nodes", id, "attrs", key]
                });
            } else {
                attrsMap.set(key, value);
                this.emitPatch({
                    action: "put",
                    path: ["nodes", id, "attrs", key],
                    value: value
                });
            }
        } catch (e) {
            handleModelError("updateAttribute", e);
        }
    }

    updateTag(id: string, newTag: string): void {
        try {
            const treeId = stringToTreeId(id);
            const treeNode = this.tree.getNodeByID(treeId);
            if (!treeNode) return;

            const data = treeNode.data;
            const kind = data.get(NODE_KIND);
            if (kind !== "element") return;

            data.set(NODE_TAG, newTag);
            this.emitPatch({
                action: "put",
                path: ["nodes", id, "tag"],
                value: newTag
            });
        } catch (e) {
            handleModelError("updateTag", e);
        }
    }

    spliceValue(id: string, index: number, deleteCount: number, insertText: string): void {
        try {
            const treeId = stringToTreeId(id);
            const treeNode = this.tree.getNodeByID(treeId);
            if (!treeNode) return;

            const data = treeNode.data;
            const kind = data.get(NODE_KIND);
            if (kind !== "value") return;

            const text = data.get(NODE_TEXT) as LoroText | undefined;
            if (!text) return;

            if (deleteCount > 0) text.delete(index, deleteCount);
            if (insertText) text.insert(index, insertText);

            this.emitPatch({
                action: "splice",
                path: ["nodes", id, "value", index],
                length: deleteCount,
                value: insertText
            });
        } catch (e) {
            handleModelError("spliceValue", e);
        }
    }

    deleteNode(id: string): void {
        try {
            const treeId = stringToTreeId(id);
            this.tree.delete(treeId);
            this.emitPatch({
                action: "del",
                path: ["nodes", id]
            });
        } catch (e) {
            handleModelError("deleteNode", e);
        }
    }

    moveNode(nodeId: string, newParentId: string, index?: number): void {
        try {
            const treeId = stringToTreeId(nodeId);
            const parentTreeId = stringToTreeId(newParentId);
            const treeNode = this.tree.getNodeByID(treeId);
            const parentNode = this.tree.getNodeByID(parentTreeId);
            if (!treeNode || !parentNode) return;

            if (index !== undefined) {
                treeNode.move(parentNode, index);
            } else {
                treeNode.move(parentNode);
            }

            this.emitPatch({
                action: "move",
                path: ["nodes", nodeId],
                value: { parentId: newParentId, index }
            });
        } catch (e) {
            handleModelError("moveNode", e);
        }
    }

    // ==================== WRAP ====================

    wrapNode(targetId: string, wrapperTag: string, wrapperId?: string): string {
        try {
            const targetTreeId = stringToTreeId(targetId);
            const targetNode = this.tree.getNodeByID(targetTreeId);
            if (!targetNode) return "";

            const actualWrapperId = wrapperId ?? ("w-" + targetId);

            // Check if wrapper already exists with correct structure
            try {
                const existingTreeId = stringToTreeId(actualWrapperId);
                const existingWrapper = this.tree.getNodeByID(existingTreeId);
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

            this.emitPatch({
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
            this.emitPatch({
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

    unwrapNode(wrapperId: string): boolean {
        try {
            const wrapperTreeId = stringToTreeId(wrapperId);
            const wrapperNode = this.tree.getNodeByID(wrapperTreeId);
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
            this.tree.delete(wrapperTreeId);

            return true;
        } catch (e) {
            handleModelError("unwrapNode", e);
            return false;
        }
    }

    // ==================== NODE CREATION ====================

    /**
     * Create a root element node (no parent)
     * Returns the ID of the created root node
     */
    createRootNode(tag: string): string {
        try {
            const rootNode = this.tree.createNode();
            const data = rootNode.data;
            data.set(NODE_KIND, "element");
            data.set(NODE_TAG, tag);
            data.setContainer(NODE_ATTRS, new LoroMap());
            return treeIdToString(rootNode.id);
        } catch (e) {
            handleModelError("createRootNode", e);
            return "";
        }
    }

    addChildNode(parentId: string, child: Node, index?: number): string {
        try {
            const parentTreeId = stringToTreeId(parentId);
            const parentNode = this.tree.getNodeByID(parentTreeId);
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

            this.emitPatch({
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

    addElementChildNode(parentId: string, tag: string): string {
        const node: ElementNode = { kind: "element", tag, attrs: {}, children: [] };
        return this.addChildNode(parentId, node);
    }

    addValueChildNode(parentId: string, value: string): string {
        const node: ValueNode = { kind: "value", value };
        return this.addChildNode(parentId, node);
    }

    addSiblingNodeBefore(siblingId: string): string | undefined {
        return this.addSiblingNode(siblingId, 0);
    }

    addSiblingNodeAfter(siblingId: string): string | undefined {
        return this.addSiblingNode(siblingId, 1);
    }

    private addSiblingNode(siblingId: string, offset: number): string | undefined {
        try {
            const siblingTreeId = stringToTreeId(siblingId);
            const siblingNode = this.tree.getNodeByID(siblingTreeId);
            if (!siblingNode) return undefined;

            const sibling = loroNodeToNode(siblingNode, this.tree);
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

            const newNode = this.tree.createNode(parent.id, siblingIndex + offset);
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

    // ==================== SELECTION ====================

    findLowestCommonAncestor(nodeIds: string[]): string | null {
        if (nodeIds.length === 0) return null;

        let currentLca: string | null = nodeIds[0] ?? null;

        for (let i = 1; i < nodeIds.length; i++) {
            if (!currentLca) break;
            const nextNode = nodeIds[i];

            const ancestors = new Set<string>();
            let curr: string | null = currentLca;
            while (curr) {
                ancestors.add(curr);
                curr = this.getParentId(curr);
            }

            let runner: string | null = nextNode ?? null;
            let found = false;
            while (runner) {
                if (ancestors.has(runner)) {
                    currentLca = runner;
                    found = true;
                    break;
                }
                runner = this.getParentId(runner);
            }
            if (!found) {
                currentLca = this.rootId;
            }
        }

        return currentLca;
    }

    // ==================== REPLAY ====================

    applyPatch(patch: GeneralizedPatch): unknown {
        try {
            const { action, path, value, length } = patch;
            const targetType = path[0];
            if (targetType !== "nodes") return;

            const id = path[1] as string;

            if (action === "insert" && path.length >= 4 && path[2] === "children") {
                const parentId = id;
                const index = path[3] as number;
                const nodeDef = value as Node;
                return this.addChildNode(parentId, nodeDef, index);
            }

            if (path.length === 2 && action === "del") {
                this.deleteNode(id);
                return;
            }

            if (path.length === 2 && action === "move") {
                const { parentId, index } = value as { parentId: string, index?: number };
                this.moveNode(id, parentId, index);
                return;
            }

            if (path.length >= 3) {
                const field = path[2];
                if (field === "tag" && action === "put") {
                    this.updateTag(id, value as string);
                } else if (field === "attrs" && path.length === 4) {
                    const key = path[3] as string;
                    if (action === "put") {
                        this.updateAttribute(id, key, value);
                    } else if (action === "del") {
                        this.updateAttribute(id, key, undefined);
                    }
                } else if (field === "value" && action === "splice") {
                    if (path.length === 4) {
                        const index = path[3] as number;
                        const insertText = value as string;
                        const deleteCount = length || 0;
                        this.spliceValue(id, index, deleteCount, insertText);
                    }
                }
            }
        } catch (e) {
            handleModelError("applyPatch", e);
        }
    }

}
