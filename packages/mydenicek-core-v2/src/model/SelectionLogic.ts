/**
 * SelectionLogic - Selection algorithms for the document tree
 */

import type { LoroTree } from "loro-crdt";
import * as NodeReader from "./NodeReader.js";

export interface SelectionInfo {
    lcaId: string | null;
    selectorTag: string | undefined;
    selectorDepth: number | undefined;
    selectorKind: "element" | "value" | undefined;
    matchingNodeIds: string[];
}

/**
 * Find the lowest common ancestor of a set of nodes
 */
export function findLowestCommonAncestor(
    tree: LoroTree,
    rootId: string,
    nodeIds: string[]
): string | null {
    if (nodeIds.length === 0) return null;

    let currentLca: string | null = nodeIds[0];

    for (let i = 1; i < nodeIds.length; i++) {
        if (!currentLca) break;
        const nextNode = nodeIds[i];

        const ancestors = new Set<string>();
        let curr: string | null = currentLca;
        while (curr) {
            ancestors.add(curr);
            curr = NodeReader.getParentId(tree, curr);
        }

        let runner: string | null = nextNode;
        let found = false;
        while (runner) {
            if (ancestors.has(runner)) {
                currentLca = runner;
                found = true;
                break;
            }
            runner = NodeReader.getParentId(tree, runner);
        }
        if (!found) {
            currentLca = rootId;
        }
    }

    return currentLca || null;
}

/**
 * Generalize a selection to find matching nodes with additional info
 */
export function generalizeSelectionWithInfo(
    tree: LoroTree,
    rootId: string,
    nodeIds: string[]
): SelectionInfo {
    if (nodeIds.length === 0) {
        return { lcaId: null, selectorTag: undefined, selectorDepth: undefined, selectorKind: undefined, matchingNodeIds: [] };
    }

    let lcaId = findLowestCommonAncestor(tree, rootId, nodeIds);
    if (!lcaId) {
        return { lcaId: null, selectorTag: undefined, selectorDepth: undefined, selectorKind: undefined, matchingNodeIds: [] };
    }

    // When a single node is selected, use its parent as LCA
    if (nodeIds.length === 1) {
        const parentId = NodeReader.getParentId(tree, lcaId);
        if (parentId) lcaId = parentId;
    }

    const getDepthFromLca = (nodeId: string): number => {
        let depth = 0;
        let current: string | null = nodeId;
        while (current && current !== lcaId) {
            depth++;
            current = NodeReader.getParentId(tree, current);
        }
        return current === lcaId ? depth : -1;
    };

    const selectedTags = new Set<string>();
    const selectedDepths = new Set<number>();
    let hasValues = false;
    let hasElements = false;

    for (const id of nodeIds) {
        const node = NodeReader.getNode(tree, id);
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
        const node = NodeReader.getNode(tree, currentId);
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

/**
 * Generalize a selection to find matching nodes
 */
export function generalizeSelection(
    tree: LoroTree,
    rootId: string,
    nodeIds: string[]
): string[] {
    const result = generalizeSelectionWithInfo(tree, rootId, nodeIds);
    return result.matchingNodeIds;
}
