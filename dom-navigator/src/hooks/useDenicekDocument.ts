import { next as Automerge, type Patch } from "@automerge/automerge";
import { DocHandle, useDocument } from "@automerge/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { addElementChildNode, addSiblingNodeAfter, addSiblingNodeBefore, addTransformation, addValueChildNode, applyPatchesManual, getUUID, parents, wrapNode } from "../Document";
import type { RecordedAction } from "../Recorder";
import type { JsonDoc } from "../types";
import { replayScript } from "../utils/replay";

function calculateSplice(oldVal: string, newVal: string) {
  let start = 0;
  while (start < oldVal.length && start < newVal.length && oldVal[start] === newVal[start]) {
    start++;
  }

  let oldEnd = oldVal.length;
  let newEnd = newVal.length;

  while (oldEnd > start && newEnd > start && oldVal[oldEnd - 1] === newVal[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  const deleteCount = oldEnd - start;
  const insertText = newVal.slice(start, newEnd);

  return { index: start, deleteCount, insertText };
}


export function useDenicekDocument(handle: DocHandle<JsonDoc>) {
  const [doc, changeDoc] = useDocument<JsonDoc>(handle.url);
  const [undoStack, setUndoStack] = useState<JsonDoc[]>([]);
  const [redoStack, setRedoStack] = useState<JsonDoc[]>([]);

  const docRef = useRef<JsonDoc | undefined>(doc);
  useEffect(() => { docRef.current = doc; }, [doc]);

  const modifyDoc = useCallback((updater: (d: JsonDoc) => void) => {
    if (!docRef.current) return;
    const currentDoc = docRef.current;
    setUndoStack(prev => [...prev, currentDoc]);
    setRedoStack([]);
    changeDoc(updater);
  }, [changeDoc]);

  const undo = useCallback(() => {
    if (undoStack.length === 0 || !docRef.current) return;
    const prevDoc = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, docRef.current!]);
    changeDoc(d => {
      const restored = JSON.parse(JSON.stringify(prevDoc));
      d.root = restored.root;
      d.nodes = restored.nodes;
      d.transformations = restored.transformations;
    });
  }, [undoStack, changeDoc]);

  const redo = useCallback(() => {
    if (redoStack.length === 0 || !docRef.current) return;
    const nextDoc = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, docRef.current!]);
    changeDoc(d => {
      const restored = JSON.parse(JSON.stringify(nextDoc));
      d.root = restored.root;
      d.nodes = restored.nodes;
      d.transformations = restored.transformations;
    });
  }, [redoStack, changeDoc]);

  // Helper actions
  const updateAttribute = useCallback((nodeIds: string[], key: string, value: unknown | undefined) => {
    modifyDoc((d) => {
      for (const id of nodeIds) {
        const node = d.nodes[id];
        if (node && node.kind === "element") {
          if (value === undefined) {
            delete node.attrs[key];
          } else {
            node.attrs[key] = value;
          }
        }
      }
    });
  }, [modifyDoc]);

  const updateTag = useCallback((nodeIds: string[], newTag: string) => {
    modifyDoc((d) => {
      for (const id of nodeIds) {
        const node = d.nodes[id];
        if (node && node.kind === "element") {
            // If we want to track this as a transformation
            // Finding parent ID is expensive with this structure, maybe pass it or optimize
            // For now, direct update as per existing App.tsx logic (which seems to use direct assignment in some places and addTransformation in others)
            // Let's stick to direct assignment for simple tag update unless it's a "rename" action
            node.tag = newTag;
        }
      }
    });
  }, [modifyDoc]);

  const wrapNodes = useCallback((nodeIds: string[], wrapperTag: string) => {
      modifyDoc((d) => {
          for (const id of nodeIds) {
              wrapNode(d.nodes, id, wrapperTag);
          }
      });
  }, [modifyDoc]);

  const updateValue = useCallback((nodeIds: string[], newValue: string, originalValue: string) => {
    modifyDoc((prev) => {
      const { index, deleteCount, insertText } = calculateSplice(originalValue, newValue);
      for (const id of nodeIds) {
        if (prev.nodes[id]?.kind === "value") {
          const node = prev.nodes[id];
          // If it's a full replacement of the source, treat it as a full replacement for targets too
          if (index === 0 && deleteCount === originalValue.length && insertText === newValue) {
            prev.nodes[id].value = newValue;
          } else {
            // Apply the splice relative to the node's content
            // Clamp index to the node's length to avoid out-of-bounds
            const safeIndex = Math.min(index, node.value.length);
            Automerge.splice(prev, ['nodes', id, 'value'], safeIndex, deleteCount, insertText);
          }
        }
      }
    });
  }, [modifyDoc]);

  const addChildren = useCallback((parentIds: string[], type: "element" | "value", content: string) => {
    const newIds: string[] = [];
    // Generate IDs upfront so we can return them synchronously
    for (let i = 0; i < parentIds.length; i++) {
      newIds.push(`n_${getUUID()}`);
    }

    modifyDoc((prev) => {
      parentIds.forEach((id, index) => {
        const node = prev.nodes[id];
        const newId = newIds[index];
        if (node?.kind === "element") {
          if (type === "value") {
            addValueChildNode(prev, node, content, newId);
          } else {
            addElementChildNode(prev, node, content, newId);
          }
        }
      });
    });
    return newIds;
  }, [modifyDoc]);

  const addSiblings = useCallback((referenceIds: string[], position: "before" | "after") => {
    const newIds: string[] = [];
    modifyDoc((prev) => {
      for (const id of referenceIds) {
        const newId = position === "before" 
          ? addSiblingNodeBefore(prev.nodes, id)
          : addSiblingNodeAfter(prev.nodes, id);
        if (newId) newIds.push(newId);
      }
    });
    return newIds;
  }, [modifyDoc]);

  const deleteNodes = useCallback((nodeIds: string[]) => {
    modifyDoc((d) => {
      for (const id of nodeIds) {
        const parentNodes = parents(d.nodes, id);
        for (const parent of parentNodes) {
            const idx = parent.children.indexOf(id);
            if (idx !== -1) {
                parent.children.splice(idx, 1);
            }
        }
      }
    });
  }, [modifyDoc]);

  const replayScriptAction = useCallback((script: RecordedAction[], selectedNodeId: string) => {
    modifyDoc((doc) => {
      replayScript(doc, script, selectedNodeId);
    });
  }, [modifyDoc]);

  const addTransformationAction = useCallback((ids: string[], type: "rename" | "wrap", tag: string) => {
    modifyDoc((prev) => {
      for (const id of ids) {
        addTransformation(prev, id, type, tag);
      }
    });
  }, [modifyDoc]);

  const applyPatches = useCallback((patches: Patch[]) => {
    modifyDoc((d) => {
      applyPatchesManual(d, patches);
    });
  }, [modifyDoc]);

  return {
    doc,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    updateAttribute,
    updateTag,
    wrapNodes,
    updateValue,
    addChildren,
    addSiblings,
    deleteNodes,
    replayScript: replayScriptAction,
    addTransformation: addTransformationAction,
    applyPatches
  };
}
