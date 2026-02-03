/**
 * Functions to calculate history from Loro's diff API
 *
 * This provides reactive history that automatically updates on undo/redo
 * by computing the diff between initial state and current state.
 */

import type { ContainerID, LoroDoc, MapDiff, TextDiff, TreeDiff } from "loro-crdt";

import { NODE_ACTIONS,NODE_ATTRS, NODE_TEXT, TREE_CONTAINER, treeIdToString } from "./loroHelpers.js";
import type { GeneralizedPatch } from "./types.js";

/**
 * Container path segment in loro diff path
 */
interface PathSegment {
    type: "seq" | "map" | "tree";
    value: string | number;
}

/**
 * Parse a loro ContainerID to extract the node ID if it's a tree node container
 * ContainerID format: "cid:peer@counter:type" for tree nodes with LoroTreeID
 * Or for sub-containers: just the container type
 */
function parseContainerId(cid: ContainerID): { nodeId?: string; type: string } {
    const cidStr = String(cid);
    // Match tree node ID pattern: e.g., "cid:0@123:Tree"
    const treeMatch = cidStr.match(/^cid:(\d+)@(\d+):(\w+)/);
    if (treeMatch) {
        const [, peer, counter, type] = treeMatch;
        return { nodeId: `${peer}@${counter}`, type: type || "" };
    }
    // For named containers like "tree", "peerNames", etc.
    return { type: cidStr };
}

/**
 * Convert loro TreeDiffItem to GeneralizedPatch
 */
function treeDiffToPatches(diff: TreeDiff, doc: LoroDoc): GeneralizedPatch[] {
    const patches: GeneralizedPatch[] = [];

    for (const item of diff.diff) {
        const targetId = treeIdToString(item.target);

        if (item.action === "create") {
            const parentId = item.parent ? treeIdToString(item.parent) : null;
            if (parentId) {
                // Get node data from the tree
                const tree = doc.getTree(TREE_CONTAINER);
                const treeNode = tree.getNodeByID(item.target);
                if (treeNode) {
                    const data = treeNode.data;
                    const kind = data.get("kind") as string | undefined;
                    const nodeValue: Record<string, unknown> = {
                        id: targetId,
                        kind: kind || "element",
                    };

                    // Add kind-specific data
                    if (kind === "element") {
                        nodeValue.tag = data.get("tag") as string || "div";
                        const attrs = data.get(NODE_ATTRS);
                        if (attrs && typeof attrs === "object" && "toJSON" in attrs) {
                            nodeValue.attrs = (attrs as { toJSON(): Record<string, unknown> }).toJSON();
                        }
                    } else if (kind === "value") {
                        const text = data.get(NODE_TEXT);
                        if (text && typeof text === "object" && "toString" in text) {
                            nodeValue.value = (text as { toString(): string }).toString();
                        }
                    } else if (kind === "action") {
                        nodeValue.label = data.get("label") as string || "Action";
                        nodeValue.target = data.get("target") as string || "";
                        const actions = data.get(NODE_ACTIONS);
                        if (actions && typeof actions === "object" && "toJSON" in actions) {
                            nodeValue.actions = (actions as { toJSON(): GeneralizedPatch[] }).toJSON();
                        }
                    } else if (kind === "formula") {
                        nodeValue.operation = data.get("operation") as string || "";
                    } else if (kind === "ref") {
                        nodeValue.target = data.get("refTarget") as string || "";
                    }

                    // Check if this was a copy (has sourceId)
                    const sourceId = data.get("sourceId") as string | undefined;
                    if (sourceId) {
                        nodeValue.sourceId = sourceId;
                    }

                    patches.push({
                        action: "insert",
                        path: ["nodes", parentId, "children", item.index],
                        value: nodeValue,
                    });
                }
            }
        } else if (item.action === "delete") {
            patches.push({
                action: "del",
                path: ["nodes", targetId],
            });
        } else if (item.action === "move") {
            const newParentId = item.parent ? treeIdToString(item.parent) : null;
            if (newParentId) {
                patches.push({
                    action: "move",
                    path: ["nodes", targetId],
                    value: { parentId: newParentId, index: item.index },
                });
            }
        }
    }

    return patches;
}

/**
 * Text delta item - simplified type for our use case
 */
interface TextDeltaItem {
    retain?: number;
    delete?: number;
    insert?: string;
}

