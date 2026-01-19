/**
 * DocumentView - encapsulated read-only view of the document tree
 *
 * Consumers use methods (getNode, getChildIds, getParentId) instead of
 * direct property access. Internal structure is hidden.
 */

import type { NodeData } from "./types.js";

/**
 * Internal element node type (not exported)
 */
interface InternalElementNode {
    id: string;
    kind: "element";
    tag: string;
    attrs: Record<string, unknown>;
    children: InternalNode[];
}

/**
 * Internal value node type (not exported)
 */
interface InternalValueNode {
    id: string;
    kind: "value";
    value: string;
}

/**
 * Internal node union type (not exported)
 */
type InternalNode = InternalElementNode | InternalValueNode;

/**
 * DocumentView provides a read-only, encapsulated view of the document tree.
 *
 * All lookups (node, children, parent) are O(1).
 * The internal tree structure is hidden from consumers.
 */
export class DocumentView {
    private readonly tree: InternalNode | null;
    private readonly index: Map<string, InternalNode>;
    private readonly parentMap: Map<string, string | null>;

    /**
     * Create a DocumentView from an internal tree structure.
     * This constructor is intended for internal use by LoroDocWrapper.
     */
    constructor(tree: InternalNode | null) {
        this.tree = tree;
        this.index = new Map();
        this.parentMap = new Map();

        if (tree) {
            this.buildMaps(tree, null);
        }
    }

    /**
     * Build the index and parent maps by traversing the tree
     */
    private buildMaps(node: InternalNode, parentId: string | null): void {
        this.index.set(node.id, node);
        this.parentMap.set(node.id, parentId);

        if (node.kind === "element") {
            for (const child of node.children) {
                this.buildMaps(child, node.id);
            }
        }
    }

    /**
     * Get the root node ID, or null if the document is empty
     */
    getRootId(): string | null {
        return this.tree?.id ?? null;
    }

    /**
     * Get node data by ID. Returns null if node doesn't exist.
     * Returns a plain data object (no internal structure).
     */
    getNode(id: string): NodeData | null {
        const node = this.index.get(id);
        if (!node) return null;

        if (node.kind === "value") {
            return { id: node.id, kind: "value", value: node.value };
        }
        return {
            id: node.id,
            kind: "element",
            tag: node.tag,
            attrs: { ...node.attrs }
        };
    }

    /**
     * Get the IDs of all children of a node.
     * Returns empty array if node doesn't exist or is a value node.
     */
    getChildIds(parentId: string): string[] {
        const node = this.index.get(parentId);
        if (!node || node.kind !== "element") return [];
        return node.children.map(c => c.id);
    }

    /**
     * Get the parent ID of a node.
     * Returns null if node is root or doesn't exist.
     */
    getParentId(nodeId: string): string | null {
        return this.parentMap.get(nodeId) ?? null;
    }

    /**
     * Get all node IDs in the document.
     */
    getAllNodeIds(): string[] {
        return [...this.index.keys()];
    }

    /**
     * Check if a node exists in the document.
     */
    hasNode(id: string): boolean {
        return this.index.has(id);
    }

    /**
     * Get the total number of nodes in the document.
     */
    getNodeCount(): number {
        return this.index.size;
    }

    /**
     * Walk the tree depth-first, yielding each node with its depth and parent ID.
     * Useful for serialization and rendering.
     */
    *walkDepthFirst(): Generator<{ node: NodeData; depth: number; parentId: string | null }> {
        if (!this.tree) return;

        function* walk(
            node: InternalNode,
            depth: number,
            parentId: string | null
        ): Generator<{ node: NodeData; depth: number; parentId: string | null }> {
            const nodeData: NodeData = node.kind === "value"
                ? { id: node.id, kind: "value", value: node.value }
                : { id: node.id, kind: "element", tag: node.tag, attrs: { ...node.attrs } };

            yield { node: nodeData, depth, parentId };

            if (node.kind === "element") {
                for (const child of node.children) {
                    yield* walk(child, depth + 1, node.id);
                }
            }
        }

        yield* walk(this.tree, 0, null);
    }
}

/**
 * Type for the internal node structure used when constructing DocumentView.
 * This is exported for use by LoroDocWrapper but should not be used elsewhere.
 * @internal
 */
export type { InternalNode, InternalElementNode, InternalValueNode };
