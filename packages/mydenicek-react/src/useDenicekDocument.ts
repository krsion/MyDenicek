import type { DenicekAction, DenicekModel, SpliceInfo } from "@mydenicek/core";
import { useCallback, useContext } from "react";
import { DenicekContext, DenicekInternalContext } from "./DenicekProvider";

/**
 * Calculates the minimal splice operation needed to transform oldVal into newVal.
 * Finds the shortest diff region by comparing from both ends.
 */
export function calculateSplice(oldVal: string, newVal: string): SpliceInfo {
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
    store.modify(doc, (model: DenicekModel) => {
      for (const id of nodeIds) {
        model.updateAttribute(id, key, value);
      }
    });
  }, [doc, store]);

  const updateTag = useCallback((nodeIds: string[], newTag: string) => {
    store.modify(doc, (model: DenicekModel) => {
      for (const id of nodeIds) {
        model.updateTag(id, newTag);
      }
    });
  }, [doc, store]);

  const wrapNodes = useCallback((nodeIds: string[], wrapperTag: string) => {
    store.modifyTransaction(doc, (model: DenicekModel) => {
      for (const id of nodeIds) {
        model.wrapNode(id, wrapperTag);
      }
    });
  }, [doc, store]);

  const updateValue = useCallback((nodeIds: string[], newValue: string, originalValue: string) => {
    const splice = calculateSplice(originalValue, newValue);
    store.modify(doc, (model: DenicekModel) => {
      for (const id of nodeIds) {
        model.spliceValue(id, splice.index, splice.deleteCount, splice.insertText);
      }
    });
  }, [doc, store]);

  const addChildren = useCallback((parentIds: string[], type: "element" | "value", content: string) => {
    const newIds: string[] = [];    
    store.modifyTransaction(doc, (model: DenicekModel) => {
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
    store.modifyTransaction(doc, (model: DenicekModel) => {
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
    store.modifyTransaction(doc, (model: DenicekModel) => {
      for (const id of nodeIds) {
        model.deleteNode(id);
      }
    });
  }, [doc, store]);

  const addTransformation = useCallback((ids: string[], type: "rename" | "wrap", tag: string) => {
    store.modifyTransaction(doc, (model: DenicekModel) => {
      for (const id of ids) {
        model.addTransformation(id, type, { tag });
      }
    });
  }, [doc, store]);

  /**
   * Adds a transformation that applies to all nodes matching the generalized selection.
   * Uses the LCA and selector info from generalizeSelectionWithInfo to create
   * a transformation with appropriate selectorTag, selectorDepth, and selectorKind.
   */
  const addGeneralizedTransformation = useCallback((selectedIds: string[], type: "rename" | "wrap" | "edit", options: { tag?: string; originalValue?: string; newValue?: string }) => {
    store.modifyTransaction(doc, (model: DenicekModel) => {
      const info = model.generalizeSelectionWithInfo(selectedIds);
      if (!info.lcaId) return;
      
      // Build transformation options
      const transformOptions: Parameters<typeof model.addTransformation>[2] = {
        selectorTag: info.selectorTag,
        selectorDepth: info.selectorDepth,
        selectorKind: info.selectorKind,
      };
      
      if (options.tag !== undefined) {
        transformOptions.tag = options.tag;
      }
      
      // Calculate splice for edit transformations
      if (type === "edit" && options.originalValue !== undefined && options.newValue !== undefined) {
        transformOptions.splice = calculateSplice(options.originalValue, options.newValue);
      }
      
      model.addTransformation(info.lcaId, type, transformOptions);
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
    addGeneralizedTransformation,
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
