import type { DenicekAction } from "@mydenicek/core";
import { useCallback, useContext } from "react";
import { DenicekContext, DenicekInternalContext } from "./DenicekProvider";

export function useDocumentState() {
  const context = useContext(DenicekContext);
  if (!context) {
    throw new Error("useDocumentState must be used within a DenicekProvider");
  }
  return {
    model: context.model,
    store: context.store,
  };
}

export function useConnectivity() {
  const context = useContext(DenicekContext);
  if (!context) {
    throw new Error("useConnectivity must be used within a DenicekProvider");
  }
  return {
    connect: context.connect,
    disconnect: context.disconnect,
  };
}

export function useRecording() {
  const { store } = useDocumentState();
  const internalContext = useContext(DenicekInternalContext);
  const doc = internalContext?.doc;

  const startRecording = useCallback((startNodeId: string) => {
    store.startRecording(startNodeId);
  }, [store]);

  const stopRecording = useCallback(() => {
    return store.stopRecording();
  }, [store]);

  const replay = useCallback((script: DenicekAction[], startNodeId: string) => {
    store.replay(doc, script, startNodeId);
  }, [store, doc]);

  return {
    isRecording: store.isRecording,
    startRecording,
    stopRecording,
    replay,
  };
}

export function useDocumentActions() {
  const { store } = useDocumentState();
  const internalContext = useContext(DenicekInternalContext);
  const doc = internalContext?.doc;

  const undo = useCallback(() => {
    store.undo(doc);
  }, [doc, store]);

  const redo = useCallback(() => {
    store.redo(doc);
  }, [doc, store]);

  const updateAttribute = useCallback((nodeIds: string[], key: string, value: unknown | undefined) => {
    store.modify(doc, (model) => {
      for (const id of nodeIds) {
        model.updateAttribute(id, key, value);
      }
    });
  }, [doc, store]);

  const updateTag = useCallback((nodeIds: string[], newTag: string) => {
    store.modify(doc, (model) => {
      for (const id of nodeIds) {
        model.updateTag(id, newTag);
      }
    });
  }, [doc, store]);

  const wrapNodes = useCallback((nodeIds: string[], wrapperTag: string) => {
    store.modifyTransaction(doc, (model) => {
      for (const id of nodeIds) {
        model.wrapNode(id, wrapperTag);
      }
    });
  }, [doc, store]);

  const updateValue = useCallback((nodeIds: string[], newValue: string, originalValue: string) => {
    store.modify(doc, (model) => {
      for (const id of nodeIds) {
        model.updateValue(id, newValue, originalValue);
      }
    });
  }, [doc, store]);

  const addChildren = useCallback((parentIds: string[], type: "element" | "value", content: string) => {
    const newIds: string[] = [];    
    store.modifyTransaction(doc, (model) => {
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
  }, [doc, store]);

  const addSiblings = useCallback((referenceIds: string[], position: "before" | "after") => {
    const newIds: string[] = [];
    store.modifyTransaction(doc, (model) => {
      for (const id of referenceIds) {
        const newId = position === "before" 
          ? model.addSiblingNodeBefore(id)
          : model.addSiblingNodeAfter(id);
        if (newId) newIds.push(newId);
      }
    });
    return newIds;
  }, [doc, store]);

  const deleteNodes = useCallback((nodeIds: string[]) => {
    store.modifyTransaction(doc, (model) => {
      for (const id of nodeIds) {
        model.deleteNode(id);
      }
    });
  }, [doc, store]);

  const addTransformation = useCallback((ids: string[], type: "rename" | "wrap", tag: string) => {
    store.modifyTransaction(doc, (model) => {
      for (const id of ids) {
        model.addTransformation(id, type, tag);
      }
    });
  }, [doc, store]);

  return {
    undo,
    redo,
    canUndo: store.undoManager.canUndo,
    canRedo: store.undoManager.canRedo,
    updateAttribute,
    updateTag,
    wrapNodes,
    updateValue,
    addChildren,
    addSiblings,
    deleteNodes,
    addTransformation,
  };
}

export type DenicekActions = ReturnType<typeof useDocumentActions>;

export function useDenicekDocument() {
  const { model } = useDocumentState();
  const connectivity = useConnectivity();
  const recording = useRecording();
  const actions = useDocumentActions();

  return {
    model,
    ...connectivity,
    ...recording,
    ...actions,
    replayScript: recording.replay, // for backward compatibility
  };
}
