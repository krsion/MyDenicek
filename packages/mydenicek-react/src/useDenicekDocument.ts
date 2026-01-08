import type { DenicekAction } from "@mydenicek/core";
import {
  replayScript
} from "@mydenicek/core";
import { useCallback, useContext } from "react";
import { DenicekContext, DenicekInternalContext } from "./DenicekProvider";

export function useDenicekDocument() {
  const context = useContext(DenicekContext);
  const internalContext = useContext(DenicekInternalContext);

  if (!context || !internalContext) {
    throw new Error("useDenicekDocument must be used within a DenicekProvider");
  }

  const { model, store, connect, disconnect } = context;
  const { handle } = internalContext;

  const startRecording = useCallback((startNodeId: string) => {
    store.startRecording(startNodeId);
  }, [store]);

  const stopRecording = useCallback(() => {
    return store.stopRecording();
  }, [store]);

  const undo = useCallback(() => {
    store.undo(handle);
  }, [handle, store]);

  const redo = useCallback(() => {
    store.redo(handle);
  }, [handle, store]);

  // Helper actions
  const updateAttributeAction = useCallback((nodeIds: string[], key: string, value: unknown | undefined) => {
    store.modify(handle, (model) => {
      for (const id of nodeIds) {
        model.updateAttribute(id, key, value);
      }
    });
  }, [handle, store]);

  const updateTagAction = useCallback((nodeIds: string[], newTag: string) => {
    store.modify(handle, (model) => {
      for (const id of nodeIds) {
        model.updateTag(id, newTag);
      }
    });
  }, [handle, store]);

  const wrapNodesAction = useCallback((nodeIds: string[], wrapperTag: string) => {
    store.modifyTransaction(handle, (model) => {
      for (const id of nodeIds) {
        model.wrapNode(id, wrapperTag);
      }
    });
  }, [handle, store]);

  const updateValueAction = useCallback((nodeIds: string[], newValue: string, originalValue: string) => {
    store.modify(handle, (model) => {
      for (const id of nodeIds) {
        model.updateValue(id, newValue, originalValue);
      }
    });
  }, [handle, store]);

  const addChildren = useCallback((parentIds: string[], type: "element" | "value", content: string) => {
    const newIds: string[] = [];    
    store.modifyTransaction(handle, (model) => {
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
  }, [handle, store]);

  const addSiblings = useCallback((referenceIds: string[], position: "before" | "after") => {
    const newIds: string[] = [];
    store.modifyTransaction(handle, (model) => {
      for (const id of referenceIds) {
        const newId = position === "before" 
          ? model.addSiblingNodeBefore(id)
          : model.addSiblingNodeAfter(id);
        if (newId) newIds.push(newId);
      }
    });
    return newIds;
  }, [handle, store]);

  const deleteNodesAction = useCallback((nodeIds: string[]) => {
    store.modifyTransaction(handle, (model) => {
      for (const id of nodeIds) {
        model.deleteNode(id);
      }
    });
  }, [handle, store]);

  const replayScriptAction = useCallback((script: DenicekAction[], selectedNodeId: string) => {
    if (!handle) return;
    handle.change((d) => {
        replayScript(d, script as any, selectedNodeId);
    });
  }, [handle]);

  const addTransformationAction = useCallback((ids: string[], type: "rename" | "wrap", tag: string) => {
    store.modifyTransaction(handle, (model) => {
      for (const id of ids) {
        model.addTransformation(id, type, tag);
      }
    });
  }, [handle, store]);


  return {
    model,
    undo,
    redo,
    canUndo: store.undoManager.canUndo,
    canRedo: store.undoManager.canRedo,
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
    isRecording: store.isRecording,
    connect,
    disconnect
  };
}
