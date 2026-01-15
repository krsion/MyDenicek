/**
 * DenicekModel - Read/write operations for the document tree
 * This class provides the same API as the original DenicekModel but uses Loro internally
 */

import { LoroMap, LoroText, LoroTree } from "loro-crdt";
import type { DenicekDocument } from "./DenicekDocument.js";
import {
    CONFIG_CONTAINER,
    loroNodeToNode,
    NODE_ATTRS,
    NODE_KIND,
    NODE_TAG,
    NODE_TEXT,
    stringToTreeId,
    TREE_CONTAINER,
    treeIdToString,
} from "./internal/LoroDocWrapper.js";
import type {
    DocumentSnapshot,
    ElementNode,
    GeneralizedPatch,
    Node,
    ValueNode
} from "./types.js";

/**
 * DenicekModel - Operations on the document
 *
 * This class is created inside a change() callback and provides
 * methods to read and modify the document.
 */
export class DenicekModel {
    private doc: DenicekDocument;
    private onPatch?: (patch: GeneralizedPatch) => void;

    constructor(doc: DenicekDocument, onPatch?: (patch: GeneralizedPatch) => void) {
        this.doc = doc;
        this.onPatch = onPatch;
    }

    private emitPatch(patch: GeneralizedPatch): void {
        if (this.onPatch) {
            this.onPatch(patch);
        }
    }

    // === Internal accessors ===

    private get loroDoc() {
        return this.doc._internal.doc;
    }

    private get tree(): LoroTree {
        return this.loroDoc.getTree(TREE_CONTAINER);
    }


    private get configMap(): LoroMap {
        return this.loroDoc.getMap(CONFIG_CONTAINER);
    }


