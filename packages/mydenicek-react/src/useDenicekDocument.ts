import type { DenicekAction, GeneralizedPatch, JsonDoc } from "@mydenicek/core";
import {
    DenicekModel,
    Recorder,
    replayScript
} from "@mydenicek/core";
import { useCallback, useContext, useRef, useState } from "react";
import { DenicekContext, DenicekInternalContext } from "./DenicekProvider";

export function useDenicekDocument() {
  const context = useContext(DenicekContext);
  const internalContext = useContext(DenicekInternalContext);

  if (!context || !internalContext) {
    throw new Error("useDenicekDocument must be used within a DenicekProvider");
  }

  const { model, undoManager, connect, disconnect } = context;
  const { handle } = internalContext;

  // Force re-render when undo/redo state changes
  const [, setUndoRedoVersion] = useState(0);

  /**
   * Performs a tracked change that can be undone.
   * Uses DocHandle.change with patchCallback to capture patches for undo.
   */
  const recorderRef = useRef<Recorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = useCallback((startNodeId: string) => {
    recorderRef.current = new Recorder(startNodeId);
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    const script = recorderRef.current?.getActions() || [];
    recorderRef.current = null;
    setIsRecording(false);
    return script;
  }, []);

  /**
   * Performs a tracked change that can be undone.
   * Uses DocHandle.change with patchCallback to capture patches for undo.
   */
  const modifyDoc = useCallback((updater: (model: DenicekModel) => void) => {
    if (!handle) return;
    handle.change((d) => {
      const changeModel = new DenicekModel(d);
      updater(changeModel);
    }, {
      patchCallback: (patches, info) => {
        // Store the inverse patches for undo
        const undoEntry = undoManager.captureForUndo(info.before as JsonDoc, patches);
        if (undoEntry) {
          setUndoRedoVersion(v => v + 1);
        }
        // Record patches if recording
        if (recorderRef.current) {
             recorderRef.current.addPatches(patches);
        }
      }
    });
  }, [handle, undoManager]);

  /**
   * Performs a tracked transaction that groups multiple changes into one undo step.
   */
  const modifyDocTransaction = useCallback((updater: (model: DenicekModel) => void) => {
    if (!handle) return;
    undoManager.startTransaction();
    handle.change((d) => {
      const changeModel = new DenicekModel(d);
      updater(changeModel);
    }, {
      patchCallback: (patches, info) => {
        undoManager.addToTransaction(info.before as JsonDoc, patches);
        // Record patches if recording
        if (recorderRef.current) {
             recorderRef.current.addPatches(patches);
        }
      }
    });
    undoManager.endTransaction();
    setUndoRedoVersion(v => v + 1);
  }, [handle, undoManager]);

  const undo = useCallback(() => {
    if (!handle) return;
    const entry = undoManager.popUndo();
    if (!entry) return;

    handle.change((d) => {
      undoManager.applyPatches(d, entry.inversePatches);
    }, {
      patchCallback: (patches, info) => {
        // Capture redo patches
        undoManager.pushRedo(info.before as JsonDoc, patches);
      }
    });
    setUndoRedoVersion(v => v + 1);
  }, [handle, undoManager]);

  const redo = useCallback(() => {
    if (!handle) return;
    const entry = undoManager.popRedo();
    if (!entry) return;

    handle.change((d) => {
      undoManager.applyPatches(d, entry.inversePatches);
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
    modifyDoc((model) => {
      for (const id of nodeIds) {
        model.updateAttribute(id, key, value);
      }
    });
  }, [modifyDoc]);

  const updateTagAction = useCallback((nodeIds: string[], newTag: string) => {
    modifyDoc((model) => {
      for (const id of nodeIds) {
        model.updateTag(id, newTag);
      }
    });
  }, [modifyDoc]);

  const wrapNodesAction = useCallback((nodeIds: string[], wrapperTag: string) => {
    // Wrap multiple nodes in a single undo step
    modifyDocTransaction((model) => {
      for (const id of nodeIds) {
        model.wrapNode(id, wrapperTag);
      }
    });
  }, [modifyDocTransaction]);

  const updateValueAction = useCallback((nodeIds: string[], newValue: string, originalValue: string) => {
    modifyDoc((model) => {
      for (const id of nodeIds) {
        model.updateValue(id, newValue, originalValue);
      }
    });
  }, [modifyDoc]);

  const addChildren = useCallback((parentIds: string[], type: "element" | "value", content: string) => {
    const newIds: string[] = [];    
    modifyDocTransaction((model) => {
      parentIds.forEach((id) => {
        const node = model.getNode(id);
        if (node?.kind === "element") {
          let newId: string;
          if (type === "value") {
             newId = model.addValueChildNode(node, content);
          } else {
             newId = model.addElementChildNode(node, content);
          }
          newIds.push(newId);
        }
      });
    });
    return newIds;
  }, [modifyDocTransaction]);

  const addSiblings = useCallback((referenceIds: string[], position: "before" | "after") => {
    const newIds: string[] = [];
    modifyDocTransaction((model) => {
      for (const id of referenceIds) {
        const newId = position === "before" 
          ? model.addSiblingNodeBefore(id)
          : model.addSiblingNodeAfter(id);
        if (newId) newIds.push(newId);
      }
    });
    return newIds;
  }, [modifyDocTransaction]);

  const deleteNodesAction = useCallback((nodeIds: string[]) => {
    // Delete multiple nodes in a single undo step
    modifyDocTransaction((model) => {
      for (const id of nodeIds) {
        model.deleteNode(id);
      }
    });
  }, [modifyDocTransaction]);

  const replayScriptAction = useCallback((script: DenicekAction[], selectedNodeId: string) => {
    if (!handle) return;
    handle.change((d) => {
        replayScript(d, script as GeneralizedPatch[], selectedNodeId);
    });
  }, [handle]);

  const addTransformationAction = useCallback((ids: string[], type: "rename" | "wrap", tag: string) => {
    modifyDocTransaction((model) => {
      for (const id of ids) {
        model.addTransformation(id, type, tag);
      }
    });
  }, [modifyDocTransaction]);


  return {
    model,
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
    addTransformation: addTransformationAction,
    startRecording,
    stopRecording,
    isRecording,
    connect,
    disconnect
  };
}
