import { DenicekModel } from "./DenicekModel";
import type { GeneralizedPatch, JsonDoc } from "./types";

/**
 * Replays a sequence of generalized patches on a document,
 * remapping node IDs from the recording context to the replay context.
 */
export function replayScript(doc: JsonDoc, script: GeneralizedPatch[], startNodeId: string) {
    const model = new DenicekModel(doc);

    // Map from generalized variable (e.g., "$0", "$1") to actual node ID
    const replayMap: Record<string, string> = { "$0": startNodeId };

    /**
     * Resolves a property (string or number) from recorded form to actual ID.
     * Variables like "$0", "$1" are replaced with their mapped IDs.
     */
    const resolveProp = (prop: string | number): string | number => {
        if (typeof prop === "number") return prop;

        // Check if this is a variable reference
        if (prop.startsWith("$")) {
            return replayMap[prop] ?? prop;
        }

        // Handle wrapper ID prefixes (e.g., "w-$0" or "$1_w")
        if (prop.startsWith("w-")) {
            const inner = resolveProp(prop.substring(2));
            return "w-" + inner;
        }
        if (prop.endsWith("_w")) {
            const inner = resolveProp(prop.substring(0, prop.length - 2));
            return inner + "_w";
        }

        return prop;
    };

    /**
     * Resolves all props in a path.
     */
    const resolvePath = (path: (string | number)[]): (string | number)[] => {
        return path.map(resolveProp);
    };

    /**
     * Resolves variables in values (handles nested objects/arrays).
     */
    const resolveValue = (value: unknown): unknown => {
        if (typeof value === "string" && value.startsWith("$")) {
            return replayMap[value] ?? value;
        }
        if (Array.isArray(value)) {
            return value.map(resolveValue);
        }
        if (typeof value === "object" && value !== null) {
            const result: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = resolveValue(v);
            }
            return result;
        }
        return value;
    };

    // Track variable counter for new node IDs
    let varCounter = 1;

    for (const patch of script) {
        const resolvedPath = resolvePath(patch.path);

        switch (patch.action) {
            case "put": {
                // Handle putting a value at a path
                // Path: ["nodes", nodeId, "value"] for value updates
                // Path: ["nodes", nodeId, "tag"] for tag updates
                // Path: ["nodes", nodeId, "attrs", key] for attribute updates
                // Path: ["nodes", nodeId] for new node creation
                if (resolvedPath[0] === "nodes" && resolvedPath.length >= 2) {
                    const nodeId = resolvedPath[1] as string;

                    if (resolvedPath.length === 2) {
                        // Creating a new node
                        const resolvedValue = resolveValue(patch.value);
                        doc.nodes[nodeId] = resolvedValue as typeof doc.nodes[string];

                        // If the original path had a variable, map it
                        const origId = patch.path[1];
                        if (typeof origId === "string" && origId.startsWith("$") && !replayMap[origId]) {
                            replayMap[origId] = nodeId;
                        }
                    } else if (resolvedPath[2] === "value") {
                        const node = doc.nodes[nodeId];
                        if (node?.kind === "value") {
                            node.value = resolveValue(patch.value) as string;
                        }
                    } else if (resolvedPath[2] === "tag") {
                        const node = doc.nodes[nodeId];
                        if (node?.kind === "element") {
                            node.tag = resolveValue(patch.value) as string;
                        }
                    } else if (resolvedPath[2] === "attrs" && resolvedPath.length >= 4) {
                        const key = resolvedPath[3] as string;
                        model.updateAttribute(nodeId, key, resolveValue(patch.value));
                    }
                }
                break;
            }

            case "del": {
                // Handle deletion at a path
                if (resolvedPath[0] === "nodes" && resolvedPath.length === 2) {
                    const nodeId = resolvedPath[1] as string;
                    model.deleteNode(nodeId);
                } else if (resolvedPath[0] === "nodes" && resolvedPath[2] === "attrs" && resolvedPath.length >= 4) {
                    const nodeId = resolvedPath[1] as string;
                    const key = resolvedPath[3] as string;
                    model.updateAttribute(nodeId, key, undefined);
                }
                break;
            }

            case "insert": {
                // Handle inserting into an array (e.g., children array)
                // Path: ["nodes", parentId, "children", index]
                if (resolvedPath[0] === "nodes" && resolvedPath[2] === "children") {
                    const parentId = resolvedPath[1] as string;
                    const index = resolvedPath[3] as number;
                    const parentNode = doc.nodes[parentId];

                    if (parentNode?.kind === "element" && patch.values) {
                        const resolvedValues = patch.values.map((v: unknown) => resolveValue(v)) as string[];
                        parentNode.children.splice(index, 0, ...resolvedValues);

                        // Map any variables in the original values
                        if (patch.values) {
                            for (let i = 0; i < patch.values.length; i++) {
                                const origVal = patch.values[i];
                                if (typeof origVal === "string" && origVal.startsWith("$") && !replayMap[origVal]) {
                                    replayMap[origVal] = resolvedValues[i];
                                }
                            }
                        }
                    }
                }
                break;
            }

            case "splice": {
                // Handle splicing (used for text edits in value nodes)
                // Path: ["nodes", nodeId, "value"]
                if (resolvedPath[0] === "nodes" && resolvedPath[2] === "value") {
                    const nodeId = resolvedPath[1] as string;
                    const node = doc.nodes[nodeId];
                    if (node?.kind === "value" && typeof patch.value === "string") {
                        // The splice patch contains: path to string, index is in path[3], value is insert text
                        const index = (resolvedPath[3] as number) ?? 0;
                        const deleteCount = patch.length ?? 0;
                        const insertText = patch.value;
                        node.value = node.value.slice(0, index) + insertText + node.value.slice(index + deleteCount);
                    }
                }
                break;
            }

            case "inc": {
                // Increment is rarely used in this context, skip for now
                break;
            }
        }

        // Generate new variable mapping if needed for newly created nodes
        // This happens when we see a "put" at ["nodes", newId] where newId is a new UUID
        if (patch.action === "put" && resolvedPath[0] === "nodes" && resolvedPath.length === 2) {
            const newId = resolvedPath[1] as string;
            if (newId.startsWith("n_") && !Object.values(replayMap).includes(newId)) {
                replayMap["$" + varCounter++] = newId;
            }
        }
    }
}