    private getUUID(): string {
        const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
        return c && typeof c.randomUUID === 'function' ? c.randomUUID() : `uuid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    // ==================== READ Methods ====================

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
            // Check if node is deleted (Loro keeps deleted nodes accessible but marks them)
            if (treeNode.isDeleted?.()) return undefined;
            return loroNodeToNode(treeNode, this.tree);
        } catch {
            return undefined;
        }
    }

    getRootNode(): Node | undefined {
        return this.getNode(this.rootId);
    }

    getAllNodes(): Record<string, Node> {
        return this.doc.getAllNodes();
    }



    getSnapshot(): DocumentSnapshot {
        return this.doc.getSnapshot();
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

    getFirstChildTag(node: ElementNode): string | undefined {
        if (!node.children[0]) return undefined;
        const childNode = this.getNode(node.children[0]);
        if (childNode?.kind === "element") {
            return childNode.tag;
        }
        return undefined;
    }

    getChildrenIds(node: ElementNode): string[] {
        return node.children;
    }

    // ==================== WRITE Methods ====================



    /**
     * Insert text at a position in a value node
     */
    insertText(id: string, index: number, text: string): void {
        this.spliceValue(id, index, 0, text);
    }

    /**
     * Delete text from a value node
     */
    deleteText(id: string, index: number, length: number): void {
        this.spliceValue(id, index, length, "");
    }

    /**
     * Update an attribute on an element node
     */
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
            console.error("updateAttribute error:", e);
        }
    }

    /**
     * Update the tag of an element node
     */
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
            console.error("updateTag error:", e);
        }
    }

    /**
     * Splice a string value in a value node
     */
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
                length: deleteCount, // using length for delete count
                value: insertText
            });
        } catch (e) {
            console.error("spliceValue error:", e);
        }
    }

    /**
     * Delete a node from the tree
     */
    deleteNode(id: string): void {
        try {
            const treeId = stringToTreeId(id);
            this.tree.delete(treeId);
            this.emitPatch({
                action: "del",
                path: ["nodes", id]
            });
        } catch (e) {
            console.error("deleteNode error:", e);
        }
    }

    /**
     * Move a node to a new parent
     */
    moveNode(nodeId: string, newParentId: string, index?: number): void {
        try {
            const treeId = stringToTreeId(nodeId);
            const parentTreeId = stringToTreeId(newParentId);
            const treeNode = this.tree.getNodeByID(treeId);
            const parentNode = this.tree.getNodeByID(parentTreeId);
            if (!treeNode || !parentNode) return;

            // Capture state for patch
            const oldParentId = treeIdToString(treeNode.parent()?.id as any);
            const parentId = treeIdToString(parentNode.id);
            
            // Note: Finding old index is expensive/complex here if we don't scan siblings.
            // For now, minimal instrumentation.
            // We need to know where it WAS to delete/move it.
            
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
            console.error("moveNode error:", e);
        }
    }

    /**
     * Wrap a node with a new element
     */
    wrapNode(targetId: string, wrapperTag: string, wrapperId?: string): string {
        try {
            const targetTreeId = stringToTreeId(targetId);
            const targetNode = this.tree.getNodeByID(targetTreeId);
            if (!targetNode) return "";

            // Generate wrapper ID
            let actualWrapperId = wrapperId ?? ("w-" + targetId);

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
                        return actualWrapperId; // Already correctly wrapped
                    }
                }
            } catch {
                // Wrapper doesn't exist, continue
            }

            // Get target's parent and index
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

            // Emit patches
            // Emit patches
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
            console.error("wrapNode error:", e);
            return "";
        }
    }

    /**
     * Unwrap a node by removing its wrapper
     */
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

            // Get wrapper's index in parent
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
            console.error("unwrapNode error:", e);
            return false;
        }
    }

    // ==================== REPLAY Methods ====================

    applyPatch(patch: GeneralizedPatch): any {
        try {
            const { action, path, value, length } = patch;
            const targetType = path[0];
            if (targetType !== "nodes") return;

            const id = path[1] as string;
            
            // Handle creation (insert into children)
            if (action === "insert" && path.length >= 4 && path[2] === "children") {
                const parentId = id; // path is [nodes, parentId, children, index]
                const index = path[3] as number;
                // value serves as Node definition
                const nodeDef = value as Node; 
                return this.addChildNode(parentId, nodeDef, undefined, index);
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

            // Prop updates
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
                     // Path usually [nodes, id, value, index]
                     if (path.length === 4) {
                         const index = path[3] as number;
                         const insertText = value as string;
                         const deleteCount = length || 0;
                         this.spliceValue(id, index, deleteCount, insertText);
                     }
                }
            }

        } catch (e) {
            console.error("applyPatch error:", e);
        }
    }

    // ==================== NODE CREATION Methods ====================

    /**
     * Add a child node to a parent element
     */
    addChildNode(parentId: string, child: Node, id?: string, index?: number): string {
        try {
            const parentTreeId = stringToTreeId(parentId);
            const parentNode = this.tree.getNodeByID(parentTreeId);
            if (!parentNode) return "";

            // Create new node as child of parent
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
            console.error("addChildNode error:", e);
            return "";
        }
    }

    /**
     * Add an element child to a parent
     */
    addElementChildNode(parentId: string, tag: string, id?: string): string {
        const node: ElementNode = { kind: "element", tag, attrs: {}, children: [] };
        return this.addChildNode(parentId, node, id);
    }

    /**
     * Add a value child to a parent
     */
    addValueChildNode(parentId: string, value: string, id?: string): string {
        const node: ValueNode = { kind: "value", value };
        return this.addChildNode(parentId, node, id);
    }

    /**
     * Add a sibling node before the given node
     */
    addSiblingNodeBefore(siblingId: string): string | undefined {
        return this.addSiblingNode(siblingId, 0);
    }

    /**
     * Add a sibling node after the given node
     */
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

            // Find sibling's index
            const siblings = parent.children();
            if (!siblings) return undefined;

            let siblingIndex = 0;
            for (let i = 0; i < siblings.length; i++) {
                if (treeIdToString(siblings[i].id) === siblingId) {
                    siblingIndex = i;
                    break;
                }
            }

            // Create new node at correct position
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
            console.error("addSiblingNode error:", e);
            return undefined;
        }
    }



    // ==================== SELECTION Methods ====================

    findLowestCommonAncestor(nodeIds: string[]): string | null {
        if (nodeIds.length === 0) return null;

        let currentLca: string | null = nodeIds[0];

        for (let i = 1; i < nodeIds.length; i++) {
            if (!currentLca) break;
            const nextNode = nodeIds[i];

            const ancestors = new Set<string>();
            let curr: string | null = currentLca;
            while (curr) {
                ancestors.add(curr);
                curr = this.getParentId(curr);
            }

            let runner: string | null = nextNode;
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

        return currentLca || null;
    }

    generalizeSelectionWithInfo(nodeIds: string[]): {
        lcaId: string | null;
        selectorTag: string | undefined;
        selectorDepth: number | undefined;
        selectorKind: "element" | "value" | undefined;
        matchingNodeIds: string[];
    } {
        if (nodeIds.length === 0) {
            return { lcaId: null, selectorTag: undefined, selectorDepth: undefined, selectorKind: undefined, matchingNodeIds: [] };
        }

        let lcaId = this.findLowestCommonAncestor(nodeIds);
        if (!lcaId) {
            return { lcaId: null, selectorTag: undefined, selectorDepth: undefined, selectorKind: undefined, matchingNodeIds: [] };
        }

        // When a single node is selected, use its parent as LCA
        if (nodeIds.length === 1) {
            const parentId = this.getParentId(lcaId);
            if (parentId) lcaId = parentId;
        }

        const getDepthFromLca = (nodeId: string): number => {
            let depth = 0;
            let current: string | null = nodeId;
            while (current && current !== lcaId) {
                depth++;
                current = this.getParentId(current);
            }
            return current === lcaId ? depth : -1;
        };

        const selectedTags = new Set<string>();
        const selectedDepths = new Set<number>();
        let hasValues = false;
        let hasElements = false;

        for (const id of nodeIds) {
            const node = this.getNode(id);
            if (!node) continue;

            const depth = getDepthFromLca(id);
            if (depth >= 0) selectedDepths.add(depth);

            if (node.kind === 'element') {
                selectedTags.add(node.tag);
                hasElements = true;
            } else if (node.kind === 'value') {
                hasValues = true;
            }
        }

        const allSameTag = selectedTags.size === 1 && !hasValues;
        const allSameDepth = selectedDepths.size === 1;

        const selectorKind: "element" | "value" | undefined =
            (hasValues && !hasElements) ? "value" :
            (hasElements && !hasValues) ? "element" :
            undefined;

        if (!allSameTag && !allSameDepth) {
            return {
                lcaId,
                selectorTag: undefined,
                selectorDepth: undefined,
                selectorKind,
                matchingNodeIds: [...nodeIds]
            };
        }

        const selectorTag = allSameTag ? [...selectedTags][0] : undefined;
        const selectorDepth = allSameDepth ? [...selectedDepths][0] : undefined;

        const results: string[] = [];

        const traverse = (currentId: string, currentDepth: number) => {
            const node = this.getNode(currentId);
            if (!node) return;

            if (node.kind === 'element') {
                const tagMatches = selectorTag === undefined || node.tag === selectorTag;
                const depthMatches = selectorDepth === undefined || currentDepth === selectorDepth;
                const kindMatches = selectorKind === undefined || selectorKind === 'element';

                if (tagMatches && depthMatches && kindMatches && currentDepth > 0) {
                    results.push(currentId);
                }

                for (const childId of node.children) {
                    traverse(childId, currentDepth + 1);
                }
            } else if (node.kind === 'value') {
                const depthMatches = selectorDepth === undefined || currentDepth === selectorDepth;
                const kindMatches = selectorKind === undefined || selectorKind === 'value';
                if (depthMatches && kindMatches && currentDepth > 0) {
                    results.push(currentId);
                }
            }
        };

        traverse(lcaId, 0);
        return { lcaId, selectorTag, selectorDepth, selectorKind, matchingNodeIds: results };
    }

    generalizeSelection(nodeIds: string[]): string[] {
        const result = this.generalizeSelectionWithInfo(nodeIds);
        return result.matchingNodeIds;
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize the document with a root node
     * Called internally when creating a new document
     */
    initializeDocument(): void {
        // Create root node
        const rootNode = this.tree.createNode();
        const rootData = rootNode.data;
        rootData.set(NODE_KIND, "element");
        rootData.set(NODE_TAG, "section");
        rootData.setContainer(NODE_ATTRS, new LoroMap());

        const rootId = treeIdToString(rootNode.id);

        // Helper to add element child
        const addElement = (parentId: string, tag: string): string => {
            return this.addElementChildNode(parentId, tag);
        };

        // Helper to add value child
        const addValue = (parentId: string, value: string): string => {
            return this.addValueChildNode(parentId, value);
        };

        // Create initial document structure
        const sectionId = addElement(rootId, "section");
        this.updateAttribute(sectionId, "style", { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 });
        this.updateAttribute(sectionId, "data-testid", "section");

        // Article A
        const articleAId = addElement(sectionId, "article");
        const h2AId = addElement(articleAId, "h2");
        addValue(h2AId, "Article A");
        const pAId = addElement(articleAId, "p");
        addValue(pAId, "Lorem ipsum dolor sit amet, consectetur adipiscing elit.");
        const ulAId = addElement(articleAId, "ul");
        const li1Id = addElement(ulAId, "li");
        addValue(li1Id, "Item A1");
        const li2Id = addElement(ulAId, "li");
        addValue(li2Id, "Item A2");
        const li3Id = addElement(ulAId, "li");
        addValue(li3Id, "Item A3");

        // Article B
        const articleBId = addElement(sectionId, "article");
        const h2BId = addElement(articleBId, "h2");
        addValue(h2BId, "Article B");
        const pBId = addElement(articleBId, "p");
        addValue(pBId, "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.");
        const divBId = addElement(articleBId, "div");
        this.updateAttribute(divBId, "style", { display: 'flex', gap: 8 });
        const btn1Id = addElement(divBId, "button");
        addValue(btn1Id, "Button 1");
        const btn2Id = addElement(divBId, "button");
        addValue(btn2Id, "Button 2");
        const btn3Id = addElement(divBId, "button");
        addValue(btn3Id, "Button 3");

        // Article C
        const articleCId = addElement(sectionId, "article");
        this.updateAttribute(articleCId, "style", { gridColumn: 'span 2' });
        const h2CId = addElement(articleCId, "h2");
        addValue(h2CId, "Article C");
        const gridCId = addElement(articleCId, "div");
        this.updateAttribute(gridCId, "style", { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 });
        for (let i = 0; i < 9; i++) {
            const boxId = addElement(gridCId, "div");
            this.updateAttribute(boxId, "style", { padding: 12, background: '#f7f7f7', border: '1px dashed #ccc', borderRadius: 6 });
            addValue(boxId, `Box ${i + 1}`);
        }

        // Article D (Table)
        const articleDId = addElement(sectionId, "article");
        this.updateAttribute(articleDId, "style", { gridColumn: 'span 2' });
        const h2DId = addElement(articleDId, "h2");
        addValue(h2DId, "Table Data");
        const tableId = addElement(articleDId, "table");
        this.updateAttribute(tableId, "border", "1");
        this.updateAttribute(tableId, "style", { width: '100%', borderCollapse: 'collapse' });

        const theadId = addElement(tableId, "thead");
        const theadTrId = addElement(theadId, "tr");
        const th1Id = addElement(theadTrId, "th");
        addValue(th1Id, "Name");
        const th2Id = addElement(theadTrId, "th");
        addValue(th2Id, "Role");
        const th3Id = addElement(theadTrId, "th");
        addValue(th3Id, "Status");

        const tbodyId = addElement(tableId, "tbody");
        const tr1Id = addElement(tbodyId, "tr");
        const td1aId = addElement(tr1Id, "td");
        addValue(td1aId, "Alice");
        const td1bId = addElement(tr1Id, "td");
        addValue(td1bId, "Developer");
        const td1cId = addElement(tr1Id, "td");
        addValue(td1cId, "Active");

        const tr2Id = addElement(tbodyId, "tr");
        const td2aId = addElement(tr2Id, "td");
        addValue(td2aId, "Bob");
        const td2bId = addElement(tr2Id, "td");
        addValue(td2bId, "Designer");
        const td2cId = addElement(tr2Id, "td");
        addValue(td2cId, "Inactive");
    }
}
