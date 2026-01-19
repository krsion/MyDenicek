/**
 * SelectionLogic - Selection algorithms for the document tree
 *
 * Note: Generalized selection logic has been moved to frontend (apps/mywebnicek/src/utils/selectionUtils.ts)
 * This module only contains LCA computation which may be useful for other purposes.
 */

import type { LoroTree } from "loro-crdt";
import * as NodeReader from "./NodeReader.js";

/**
 * Find the lowest common ancestor of a set of nodes
 */
export function findLowestCommonAncestor(
    tree: LoroTree,
    rootId: string,
    nodeIds: string[]
): string | null {
    if (nodeIds.length === 0) return null;

    let currentLca: string | null = nodeIds[0] ?? null;

    for (let i = 1; i < nodeIds.length; i++) {
        if (!currentLca) break;
        const nextNode = nodeIds[i];

        const ancestors = new Set<string>();
        let curr: string | null = currentLca;
        while (curr) {
            ancestors.add(curr);
            curr = NodeReader.getParentId(tree, curr);
        }

        let runner: string | null = nextNode ?? null;
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

    return currentLca;
}
