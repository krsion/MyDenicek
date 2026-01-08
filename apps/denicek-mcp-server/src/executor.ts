import type { DocHandle } from "@automerge/automerge-repo";
import {
    addElementChildNode,
    addValueChildNode,
    deleteNode,
    getUUID,
    type JsonDoc,
    updateAttribute,
    updateTag,
    updateValue,
    wrapNode,
} from "@mydenicek/core";

export type DenicekToolName =
    | "updateAttribute"
    | "updateTag"
    | "wrapNodes"
    | "updateValue"
    | "addChildren"
    | "deleteNodes";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
    if (value && typeof value === "object") return value as UnknownRecord;
    throw new Error("Arguments must be an object");
}

function requireString(value: unknown, name: string): string {
    if (typeof value === "string") return value;
    throw new Error(`Expected '${name}' to be a string`);
}

function requireStringArray(value: unknown, name: string): string[] {
    if (!Array.isArray(value)) throw new Error(`Expected '${name}' to be an array`);
    const result: string[] = [];
    for (const item of value) {
        if (typeof item !== "string") throw new Error(`Expected '${name}' items to be strings`);
        result.push(item);
    }
    return result;
}

function requireElementOrValue(value: unknown): "element" | "value" {
    if (value === "element" || value === "value") return value;
    throw new Error("Expected 'type' to be 'element' or 'value'");
}

export async function executeToolAction(
    handle: DocHandle<JsonDoc>,
    name: DenicekToolName,
    rawArgs: unknown
): Promise<string> {
    const args = asRecord(rawArgs);

    let result = "";

    handle.change((doc: JsonDoc) => {
        switch (name) {
            case "updateAttribute": {
                const nodeIds = requireStringArray(args.nodeIds, "nodeIds");
                const key = requireString(args.key, "key");
                const value = args.value as unknown | undefined;
                for (const id of nodeIds) {
                    updateAttribute(doc.nodes, id, key, value);
                }
                result = `Updated attribute ${key} on ${nodeIds.length} nodes.`;
                break;
            }
            case "updateTag": {
                const nodeIds = requireStringArray(args.nodeIds, "nodeIds");
                const newTag = requireString(args.newTag, "newTag");
                for (const id of nodeIds) {
                    updateTag(doc.nodes, id, newTag);
                }
                result = `Updated tag to ${newTag} on ${nodeIds.length} nodes.`;
                break;
            }
            case "wrapNodes": {
                const nodeIds = requireStringArray(args.nodeIds, "nodeIds");
                const wrapperTag = requireString(args.wrapperTag, "wrapperTag");
                for (const id of nodeIds) {
                    wrapNode(doc.nodes, id, wrapperTag);
                }
                result = `Wrapped ${nodeIds.length} nodes with ${wrapperTag}.`;
                break;
            }
            case "updateValue": {
                const nodeIds = requireStringArray(args.nodeIds, "nodeIds");
                const newValue = requireString(args.newValue, "newValue");
                const originalValue = requireString(args.originalValue, "originalValue");
                for (const id of nodeIds) {
                    updateValue(doc, id, newValue, originalValue);
                }
                result = `Updated text content on ${nodeIds.length} nodes.`;
                break;
            }
            case "addChildren": {
                const parentIds = requireStringArray(args.parentIds, "parentIds");
                const type = requireElementOrValue(args.type);
                const content = requireString(args.content, "content");

                const newIds: string[] = [];
                for (let i = 0; i < parentIds.length; i++) {
                    newIds.push(`n_${getUUID()}`);
                }

                parentIds.forEach((id, index) => {
                    const node = doc.nodes[id];
                    const newId = newIds[index];
                    if (node?.kind === "element") {
                        if (type === "value") {
                            addValueChildNode(doc, node, content, newId);
                        } else {
                            addElementChildNode(doc, node, content, newId);
                        }
                    }
                });
                result = `Added ${type} nodes to ${parentIds.length} parents.`;
                break;
            }
            case "deleteNodes": {
                const nodeIds = requireStringArray(args.nodeIds, "nodeIds");
                for (const id of nodeIds) {
                    deleteNode(doc.nodes, id);
                }
                result = `Deleted ${nodeIds.length} nodes.`;
                break;
            }
            default: {
                // Exhaustiveness check
                const _exhaustive: never = name;
                throw new Error(`Unknown tool: ${_exhaustive}`);
            }
        }
    });

    return result;
}
