import { type Patch } from "@automerge/automerge";
import { DocHandle, useDocument } from "@automerge/react";
import type { JsonDoc, RecordedAction } from "@mydenicek/core";
import { addElementChildNode, addSiblingNodeAfter, addSiblingNodeBefore, addTransformation, addValueChildNode, applyPatchesManual, deleteNode, getUUID, replayScript, updateAttribute, updateTag, updateValue, wrapNode } from "@mydenicek/core";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const updateAttributeAction = useCallback((nodeIds: string[], key: string, value: unknown | undefined) => {
    modifyDoc((d) => {
      for (const id of nodeIds) {
        updateAttribute(d.nodes, id, key, value);
      }
    });
  }, [modifyDoc]);

  const updateTagAction = useCallback((nodeIds: string[], newTag: string) => {
    modifyDoc((d) => {
      for (const id of nodeIds) {
        updateTag(d.nodes, id, newTag);
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

  const updateValueAction = useCallback((nodeIds: string[], newValue: string, originalValue: string) => {
    modifyDoc((prev) => {
      for (const id of nodeIds) {
        updateValue(prev, id, newValue, originalValue);
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
        deleteNode(d.nodes, id);
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
    updateAttribute: updateAttributeAction,
    updateTag: updateTagAction,
    wrapNodes,
    updateValue: updateValueAction,
    addChildren,
    addSiblings,
    deleteNodes,
    replayScript: replayScriptAction,
    addTransformation: addTransformationAction,
    applyPatches
  };
}
