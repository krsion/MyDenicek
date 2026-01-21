/**
 * DenicekModel - Read/write operations for the document tree
 *
 * This class wraps Loro's LoroTree and provides a clean API for document manipulation.
 * It is created inside a change() callback and provides methods to read and modify the document.
 */

import { LoroDoc, LoroList, LoroMap, LoroText, LoroTree } from "loro-crdt";

import { DenicekError, handleModelError } from "./errors.js";
import {
    loroNodeToNode,
    NODE_ACTIONS,
    NODE_ATTRS,
    NODE_KIND,
    NODE_LABEL,
    NODE_SOURCE_ID,
    NODE_TAG,
    NODE_TARGET,
    NODE_TEXT,
    stringToTreeId,
    TREE_CONTAINER,
    treeIdToString,
} from "./loroHelpers.js";
import type {
    ElementNode,
    GeneralizedPatch,
    Node,
    NodeData,
} from "./types.js";

/** Input type for creating nodes - string values converted to LoroText internally */
type NodeInput =
    | ElementNode
    | { kind: "value"; value: string }
    | { kind: "action"; label: string; actions: GeneralizedPatch[]; target: string };

/**
 * Sanitize and validate a tag name for use with HTML elements.
 * Returns the sanitized tag name or null if invalid.
 */
function sanitizeTagName(input: string): string | null {
    // Strip angle brackets and whitespace, convert to lowercase
    const tag = input.replace(/[<>]/g, "").trim().toLowerCase();

    if (!tag) {
        return null;
    }

    // HTML tag names must start with a letter and contain only letters, digits, or hyphens
    const validTagPattern = /^[a-z][a-z0-9-]*$/;
    if (!validTagPattern.test(tag)) {
        return null;
    }

    return tag;
}

/**
 * Document reference interface for read operations
 */
interface DocumentRef {
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
        const root = roots[0];
        if (!root) return "";
        return treeIdToString(root.id);
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
            // Sanitize and validate tag name
            const sanitizedTag = sanitizeTagName(newTag);
            if (!sanitizedTag) {
                handleModelError("updateTag", new Error(`Invalid tag name: "${newTag}"`));
                return;
            }

            const treeId = stringToTreeId(id);
            const treeNode = this.tree.getNodeByID(treeId);
            if (!treeNode) return;

            const data = treeNode.data;
            const kind = data.get(NODE_KIND);
            if (kind !== "element") return;

