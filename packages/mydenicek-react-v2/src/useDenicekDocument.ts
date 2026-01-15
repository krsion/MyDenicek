/**
 * React hooks for Denicek document operations
 */

import {
    DenicekModel,
    DenicekStore,
    type GeneralizedPatch,
    type SpliceInfo
} from "@mydenicek/core-v2";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DenicekContext } from "./DenicekProvider.js";

/**
 * Creates a bulk action that applies an operation to multiple nodes.
 * Reduces boilerplate for common store.modify patterns.
 */
function useBulkAction<TArgs extends unknown[]>(
    store: DenicekStore,
    operation: (model: DenicekModel, id: string, ...args: TArgs) => void,
    useTransaction = false
) {
    return useCallback((nodeIds: string[], ...args: TArgs) => {
        const method = useTransaction ? store.modifyTransaction : store.modify;
        method.call(store, (model: DenicekModel) => {
            for (const id of nodeIds) {
                operation(model, id, ...args);
            }
        });
    }, [store]);
}

/**
 * Calculates the minimal splice operation needed to transform oldVal into newVal.
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

/**
 * Hook to access document state
 */
export function useDocumentState() {
    const context = useContext(DenicekContext);
    if (!context) {
        throw new Error("useDocumentState must be used within a DenicekProvider");
    }
    
    // Create a model wrapper for backwards compatibility
    const model = useMemo(() => {
        return new DenicekModel(context.document);
    }, [context.document]);
    
    return {
        document: context.document,
        store: context.store,
        snapshot: context.snapshot,
        model, // Backwards compatibility
    };
}

/**
 * Hook to access just the snapshot (for read-only operations)
 */
export function useSnapshot() {
    const context = useContext(DenicekContext);
    if (!context) {
        throw new Error("useSnapshot must be used within a DenicekProvider");
    }
    return context.snapshot;
}

/**
 * Hook for connectivity state (stub for backwards compatibility)
 * In v2, use sync-client directly for real sync
 */
export function useConnectivity() {
    const context = useContext(DenicekContext);
    if (!context) {
        throw new Error("useConnectivity must be used within a DenicekProvider");
    }
    
    return {
        connect: (url: string) => {
            if (context.syncManager) {
                context.syncManager.connect(url).catch(console.error);
            }
        },
        disconnect: () => {
            context.syncManager?.disconnect();
        },
        isConnected: context.syncManager?.isConnected ?? false,
    };
}

/**
 * Hook for recording
 * Provides access to document change history for replay functionality
 */
export function useRecording() {
    const context = useContext(DenicekContext);
    if (!context) {
        throw new Error("useRecording must be used within a DenicekProvider");
    }
    const { store, document } = context;

    // Use state to store history data and trigger re-renders when it changes
    const [historyData, setHistoryData] = useState<GeneralizedPatch[]>(() => store.getHistory());

    // Subscribe to document patches to update history state
    useEffect(() => {
        // Subscribe to patches from the document
        const unsubscribe = document.subscribePatches(() => {
            // When a patch is received, get fresh history from store
            setHistoryData(store.getHistory());
        });

        // Also get initial history
        setHistoryData(store.getHistory());

        return unsubscribe;
    }, [store, document]);

    return {
        isRecording: true, // History is always active
        startRecording: (_startNodeId: string) => { /* no-op */ },
        stopRecording: () => store.getHistory(),
        replay: (script: GeneralizedPatch[], startNodeId: string) => store.replay(script, startNodeId),
        history: historyData,
        clearHistory: () => {
            store.clearHistory();
            setHistoryData([]);
        },
    };
}

/**
 * Hook for document actions (mutations)
 */
export function useDocumentActions() {
    const { store } = useDocumentState();

    const undo = useCallback(() => store.undo(), [store]);
    const redo = useCallback(() => store.redo(), [store]);

    // Simple bulk actions using the factory
    const updateAttribute = useBulkAction(store, (m, id, key: string, value: unknown | undefined) => m.updateAttribute(id, key, value));
    const updateTag = useBulkAction(store, (m, id, newTag: string) => m.updateTag(id, newTag));
    const wrapNodes = useBulkAction(store, (m, id, wrapperTag: string) => m.wrapNode(id, wrapperTag), true);
    const deleteNodes = useBulkAction(store, (m, id) => m.deleteNode(id), true);

    // Actions with special logic that don't fit the bulk pattern
    const updateValue = useCallback((nodeIds: string[], newValue: string, originalValue: string) => {
        const splice = calculateSplice(originalValue, newValue);
        store.modify((model: DenicekModel) => {
            for (const id of nodeIds) {
                model.spliceValue(id, splice.index, splice.deleteCount, splice.insertText);
            }
        });
    }, [store]);

    const addChildren = useCallback((parentIds: string[], type: "element" | "value", content: string) => {
        const newIds: string[] = [];
        store.modifyTransaction((model: DenicekModel) => {
            for (const id of parentIds) {
                const node = model.getNode(id);
                if (node?.kind === "element") {
                    const newId = type === "value"
                        ? model.addValueChildNode(id, content)
                        : model.addElementChildNode(id, content);
                    newIds.push(newId);
                }
            }
        });
        return newIds;
    }, [store]);

    const addSiblings = useCallback((referenceIds: string[], position: "before" | "after") => {
        const newIds: string[] = [];
        store.modifyTransaction((model: DenicekModel) => {
            for (const id of referenceIds) {
                const newId = position === "before"
                    ? model.addSiblingNodeBefore(id)
                    : model.addSiblingNodeAfter(id);
                if (newId) newIds.push(newId);
            }
        });
        return newIds;
    }, [store]);



    return {
        undo,
        redo,
        canUndo: store.canUndo,
        canRedo: store.canRedo,
        updateAttribute,
        updateTag,
        wrapNodes,
        updateValue,
        addChildren,
        addSiblings,
        deleteNodes,

    };
}

export type DenicekActions = ReturnType<typeof useDocumentActions>;

/**
 * Combined hook for document + actions
 */
export function useDenicekDocument() {
    const state = useDocumentState();
    const actions = useDocumentActions();

    return {
        ...state,
        ...actions,
    };
}
