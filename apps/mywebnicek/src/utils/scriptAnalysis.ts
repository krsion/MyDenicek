import type { GeneralizedPatch } from "@mydenicek/core-v2";

/**
 * Information about a node created by an insert action
 */
export interface CreatedNode {
    actionIndex: number;   // Which action created it
    originalId: string;    // The ID it was created with
    variable: string;      // The variable name ($1, $2, etc.)
}

/**
 * Analysis of a recorded script's node dependencies
 */
export interface ScriptAnalysis {
    /** Map from original node ID to creation info */
    createdNodes: Map<string, CreatedNode>;
    /** Map from action index to the index of the action that created the node it references */
    dependencies: Map<number, number>;
}

/**
 * Check if a string looks like a Loro OpId (peer@counter format)
 */
function isNodeId(str: string): boolean {
    return /^\d+@\d+$/.test(str);
}

/**
 * Extract the node ID from a path (e.g., ["nodes", "321@18100", "tag"] -> "321@18100")
 */
function extractNodeIdFromPath(path: (string | number)[]): string | null {
    for (const segment of path) {
        const str = String(segment);
        if (isNodeId(str)) {
            return str;
        }
    }
    return null;
}

/**
 * Analyze a script to find created nodes and dependencies.
 * This identifies which insert actions create new nodes and which
 * subsequent actions reference those nodes.
 */
export function analyzeScript(script: GeneralizedPatch[]): ScriptAnalysis {
    const createdNodes = new Map<string, CreatedNode>();
    const dependencies = new Map<number, number>();
    let varCounter = 1;

    // First pass: find all created nodes, assign variables
    script.forEach((action, index) => {
        if (action.action === "insert") {
            const value = action.value as { id?: string } | undefined;
            if (value?.id && isNodeId(value.id)) {
                createdNodes.set(value.id, {
                    actionIndex: index,
                    originalId: value.id,
                    variable: `$${varCounter++}`
                });
            }
        }
    });

    // Second pass: find dependencies (actions that reference created nodes)
    script.forEach((action, index) => {
        const nodeId = extractNodeIdFromPath(action.path);
        if (nodeId) {
            const created = createdNodes.get(nodeId);
            if (created && created.actionIndex < index) {
                // This action references a node created by an earlier action
                dependencies.set(index, created.actionIndex);
            }
        }
    });

    return { createdNodes, dependencies };
}

/**
 * Recursively replace node IDs with variables in a value
 */
function replaceIdsInValue(
    value: unknown,
    createdNodes: Map<string, CreatedNode>
): unknown {
    if (typeof value === "string") {
        const created = createdNodes.get(value);
        return created ? created.variable : value;
    }
    if (Array.isArray(value)) {
        return value.map(v => replaceIdsInValue(v, createdNodes));
    }
    if (value && typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = replaceIdsInValue(v, createdNodes);
        }
        return result;
    }
    return value;
}

/**
 * Generalize a script by replacing literal node IDs with variables ($1, $2, etc.)
 * for nodes that were created during the recording.
 *
 * This allows the existing replay() mechanism to map these variables to
 * newly created node IDs during replay.
 */
export function generalizeScript(
    script: GeneralizedPatch[],
    analysis: ScriptAnalysis
): GeneralizedPatch[] {
    return script.map(action => {
        // Replace IDs in path
        const newPath = action.path.map(segment => {
            const str = String(segment);
            const created = analysis.createdNodes.get(str);
            return created ? created.variable : segment;
        });

        // Replace IDs in value (recursively)
        const newValue = replaceIdsInValue(action.value, analysis.createdNodes);

        return { ...action, path: newPath, value: newValue };
    });
}

/**
 * Get the creation number for display (1, 2, 3...) from a variable name ($1, $2, $3...)
 */
export function getCreationNumber(variable: string): number | null {
    const match = variable.match(/^\$(\d+)$/);
    return match && match[1] ? parseInt(match[1], 10) : null;
}

/**
 * Get the creation info for an action if it creates a node
 */
export function getCreationInfo(
    actionIndex: number,
    analysis: ScriptAnalysis
): { number: number; variable: string } | null {
    for (const [_id, info] of analysis.createdNodes) {
        if (info.actionIndex === actionIndex) {
            const num = getCreationNumber(info.variable);
            if (num !== null) {
                return { number: num, variable: info.variable };
            }
        }
    }
    return null;
}

/**
 * Get the dependency info for an action if it references a created node
 */
export function getDependencyInfo(
    actionIndex: number,
    analysis: ScriptAnalysis
): { number: number; creatorIndex: number } | null {
    const creatorIndex = analysis.dependencies.get(actionIndex);
    if (creatorIndex === undefined) return null;

    // Find which variable the creator assigns
    for (const [_id, info] of analysis.createdNodes) {
        if (info.actionIndex === creatorIndex) {
            const num = getCreationNumber(info.variable);
            if (num !== null) {
                return { number: num, creatorIndex };
            }
        }
    }
    return null;
}
