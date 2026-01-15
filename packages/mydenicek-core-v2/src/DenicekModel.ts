/**
 * DenicekModel - Read/write operations for the document tree
 *
 * This class is a facade that delegates to focused modules for better organization.
 * Modules: NodeReader, NodeWriter, NodeCreator, NodeWrapper, SelectionLogic
 */

import { LoroMap, LoroText, LoroTree } from "loro-crdt";
import type { DenicekDocument } from "./DenicekDocument.js";
import {
    NODE_ATTRS,
    NODE_KIND,
    NODE_TAG,
    NODE_TEXT,
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
import { handleModelError } from "./errors.js";
import * as NodeReader from "./model/NodeReader.js";
import * as NodeWriter from "./model/NodeWriter.js";
import * as NodeCreator from "./model/NodeCreator.js";
import * as NodeWrapper from "./model/NodeWrapper.js";
import * as SelectionLogic from "./model/SelectionLogic.js";

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

    private get loroDoc() {
        return this.doc._internal.doc;
    }

    private get tree(): LoroTree {
        return this.loroDoc.getTree(TREE_CONTAINER);
    }

    // ==================== READ Methods (delegated to NodeReader) ====================

    get rootId(): string {
        return NodeReader.getRootId(this.tree);
    }

    getNode(id: string): Node | undefined {
        return NodeReader.getNode(this.tree, id);
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
        return NodeReader.getParents(this.tree, childId);
    }

    getParentId(childId: string): string | null {
        return NodeReader.getParentId(this.tree, childId);
    }

    getFirstChildTag(node: ElementNode): string | undefined {
        return NodeReader.getFirstChildTag(this.tree, node);
    }

    getChildrenIds(node: ElementNode): string[] {
        return NodeReader.getChildrenIds(node);
    }

    // ==================== WRITE Methods (delegated to NodeWriter) ====================

    insertText(id: string, index: number, text: string): void {
        this.spliceValue(id, index, 0, text);
    }

    deleteText(id: string, index: number, length: number): void {
        this.spliceValue(id, index, length, "");
    }

    updateAttribute(id: string, key: string, value: unknown | undefined): void {
        NodeWriter.updateAttribute(this.tree, this.emitPatch.bind(this), id, key, value);
    }

    updateTag(id: string, newTag: string): void {
        NodeWriter.updateTag(this.tree, this.emitPatch.bind(this), id, newTag);
    }

    spliceValue(id: string, index: number, deleteCount: number, insertText: string): void {
        NodeWriter.spliceValue(this.tree, this.emitPatch.bind(this), id, index, deleteCount, insertText);
    }

    deleteNode(id: string): void {
        NodeWriter.deleteNode(this.tree, this.emitPatch.bind(this), id);
    }

    moveNode(nodeId: string, newParentId: string, index?: number): void {
        NodeWriter.moveNode(this.tree, this.emitPatch.bind(this), nodeId, newParentId, index);
    }

    // ==================== WRAP Methods (delegated to NodeWrapper) ====================

    wrapNode(targetId: string, wrapperTag: string, wrapperId?: string): string {
        return NodeWrapper.wrapNode(this.tree, this.emitPatch.bind(this), targetId, wrapperTag, wrapperId);
    }

    unwrapNode(wrapperId: string): boolean {
        return NodeWrapper.unwrapNode(this.tree, wrapperId);
    }

    // ==================== REPLAY Methods ====================

    applyPatch(patch: GeneralizedPatch): any {
        try {
            const { action, path, value, length } = patch;
            const targetType = path[0];
            if (targetType !== "nodes") return;

            const id = path[1] as string;

            if (action === "insert" && path.length >= 4 && path[2] === "children") {
                const parentId = id;
                const index = path[3] as number;
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

    // ==================== NODE CREATION Methods (delegated to NodeCreator) ====================

    addChildNode(parentId: string, child: Node, id?: string, index?: number): string {
        return NodeCreator.addChildNode(this.tree, this.emitPatch.bind(this), parentId, child, index);
    }

    addElementChildNode(parentId: string, tag: string, id?: string): string {
        return NodeCreator.addElementChildNode(this.tree, this.emitPatch.bind(this), parentId, tag);
    }

    addValueChildNode(parentId: string, value: string, id?: string): string {
        return NodeCreator.addValueChildNode(this.tree, this.emitPatch.bind(this), parentId, value);
    }

    addSiblingNodeBefore(siblingId: string): string | undefined {
        return NodeCreator.addSiblingNode(this.tree, siblingId, 0);
    }

    addSiblingNodeAfter(siblingId: string): string | undefined {
        return NodeCreator.addSiblingNode(this.tree, siblingId, 1);
    }

    // ==================== SELECTION Methods (delegated to SelectionLogic) ====================

    findLowestCommonAncestor(nodeIds: string[]): string | null {
        return SelectionLogic.findLowestCommonAncestor(this.tree, this.rootId, nodeIds);
    }

    generalizeSelectionWithInfo(nodeIds: string[]): SelectionLogic.SelectionInfo {
        return SelectionLogic.generalizeSelectionWithInfo(this.tree, this.rootId, nodeIds);
    }

    generalizeSelection(nodeIds: string[]): string[] {
        return SelectionLogic.generalizeSelection(this.tree, this.rootId, nodeIds);
    }

    // ==================== INITIALIZATION ====================

    initializeDocument(): void {
        const rootNode = this.tree.createNode();
        const rootData = rootNode.data;
        rootData.set(NODE_KIND, "element");
        rootData.set(NODE_TAG, "section");
        rootData.setContainer(NODE_ATTRS, new LoroMap());

        const rootId = treeIdToString(rootNode.id);

        const addElement = (parentId: string, tag: string): string => {
            return this.addElementChildNode(parentId, tag);
        };

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