            data.set(NODE_TAG, sanitizedTag);
            this.emitPatch({
                action: "put",
                path: ["nodes", id, "tag"],
                value: sanitizedTag
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

            text.splice(index, deleteCount, insertText);

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

    /**
     * Generic property update for any node type.
     * Supports: label, target, actions (for action nodes), tag (for element nodes)
     */
    updateNodeProperty(id: string, property: string, value: unknown): void {
        try {
            const treeId = stringToTreeId(id);
            const treeNode = this.tree.getNodeByID(treeId);
            if (!treeNode) return;

            const data = treeNode.data;
            const kind = data.get(NODE_KIND) as "element" | "value" | "action" | undefined;

            // Handle action node properties
            if (kind === "action") {
                if (property === "label") {
                    data.set(NODE_LABEL, value as string);
                    this.emitPatch({
                        action: "put",
                        path: ["nodes", id, "label"],
                        value: value
                    });
                } else if (property === "target") {
                    data.set(NODE_TARGET, value as string);
                    this.emitPatch({
                        action: "put",
                        path: ["nodes", id, "target"],
                        value: value
                    });
                } else if (property === "actions") {
                    // Replace entire actions list
                    const actionsContainer = data.get(NODE_ACTIONS) as LoroList | undefined;
                    if (actionsContainer) {
                        // Clear and repopulate
                        const length = actionsContainer.length;
                        if (length > 0) {
                            actionsContainer.delete(0, length);
                        }
                        for (const action of value as GeneralizedPatch[]) {
                            actionsContainer.push(action);
                        }
                        this.emitPatch({
                            action: "put",
                            path: ["nodes", id, "actions"],
                            value: value
                        });
                    }
                }
            } else if (kind === "element") {
                // Handle element node properties
                if (property === "tag") {
                    this.updateTag(id, value as string);
                }
            }
        } catch (e) {
            handleModelError("updateNodeProperty", e);
        }
    }

    // ==================== ACTION NODE LIST OPERATIONS ====================

    /**
     * Append actions to an action node's actions list
     */
    appendActions(id: string, actions: GeneralizedPatch[]): void {
        try {
            const treeId = stringToTreeId(id);
            const treeNode = this.tree.getNodeByID(treeId);
            if (!treeNode) return;

            const data = treeNode.data;
            const kind = data.get(NODE_KIND);
            if (kind !== "action") return;

            const actionsList = data.get(NODE_ACTIONS) as LoroList | undefined;
            if (!actionsList) return;

            for (const action of actions) {
                actionsList.push(action);
            }

            this.emitPatch({
                action: "insert",
                path: ["nodes", id, "actions", actionsList.length - actions.length],
                value: actions
            });
        } catch (e) {
            handleModelError("appendActions", e);
        }
    }

    /**
     * Delete an action from an action node's actions list
     */
    deleteAction(id: string, index: number): void {
        try {
            const treeId = stringToTreeId(id);
            const treeNode = this.tree.getNodeByID(treeId);
            if (!treeNode) return;

            const data = treeNode.data;
            const kind = data.get(NODE_KIND);
            if (kind !== "action") return;

            const actionsList = data.get(NODE_ACTIONS) as LoroList | undefined;
            if (!actionsList) return;

            actionsList.delete(index, 1);

            this.emitPatch({
                action: "del",
                path: ["nodes", id, "actions", index]
            });
        } catch (e) {
            handleModelError("deleteAction", e);
        }
    }

    /**
     * Move an action within an action node's actions list
     */
    moveAction(id: string, fromIndex: number, toIndex: number): void {
        try {
            const treeId = stringToTreeId(id);
            const treeNode = this.tree.getNodeByID(treeId);
            if (!treeNode) return;

            const data = treeNode.data;
            const kind = data.get(NODE_KIND);
            if (kind !== "action") return;

            const actionsList = data.get(NODE_ACTIONS) as LoroList | undefined;
            if (!actionsList) return;

            // LoroList doesn't have moveTo, so we use delete + insert
            const item = actionsList.get(fromIndex);
            if (item === undefined) return;

            actionsList.delete(fromIndex, 1);
            // Adjust toIndex if needed (if we deleted before the target)
            const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
            actionsList.insert(adjustedToIndex, item);

            this.emitPatch({
                action: "move",
                path: ["nodes", id, "actions", fromIndex],
                value: { toIndex }
            });
        } catch (e) {
            handleModelError("moveAction", e);
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
            // Sanitize and validate wrapper tag name
            const sanitizedTag = sanitizeTagName(wrapperTag);
            if (!sanitizedTag) {
                handleModelError("wrapNode", new Error(`Invalid wrapper tag name: "${wrapperTag}"`));
                return "";
            }

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

                    const firstChild = children?.[0];
                    if (kind === "element" && tag === sanitizedTag &&
                        firstChild && children.length === 1 &&
                        treeIdToString(firstChild.id) === targetId) {
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
                const sibling = siblings[i];
                if (sibling && treeIdToString(sibling.id) === targetId) {
                    targetIndex = i;
                    break;
                }
            }

            // Create wrapper node at the same position
            const wrapperNode = parent.createNode(targetIndex);
            const wrapperData = wrapperNode.data;
            wrapperData.set(NODE_KIND, "element");
            wrapperData.set(NODE_TAG, sanitizedTag);
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
                    tag: sanitizedTag,
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

    // ==================== NODE CREATION ====================

    /**
     * Create a root element node (no parent)
     * Returns the ID of the created root node
     */
    createRootNode(tag: string): string {
        try {
            // Sanitize and validate tag name
            const sanitizedTag = sanitizeTagName(tag);
            if (!sanitizedTag) {
                handleModelError("createRootNode", new Error(`Invalid tag name: "${tag}"`));
                return "";
            }

            const rootNode = this.tree.createNode();
            const data = rootNode.data;
            data.set(NODE_KIND, "element");
            data.set(NODE_TAG, sanitizedTag);
            data.setContainer(NODE_ATTRS, new LoroMap());
            return treeIdToString(rootNode.id);
        } catch (e) {
            handleModelError("createRootNode", e);
            return "";
        }
    }

    addChild(parentId: string, child: NodeInput, index?: number): string {
        try {
            // For element nodes, sanitize and validate tag name
            let sanitizedChild = child;
            if (child.kind === "element") {
                const sanitizedTag = sanitizeTagName(child.tag);
                if (!sanitizedTag) {
                    handleModelError("addChild", new Error(`Invalid tag name: "${child.tag}"`));
                    return "";
                }
                sanitizedChild = { ...child, tag: sanitizedTag };
            }

            const parentTreeId = stringToTreeId(parentId);
            const parentNode = this.tree.getNodeByID(parentTreeId);
            if (!parentNode) return "";

            const newNode = parentNode.createNode(index);
            const data = newNode.data;

            if (sanitizedChild.kind === "element") {
                data.set(NODE_KIND, "element");
                data.set(NODE_TAG, sanitizedChild.tag);
                const attrsMap = data.setContainer(NODE_ATTRS, new LoroMap()) as LoroMap;
                for (const [key, value] of Object.entries(sanitizedChild.attrs)) {
                    attrsMap.set(key, value);
                }
            } else if (sanitizedChild.kind === "action") {
                data.set(NODE_KIND, "action");
                data.set(NODE_LABEL, sanitizedChild.label);
                data.set(NODE_TARGET, sanitizedChild.target);
                // Create LoroList for actions and populate it
                const actionsList = data.setContainer(NODE_ACTIONS, new LoroList()) as LoroList;
                for (const action of sanitizedChild.actions) {
                    actionsList.push(action);
                }
            } else {
                data.set(NODE_KIND, "value");
                const textContainer = data.setContainer(NODE_TEXT, new LoroText()) as LoroText;
                textContainer.insert(0, sanitizedChild.value);
            }

            const newId = treeIdToString(newNode.id);
            const children = parentNode.children();
            const actualIndex = index ?? (children ? children.length - 1 : 0);

            this.emitPatch({
                action: "insert",
                path: ["nodes", parentId, "children", actualIndex],
                value: { ...sanitizedChild, id: newId }
            });

            return newId;
        } catch (e) {
            handleModelError("addChild", e);
            return "";
        }
    }

    addSibling(siblingId: string, position: "before" | "after", nodeInput?: NodeInput): string | undefined {
        const offset = position === "before" ? 0 : 1;
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
                const sib = siblings[i];
                if (sib && treeIdToString(sib.id) === siblingId) {
                    siblingIndex = i;
                    break;
                }
            }

            const newNode = this.tree.createNode(parent.id, siblingIndex + offset);
            const data = newNode.data;

            // Use nodeInput if provided, otherwise clone the sibling
            const input = nodeInput ?? sibling;

            if (input.kind === "element") {
                data.set(NODE_KIND, "element");
                data.set(NODE_TAG, "tag" in input ? input.tag : (sibling.kind === "element" ? sibling.tag : "div"));
                data.setContainer(NODE_ATTRS, new LoroMap());
            } else if (input.kind === "value") {
                data.set(NODE_KIND, "value");
                const textContainer = data.setContainer(NODE_TEXT, new LoroText()) as LoroText;
                const textValue = "value" in input && typeof input.value === "string" ? input.value :
                                  (sibling.kind === "value" ? sibling.value.toString() : "");
                textContainer.insert(0, textValue);
            } else if (input.kind === "action") {
                data.set(NODE_KIND, "action");
                data.set(NODE_LABEL, "label" in input ? input.label : (sibling.kind === "action" ? sibling.label : "Action"));
                data.set(NODE_TARGET, "target" in input ? input.target : (sibling.kind === "action" ? sibling.target : ""));
                const actionsList = data.setContainer(NODE_ACTIONS, new LoroList()) as LoroList;
                // If actions provided, populate them
                if ("actions" in input && Array.isArray(input.actions)) {
                    for (const action of input.actions) {
                        actionsList.push(action);
                    }
                }
            }

            return treeIdToString(newNode.id);
        } catch (e) {
            handleModelError("addSibling", e);
            return undefined;
        }
    }

    // ==================== COPY ====================

    /**
     * Copy a node (or an element's attribute) as a child of the specified parent.
     *
     * Two modes:
     * 1. Copy whole node: shallow copy of tag/attrs (elements) or text (values)
     * 2. Copy from attribute: creates a value node from an element's attribute
     *
     * @param sourceId - The node to copy from
     * @param parentId - The parent to add the copy under
     * @param options - Optional: index (position) and sourceAttr (attribute to copy from)
     * @returns The ID of the newly created copy
     * @throws DenicekError if source or parent node doesn't exist
     */
    copyNode(sourceId: string, parentId: string, options?: { index?: number; sourceAttr?: string }): string {
        const { index, sourceAttr } = options ?? {};

        // Validate source node
        const sourceTreeId = stringToTreeId(sourceId);
        const sourceTreeNode = this.tree.getNodeByID(sourceTreeId);
        if (!sourceTreeNode || sourceTreeNode.isDeleted?.()) {
            throw new DenicekError(`Source node not found: ${sourceId}`, "copyNode", { sourceId, parentId });
        }

        // Validate parent node
        const parentTreeId = stringToTreeId(parentId);
        const parentNode = this.tree.getNodeByID(parentTreeId);
        if (!parentNode) {
            throw new DenicekError(`Parent node not found: ${parentId}`, "copyNode", { sourceId, parentId });
        }

        const sourceData = sourceTreeNode.data;
        const newNode = parentNode.createNode(index);
        const data = newNode.data;

        if (sourceAttr) {
            // Copy from element attribute → create value node
            const sourceAttrs = sourceData.get(NODE_ATTRS);
            let attrValue = "";
            if (sourceAttrs && sourceAttrs instanceof LoroMap) {
                const val = sourceAttrs.get(sourceAttr);
                attrValue = val != null ? String(val) : "";
            }
            data.set(NODE_KIND, "value");
            const textContainer = data.setContainer(NODE_TEXT, new LoroText()) as LoroText;
            textContainer.insert(0, attrValue);
        } else {
            // Copy whole node
            const sourceKind = sourceData.get(NODE_KIND) as "element" | "value" | undefined;
            if (sourceKind === "element") {
                data.set(NODE_KIND, "element");
                data.set(NODE_TAG, (sourceData.get(NODE_TAG) as string) || "div");
                const attrsMap = data.setContainer(NODE_ATTRS, new LoroMap()) as LoroMap;
                const sourceAttrs = sourceData.get(NODE_ATTRS);
                if (sourceAttrs && sourceAttrs instanceof LoroMap) {
                    for (const [key, value] of Object.entries(sourceAttrs.toJSON() as Record<string, unknown>)) {
                        attrsMap.set(key, value);
                    }
                }
            } else {
                data.set(NODE_KIND, "value");
                const textContainer = data.setContainer(NODE_TEXT, new LoroText()) as LoroText;
                const sourceText = sourceData.get(NODE_TEXT) as LoroText | undefined;
                if (sourceText) {
                    textContainer.insert(0, sourceText.toString());
                }
            }
        }

        data.set(NODE_SOURCE_ID, sourceId);

        const newId = treeIdToString(newNode.id);
        const children = parentNode.children();
        const actualIndex = index ?? (children ? children.length - 1 : 0);

        this.emitPatch({
            action: "copy",
            path: ["nodes", parentId, "children", actualIndex],
            value: { id: newId, sourceId, ...(sourceAttr && { sourceAttr }) }
        });

        return newId;
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
                const nodeDef = value as NodeInput;
                return this.addChild(parentId, nodeDef, index);
            }

            // Handle copy action - reads CURRENT value from source
            if (action === "copy" && path.length >= 4 && path[2] === "children") {
                const parentId = id;
                const index = path[3] as number;
                const copyDef = value as { sourceId: string; sourceAttr?: string };

                if (!copyDef.sourceId) {
                    throw new DenicekError("Copy patch missing sourceId", "applyPatch", { patch });
                }

                return this.copyNode(copyDef.sourceId, parentId, { index, sourceAttr: copyDef.sourceAttr });
            }

            if (path.length === 2 && action === "del") {
                this.deleteNode(id);
                return undefined;
            }

            if (path.length === 2 && action === "move") {
                const { parentId, index } = value as { parentId: string, index?: number };
                this.moveNode(id, parentId, index);
                return undefined;
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
                // Handle action node property updates
                else if (field === "label" && action === "put") {
                    this.updateNodeProperty(id, "label", value);
                } else if (field === "target" && action === "put") {
                    this.updateNodeProperty(id, "target", value);
                } else if (field === "actions") {
                    if (action === "put") {
                        this.updateNodeProperty(id, "actions", value);
                    } else if (action === "insert" && path.length === 4) {
                        // Insert actions at specific index
                        const actions = value as GeneralizedPatch[];
                        this.appendActions(id, actions);
                    } else if (action === "del" && path.length === 4) {
                        const index = path[3] as number;
                        this.deleteAction(id, index);
                    } else if (action === "move" && path.length === 4) {
                        const fromIndex = path[3] as number;
                        const { toIndex } = value as { toIndex: number };
                        this.moveAction(id, fromIndex, toIndex);
                    }
                }
            }
            return undefined;
        } catch (e) {
            handleModelError("applyPatch", e);
            return undefined;
        }
    }

}