/**
 * Convert loro TextDiff to GeneralizedPatch for a specific node
 */
function textDiffToPatches(nodeId: string, diff: TextDiff): GeneralizedPatch[] {
    const patches: GeneralizedPatch[] = [];
    let position = 0;

    for (const rawDelta of diff.diff) {
        // Cast to simplified type to avoid union type narrowing issues
        const delta = rawDelta as TextDeltaItem;

        if (delta.retain !== undefined) {
            position += delta.retain;
        } else if (delta.delete !== undefined) {
            patches.push({
                action: "splice",
                path: ["nodes", nodeId, "value", position],
                length: delta.delete,
                value: "",
            });
        } else if (delta.insert !== undefined) {
            const text = typeof delta.insert === "string" ? delta.insert : String(delta.insert);
            patches.push({
                action: "splice",
                path: ["nodes", nodeId, "value", position],
                length: 0,
                value: text,
            });
            position += text.length;
        }
    }

    return patches;
}

/**
 * Convert loro MapDiff to GeneralizedPatch for node attributes
 */
function mapDiffToPatches(nodeId: string, attrPath: string, diff: MapDiff): GeneralizedPatch[] {
    const patches: GeneralizedPatch[] = [];

    for (const [key, value] of Object.entries(diff.updated)) {
        if (value === undefined) {
            patches.push({
                action: "del",
                path: ["nodes", nodeId, attrPath, key],
            });
        } else {
            patches.push({
                action: "put",
                path: ["nodes", nodeId, attrPath, key],
                value,
            });
        }
    }

    return patches;
}

/**
 * Extract node ID from a loro container path
 * Path format examples: [["tree", tree], ["data", treeNode], ...]
 */
function extractNodeIdFromPath(path: PathSegment[], containerId: ContainerID): string | null {
    // Check if containerId contains a node reference
    const parsed = parseContainerId(containerId);
    if (parsed.nodeId) {
        return parsed.nodeId;
    }

    // Try to find node ID in path segments
    for (const segment of path) {
        if (typeof segment.value === "string") {
            // Check if it looks like a tree node ID (peer@counter)
            if (/^\d+@\d+$/.test(segment.value)) {
                return segment.value;
            }
        }
    }

    return null;
}

/**
 * Calculate history patches from loro document diff
 *
 * This computes the difference between an empty document and the current state,
 * giving us all operations that are currently in effect.
 *
 * @param doc The loro document
 * @param from Starting frontiers (default: empty = beginning of time)
 * @param to Ending frontiers (default: current = latest state)
 */
export function calculateHistoryFromDiff(
    doc: LoroDoc,
    from?: ReturnType<LoroDoc["frontiers"]>,
    to?: ReturnType<LoroDoc["frontiers"]>
): GeneralizedPatch[] {
    const startFrontiers = from || [];
    const endFrontiers = to || doc.frontiers();

    // Get diff between versions
    // Using for_json=false to get Diff type with full container references
    const diffs = doc.diff(startFrontiers, endFrontiers, false);

    const allPatches: GeneralizedPatch[] = [];

    for (const [containerId, diff] of diffs) {
        if (diff.type === "tree") {
            // Tree changes (node create/delete/move)
            allPatches.push(...treeDiffToPatches(diff as TreeDiff, doc));
        } else if (diff.type === "text") {
            // Text changes - need to find which node this belongs to
            // ContainerID format for sub-containers includes the node
            const nodeId = extractNodeIdFromPath([], containerId);
            if (nodeId) {
                allPatches.push(...textDiffToPatches(nodeId, diff as TextDiff));
            }
        } else if (diff.type === "map") {
            // Map changes (attributes)
            const nodeId = extractNodeIdFromPath([], containerId);
            if (nodeId) {
                allPatches.push(...mapDiffToPatches(nodeId, "attrs", diff as MapDiff));
            }
        }
    }

    return allPatches;
}

/**
 * Create a subscription that provides reactive history
 *
 * Returns a function that can be called to get current history patches,
 * and a cleanup function for the subscription.
 */
export function createHistorySubscription(
    doc: LoroDoc,
    onChange: (patches: GeneralizedPatch[]) => void
): () => void {
    // Initial calculation
    onChange(calculateHistoryFromDiff(doc));

    // Subscribe to changes
    return doc.subscribe(() => {
        onChange(calculateHistoryFromDiff(doc));
    });
}
