/**
 * Loro helper functions and constants
 * Internal utilities for working with Loro CRDT types
 */

import { LoroDoc, LoroMap, LoroText, LoroTree, LoroTreeNode, type TreeID } from "loro-crdt";

import type { ElementNode, Node, NodeData, ValueNode } from "./types.js";

/**
 * Internal constants for Loro container names
 */
export const TREE_CONTAINER = "tree";

/**
 * Node data keys
 */
export const NODE_KIND = "kind";
export const NODE_TAG = "tag";
export const NODE_ATTRS = "attrs";
export const NODE_TEXT = "text";
export const NODE_SOURCE_ID = "sourceId";

/**
 * Convert TreeID to a stable string ID for our public API
 */
export function treeIdToString(id: TreeID): string {
    return id;
}

/**
 * Parse our string ID back to TreeID
 */
export function stringToTreeId(id: string): TreeID {
    if (!id.includes("@")) {
        throw new Error(`Invalid TreeID format: ${id}`);
    }
    return id as TreeID;
}

/**
 * Convert a LoroTreeNode to our public Node type
 */
export function loroNodeToNode(treeNode: LoroTreeNode, _tree: LoroTree): Node {
    const data = treeNode.data;
    const kind = data.get(NODE_KIND) as "element" | "value" | undefined;
    const sourceId = data.get(NODE_SOURCE_ID) as string | undefined;

    if (kind === "value") {
        const textContainer = data.get(NODE_TEXT) as LoroText | undefined;
        if (!textContainer) {
            throw new Error("Value node missing text container");
        }
        const node: ValueNode = {
            kind: "value",
            value: textContainer,
            ...(sourceId && { sourceId }),
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
            ...(sourceId && { sourceId }),
        };
        return node;
    }
}

/**
 * Result of building document index
 */
export interface DocumentIndex {
    nodes: Map<string, NodeData>;
    parents: Map<string, string | null>;
    childIds: Map<string, string[]>;
    rootId: string | null;
}

/**
 * Build document index from a LoroDoc.
 * Returns flat maps for O(1) lookups.
 */
export function buildDocumentIndex(doc: LoroDoc): DocumentIndex {
    const tree = doc.getTree(TREE_CONTAINER);
    const roots = tree.roots();

    const nodes = new Map<string, NodeData>();
    const parents = new Map<string, string | null>();
    const childIds = new Map<string, string[]>();

    const rootNode = roots[0];
    if (!rootNode) {
        return { nodes, parents, childIds, rootId: null };
    }

    const rootId = treeIdToString(rootNode.id);

    function walkNode(treeNode: LoroTreeNode, parentId: string | null): void {
        const id = treeIdToString(treeNode.id);
        const data = treeNode.data;
        const kind = data.get(NODE_KIND) as "element" | "value" | undefined;
        const sourceId = data.get(NODE_SOURCE_ID) as string | undefined;

        parents.set(id, parentId);

        if (kind === "value") {
            const textContainer = data.get(NODE_TEXT) as LoroText | undefined;
            if (!textContainer) {
                throw new Error(`Value node ${id} missing text container`);
            }
            // Convert LoroText to string for public API (no Loro types exposed)
            nodes.set(id, { id, kind: "value", value: textContainer.toString(), ...(sourceId && { sourceId }) });
            childIds.set(id, []);
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

            nodes.set(id, { id, kind: "element", tag, attrs, ...(sourceId && { sourceId }) });

            const children: string[] = [];
            const childNodes = treeNode.children();
            if (childNodes) {
                for (const child of childNodes) {
                    children.push(treeIdToString(child.id));
                    walkNode(child, id);
                }
            }
            childIds.set(id, children);
        }
    }

    walkNode(rootNode, null);

    return { nodes, parents, childIds, rootId };
}

// ==================== CONCURRENCY DETECTION ====================

/**
 * Check if an OpId causally precedes another by checking if it's in the deps chain.
 * This checks if opId1's change is in the causal history of opId2.
 */
function opIdCausallyPrecedes(
    doc: LoroDoc,
    opId1: { peer: bigint | `${number}`; counter: number },
    opId2: { peer: bigint | `${number}`; counter: number }
): boolean {
    // If same peer, just compare counters
    const peer1 = opId1.peer.toString();
    const peer2 = opId2.peer.toString();

    if (peer1 === peer2) {
        return opId1.counter < opId2.counter;
    }

    // Check if opId2's change has opId1 (or something after it from peer1) in its causal history
    // We do this by checking the lamport timestamps - if lamport1 < lamport2, check deps
    const change1 = doc.getChangeAt({ peer: peer1 as `${number}`, counter: opId1.counter });
    const change2 = doc.getChangeAt({ peer: peer2 as `${number}`, counter: opId2.counter });

    // If change2's deps include something from peer1 with counter >= opId1.counter,
    // then change2 "knew about" change1 (or something after it)
    for (const dep of change2.deps) {
        if (dep.peer.toString() === peer1 && dep.counter >= opId1.counter) {
            return true;
        }
    }

    // Also check recursively through the deps chain by comparing lamport
    // If lamport2 > lamport1 and they share any common history, check more deeply
    // For simplicity, we use a heuristic: if change2 has higher lamport and has any deps
    // that have lamport >= lamport1, there's likely a causal relationship
    if (change2.lamport > change1.lamport && change2.deps.length > 0) {
        // Check each dep to see if it could have seen change1
        for (const dep of change2.deps) {
            const depChange = doc.getChangeAt(dep);
            if (depChange.lamport >= change1.lamport) {
                // This dep was created at or after change1, so change2 "knows about" change1
                // through this dep (indirectly)
                if (dep.peer.toString() === peer1 && dep.counter >= opId1.counter) {
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * Check if two tree nodes were created concurrently (neither knew about the other).
 * Returns true if the nodes are concurrent (should be flattened in wrap cleanup).
 * Returns false if one causally precedes the other (intentional nesting, keep).
 *
 * Two operations are concurrent if neither causally precedes the other.
 */
export function areNodesConcurrent(
    doc: LoroDoc,
    node1: LoroTreeNode,
    node2: LoroTreeNode
): boolean {
    const id1 = node1.creationId();
    const id2 = node2.creationId();

    // Same peer - definitely not concurrent (one was created after the other)
    if (id1.peer.toString() === id2.peer.toString()) {
        return false;
    }

    // Check if either causally precedes the other
    const oneBeforeTwo = opIdCausallyPrecedes(doc, id1, id2);
    const twoBeforeOne = opIdCausallyPrecedes(doc, id2, id1);

    // Concurrent if neither precedes the other
    return !oneBeforeTwo && !twoBeforeOne;
}
