import type { GeneralizedPatch } from "@mydenicek/core";

export interface CreatedNode {
    actionIndex: number;
    variable: string; // $1, $2, etc.
}

export interface ScriptAnalysis {
    /** Map from target variable to creation info */
    createdNodes: Map<string, CreatedNode>;
}

/** Identify all tree-create patches and record their target variables. */
export function analyzeScript(script: GeneralizedPatch[]): ScriptAnalysis {
    const createdNodes = new Map<string, CreatedNode>();

    script.forEach((patch, index) => {
        if (patch.type === "tree" && patch.action === "create") {
            createdNodes.set(patch.target, {
                actionIndex: index,
                variable: patch.target,
            });
        }
    });

    return { createdNodes };
}

/** Get the creation info for a patch if it creates a node. */
export function getCreationInfo(
    actionIndex: number,
    analysis: ScriptAnalysis,
): { number: number; variable: string } | null {
    for (const [, info] of analysis.createdNodes) {
        if (info.actionIndex === actionIndex) {
            const match = info.variable.match(/^\$(\d+)$/);
            if (match?.[1]) {
                return { number: parseInt(match[1], 10), variable: info.variable };
            }
        }
    }
    return null;
}
