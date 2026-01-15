/**
 * Internal wrapper around LoroDoc
 * This file contains all Loro-specific code and should not be exposed publicly
 */

import { Frontiers, LoroDoc, LoroMap, LoroText, LoroTree, LoroTreeNode, TreeID } from "loro-crdt";
import type { DocumentSnapshot, ElementNode, Node, ValueNode } from "../types.js";

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
 * TreeID in Loro is a string format: `${counter}@${peer}`
 * e.g., "0@123456789"
 */

/**
 * Convert TreeID to a stable string ID for our public API
 * We use the TreeID directly since it's already a string
 */
export function treeIdToString(id: TreeID): string {
    return id;
}

/**
 * Parse our string ID back to TreeID
 * Since TreeID is already a string in the correct format, just return it
 */
export function stringToTreeId(id: string): TreeID {
    // TreeID format is "${counter}@${peer}"
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
 * Get all nodes from the tree as a record
 * Recursively walks the tree from roots since toArray() only returns top-level nodes
 */
export function getAllNodes(tree: LoroTree): Record<string, Node> {
    const nodes: Record<string, Node> = {};

    // Helper to recursively collect nodes
    function collectNode(treeNode: LoroTreeNode): void {
        const id = treeIdToString(treeNode.id);
        nodes[id] = loroNodeToNode(treeNode, tree);

        // Recursively collect children
        const children = treeNode.children();
        if (children) {
            for (const child of children) {
                collectNode(child);
            }
        }
    }

    // Start from roots
    const roots = tree.roots();
    for (const root of roots) {
        collectNode(root);
    }

    return nodes;
}

/**
 * Create a document snapshot from a LoroDoc
 */
export function createSnapshot(doc: LoroDoc): DocumentSnapshot {
    const tree = doc.getTree(TREE_CONTAINER);

    const nodes = getAllNodes(tree);

    // Find root - the tree should have exactly one root node
    const roots = tree.roots();
    const root = roots.length > 0 ? treeIdToString(roots[0].id) : "";

    return {
        root,
        nodes,
    };
}

/**
 * Frontiers type alias for external use
 */
export type Version = Frontiers;

/**
 * Internal wrapper class for LoroDoc operations
 */
export class LoroDocWrapper {
    private _doc: LoroDoc;

    constructor(peerId?: bigint) {
        this._doc = new LoroDoc();
        if (peerId !== undefined) {
            this._doc.setPeerId(peerId);
        }
    }

    /** Get the underlying LoroDoc (internal use only) */
    get doc(): LoroDoc {
        return this._doc;
    }

    /** Get the tree container */
    get tree(): LoroTree {
        return this._doc.getTree(TREE_CONTAINER);
    }

    /** Get the config map */
    get configMap(): LoroMap {
        return this._doc.getMap(CONFIG_CONTAINER);
    }

    /** Get a node by ID */
    getNode(id: string): LoroTreeNode | undefined {
        try {
            const treeId = stringToTreeId(id);
            return this.tree.getNodeByID(treeId);
        } catch {
            return undefined;
        }
    }

    /** Create a snapshot */
    getSnapshot(): DocumentSnapshot {
        return createSnapshot(this._doc);
    }

    /** Export document as bytes */
    export(mode: "update" | "snapshot", from?: Version): Uint8Array {
        if (mode === "snapshot") {
            return this._doc.export({ mode: "snapshot" });
        } else {
            if (from && from.length > 0) {
                // Convert frontiers to VersionVector for export
                const vv = this._doc.frontiersToVV(from);
                return this._doc.export({ mode: "update", from: vv });
            }
            return this._doc.export({ mode: "update" });
        }
    }

    /** Import bytes into document */
    import(bytes: Uint8Array): void {
        this._doc.import(bytes);
    }

    /** Get current version (frontiers) */
    getVersion(): Version {
        return this._doc.frontiers();
    }

    /** Commit pending changes */
    commit(origin?: string): void {
        if (origin) {
            this._doc.commit({ origin });
        } else {
            this._doc.commit();
        }
    }

    /** Subscribe to all changes */
    subscribe(listener: () => void): () => void {
        // Use subscribe on the document to listen for all changes
        const subscription = this._doc.subscribe((event) => {
            listener();
        });
        return subscription;
    }

    /** Subscribe to local updates for sync */
    subscribeLocalUpdates(listener: (bytes: Uint8Array) => void): () => void {
        return this._doc.subscribeLocalUpdates(listener);
    }
}
