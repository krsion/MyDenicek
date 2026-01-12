import type { DocHandle } from "@automerge/automerge-repo";
import {
    DenicekModel,
    type JsonDoc,
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
        const model = new DenicekModel(doc);

        switch (name) {
            case "updateAttribute": {
                const nodeIds = requireStringArray(args.nodeIds, "nodeIds");
                const key = requireString(args.key, "key");
                const value = args.value as unknown | undefined;
                for (const id of nodeIds) {
                    model.updateAttribute(id, key, value);
                }
                result = `Updated attribute ${key} on ${nodeIds.length} nodes.`;
                break;
            }
            case "updateTag": {
                const nodeIds = requireStringArray(args.nodeIds, "nodeIds");
                const newTag = requireString(args.newTag, "newTag");
                for (const id of nodeIds) {
                    model.updateTag(id, newTag);
                }
                result = `Updated tag to ${newTag} on ${nodeIds.length} nodes.`;
                break;
            }
            case "wrapNodes": {
                const nodeIds = requireStringArray(args.nodeIds, "nodeIds");
                const wrapperTag = requireString(args.wrapperTag, "wrapperTag");
                for (const id of nodeIds) {
                    model.wrapNode(id, wrapperTag);
                }
                result = `Wrapped ${nodeIds.length} nodes with ${wrapperTag}.`;
                break;
            }
            case "updateValue": {
                const nodeIds = requireStringArray(args.nodeIds, "nodeIds");
                const newValue = requireString(args.newValue, "newValue");
                const originalValue = requireString(args.originalValue, "originalValue");
                for (const id of nodeIds) {
                    model.updateValue(id, newValue, originalValue);
                }
                result = `Updated text content on ${nodeIds.length} nodes.`;
                break;
            }
            case "addChildren": {
                const parentIds = requireStringArray(args.parentIds, "parentIds");
                const type = requireElementOrValue(args.type);
                const content = requireString(args.content, "content");

                parentIds.forEach((id) => {
                    const node = model.getNode(id);
                    if (node?.kind === "element") {
                        if (type === "value") {
                            model.addValueChildNode(node, content);
                        } else {
                            model.addElementChildNode(node, content);
                        }
                    }
                });
                result = `Added ${type} nodes to ${parentIds.length} parents.`;
                break;
            }
            case "deleteNodes": {
                const nodeIds = requireStringArray(args.nodeIds, "nodeIds");
                for (const id of nodeIds) {
                    model.deleteNode(id);
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
