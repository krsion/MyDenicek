/**
 * React hooks for Denicek document operations
 */

import {
    DenicekDocument,
    DenicekModel,
    type GeneralizedPatch,
    type SpliceInfo
} from "@mydenicek/core-v2";
import { useCallback, useContext, useEffect, useState } from "react";
import { DenicekContext } from "./DenicekProvider.js";

/**
 * Creates a bulk action that applies an operation to multiple nodes.
 * Reduces boilerplate for common document.change patterns.
 */
function useBulkAction<TArgs extends unknown[]>(
    document: DenicekDocument,
    operation: (model: DenicekModel, id: string, ...args: TArgs) => void,
) {
    return useCallback((nodeIds: string[], ...args: TArgs) => {
        document.change((model: DenicekModel) => {
            for (const id of nodeIds) {
                operation(model, id, ...args);
            }
        });
    }, [document]);
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
 * Hook to access document state.
 * Returns the document instance which provides direct access to nodes via
 * getNode(), getChildIds(), getParentId(), getRootId().
 */
export function useDocumentState() {
    const context = useContext(DenicekContext);
    if (!context) {
        throw new Error("useDocumentState must be used within a DenicekProvider");
    }

    return {
        document: context.document,
        version: context.version,
    };
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
        connect: (url: string, roomId: string) => {
            if (context.syncManager) {
                context.syncManager.connect(url, roomId).catch(console.error);
            }
        },
        disconnect: () => {
            context.syncManager?.disconnect();
        },
        isConnected: context.syncManager?.isConnected ?? false,
        roomId: context.syncManager?.roomId ?? null,
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
    const { document } = context;

    // Use state to store history data and trigger re-renders when it changes
    const [historyData, setHistoryData] = useState<GeneralizedPatch[]>(() => document.getHistory());

    // Subscribe to document patches to update history state
    useEffect(() => {
        // Subscribe to patches from the document
        const unsubscribe = document.subscribePatches(() => {
            // When a patch is received, get fresh history from document
            setHistoryData(document.getHistory());
        });

        // Also get initial history
        setHistoryData(document.getHistory());

        return unsubscribe;
    }, [document]);

    return {
        isRecording: true, // History is always active
        startRecording: (_startNodeId: string) => { /* no-op */ },
        stopRecording: () => document.getHistory(),
        replay: (script: GeneralizedPatch[], startNodeId: string) => document.replay(script, startNodeId),
        history: historyData,
        clearHistory: () => {
            document.clearHistory();
            setHistoryData([]);
        },
    };
}

/**
 * Hook for document actions (mutations)
 */
export function useDocumentActions() {
    const { document } = useDocumentState();

    const undo = useCallback(() => document.undo(), [document]);
    const redo = useCallback(() => document.redo(), [document]);

    // Simple bulk actions using the factory
    const updateAttribute = useBulkAction(document, (m, id, key: string, value: unknown | undefined) => m.updateAttribute(id, key, value));
    const updateTag = useBulkAction(document, (m, id, newTag: string) => m.updateTag(id, newTag));
    const wrapNodes = useBulkAction(document, (m, id, wrapperTag: string) => m.wrapNode(id, wrapperTag));
    const deleteNodes = useBulkAction(document, (m, id) => m.deleteNode(id));

    // Actions with special logic that don't fit the bulk pattern
    const updateValue = useCallback((nodeIds: string[], newValue: string, originalValue: string) => {
        const splice = calculateSplice(originalValue, newValue);
        document.change((model: DenicekModel) => {
            for (const id of nodeIds) {
                model.spliceValue(id, splice.index, splice.deleteCount, splice.insertText);
            }
        });
    }, [document]);

    const addChildren = useCallback((parentIds: string[], type: "element" | "value", content: string) => {
        const newIds: string[] = [];
        document.change((model: DenicekModel) => {
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
    }, [document]);

    const addSiblings = useCallback((referenceIds: string[], position: "before" | "after") => {
        const newIds: string[] = [];
        document.change((model: DenicekModel) => {
            for (const id of referenceIds) {
                const newId = position === "before"
                    ? model.addSiblingNodeBefore(id)
                    : model.addSiblingNodeAfter(id);
                if (newId) newIds.push(newId);
            }
        });
        return newIds;
    }, [document]);



    return {
        undo,
        redo,
        canUndo: document.canUndo,
        canRedo: document.canRedo,
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
