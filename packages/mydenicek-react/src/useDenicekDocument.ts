import { DocHandle, useDocument } from "@automerge/react";
import type { JsonDoc, RecordedAction } from "@mydenicek/core";
import {
  addElementChildNode,
  addSiblingNodeAfter,
  addSiblingNodeBefore,
  addTransformation,
  addValueChildNode,
  deleteNode,
  getUUID,
  replayScript,
  UndoManager,
  updateAttribute,
  updateTag,
  updateValue,
  wrapNode
} from "@mydenicek/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useDenicekDocument(handle: DocHandle<JsonDoc>) {
  const [doc] = useDocument<JsonDoc>(handle.url);
  
  // UndoManager instance - stable across renders
  const undoManager = useMemo(() => new UndoManager<JsonDoc>(), []);
  
  // Force re-render when undo/redo state changes
  const [, setUndoRedoVersion] = useState(0);

  const docRef = useRef<JsonDoc | undefined>(doc);
  useEffect(() => { docRef.current = doc; }, [doc]);

  /**
   * Performs a tracked change that can be undone.
   * Uses DocHandle.change with patchCallback to capture patches for undo.
   */
  const modifyDoc = useCallback((updater: (d: JsonDoc) => void) => {
    handle.change(updater, {
      patchCallback: (patches, info) => {
        // Store the inverse patches for undo
        const undoEntry = undoManager.captureForUndo(info.before as JsonDoc, patches);
        if (undoEntry) {
          setUndoRedoVersion(v => v + 1);
        }
      }
    });
  }, [handle, undoManager]);

  /**
   * Performs a tracked transaction that groups multiple changes into one undo step.
   */
  const modifyDocTransaction = useCallback((updater: (d: JsonDoc) => void) => {
    undoManager.startTransaction();
    handle.change(updater, {
      patchCallback: (patches, info) => {
        undoManager.addToTransaction(info.before as JsonDoc, patches);
      }
    });
    undoManager.endTransaction();
    setUndoRedoVersion(v => v + 1);
  }, [handle, undoManager]);

  const undo = useCallback(() => {
    const entry = undoManager.popUndo();
    if (!entry) return;

    handle.change((d) => {
      undoManager.applyInversePatches(d, entry.inversePatches);
    }, {
      patchCallback: (patches, info) => {
        // Capture redo patches
        undoManager.pushRedo(info.before as JsonDoc, patches);
      }
    });
    setUndoRedoVersion(v => v + 1);
  }, [handle, undoManager]);

  const redo = useCallback(() => {
    const entry = undoManager.popRedo();
    if (!entry) return;

    handle.change((d) => {
      undoManager.applyInversePatches(d, entry.inversePatches);
    }, {
      patchCallback: (patches, info) => {
        // Capture undo patches
        undoManager.pushUndo(info.before as JsonDoc, patches);
      }
    });
    setUndoRedoVersion(v => v + 1);
  }, [handle, undoManager]);

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

  const wrapNodesAction = useCallback((nodeIds: string[], wrapperTag: string) => {
    // Wrap multiple nodes in a single undo step
    modifyDocTransaction((d) => {
      for (const id of nodeIds) {
        wrapNode(d.nodes, id, wrapperTag);
      }
    });
  }, [modifyDocTransaction]);

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

    // Multiple operations - use transaction
    modifyDocTransaction((prev) => {
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
  }, [modifyDocTransaction]);

  const addSiblings = useCallback((referenceIds: string[], position: "before" | "after") => {
    const newIds: string[] = [];
    modifyDocTransaction((prev) => {
      for (const id of referenceIds) {
        const newId = position === "before" 
          ? addSiblingNodeBefore(prev.nodes, id)
          : addSiblingNodeAfter(prev.nodes, id);
        if (newId) newIds.push(newId);
      }
    });
    return newIds;
  }, [modifyDocTransaction]);

  const deleteNodesAction = useCallback((nodeIds: string[]) => {
    // Delete multiple nodes in a single undo step
    modifyDocTransaction((d) => {
      for (const id of nodeIds) {
        deleteNode(d.nodes, id);
      }
    });
  }, [modifyDocTransaction]);

  const replayScriptAction = useCallback((script: RecordedAction[], selectedNodeId: string) => {
    modifyDoc((doc) => {
      replayScript(doc, script, selectedNodeId);
    });
  }, [modifyDoc]);

  const addTransformationAction = useCallback((ids: string[], type: "rename" | "wrap", tag: string) => {
    modifyDocTransaction((prev) => {
      for (const id of ids) {
        addTransformation(prev, id, type, tag);
      }
    });
  }, [modifyDocTransaction]);


  return {
    doc,
    undo,
    redo,
    canUndo: undoManager.canUndo,
    canRedo: undoManager.canRedo,
    updateAttribute: updateAttributeAction,
    updateTag: updateTagAction,
    wrapNodes: wrapNodesAction,
    updateValue: updateValueAction,
    addChildren,
    addSiblings,
    deleteNodes: deleteNodesAction,
    replayScript: replayScriptAction,
    addTransformation: addTransformationAction
  };
}
