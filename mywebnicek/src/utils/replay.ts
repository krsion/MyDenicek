import { addElementChildNode, addValueChildNode, wrapNode } from "../Document";
import type { RecordedAction } from "../Recorder";
import type { JsonDoc } from "../types";

export function replayScript(doc: JsonDoc, script: RecordedAction[], startNodeId: string) {
    const replayMap: Record<string, string> = { "$0": startNodeId };

    const resolve = (ref: string): string => {
        if (replayMap[ref]) return replayMap[ref]!;
        if (ref.startsWith("$")) return replayMap[ref] || ref;
        
        if (ref.startsWith("w-")) {
            const inner = resolve(ref.substring(2));
            return "w-" + inner;
        }
        if (ref.endsWith("_w")) {
            const inner = resolve(ref.substring(0, ref.length - 2));
            return inner + "_w";
        }
        return ref;
    };

    for (const action of script) {
        if (action.type === "addChild") {
            const parentId = resolve(action.parent);
            const parentNode = doc.nodes[parentId];
            if (parentNode?.kind === "element") {
                let newId: string;
                if (action.nodeType === "value") {
                    newId = addValueChildNode(doc, parentNode, action.content).id;
                } else {
                    newId = addElementChildNode(doc, parentNode, action.content).id;
                }
                replayMap[action.newIdVar] = newId;
            }
        } else if (action.type === "setValue") {
            const targetId = resolve(action.target);
            const node = doc.nodes[targetId];
            if (node?.kind === "value") {
                node.value = action.value;
            }
        } else if (action.type === "wrap") {
            const targetId = resolve(action.target);
            let wrapperId = "w-" + targetId;
            while (doc.nodes[wrapperId]) wrapperId = wrapperId + "_w";

            wrapNode(doc.nodes, targetId, action.wrapperTag);

            let refKey = "w-" + action.target;
            while (replayMap[refKey]) refKey = refKey + "_w";
            replayMap[refKey] = wrapperId;

        } else if (action.type === "rename") {
            const targetId = resolve(action.target);
            const node = doc.nodes[targetId];
            if (node?.kind === "element") {
                node.tag = action.newTag;
            }
        }
    }
}
