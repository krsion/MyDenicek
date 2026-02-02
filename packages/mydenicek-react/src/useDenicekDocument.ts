/**
 * React hooks for Denicek document operations
 */

import {
    type GeneralizedPatch,
    type SpliceInfo,
    type SyncStatus,
} from "@mydenicek/core";
import { useCallback, useContext, useEffect, useState } from "react";

import { DenicekContext } from "./DenicekProvider.js";

/**
 * Calculates the minimal splice operation needed to transform oldVal into newVal.
 */
function calculateSplice(oldVal: string, newVal: string): SpliceInfo {
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

const defaultSyncState = {
    status: "idle" as SyncStatus,
    latency: undefined as number | undefined,
    roomId: null as string | null,
    error: null as string | null,
};

/**
 * Hook for sync connectivity state
 * Provides reactive access to sync status, latency, and error information
 */
export function useConnectivity() {
    const context = useContext(DenicekContext);
    if (!context) {
        throw new Error("useConnectivity must be used within a DenicekProvider");
    }

    const syncState = context.syncManager?.syncState ?? defaultSyncState;

    return {
        connect: (url: string, roomId: string) => {
            if (context.syncManager) {
                context.syncManager.connect(url, roomId).catch(console.error);
            }
        },
        disconnect: () => {
            context.syncManager?.disconnect();
        },
        // New reactive state
        status: syncState.status,
        latency: syncState.latency,
        error: syncState.error,
        roomId: syncState.roomId,
        // Backwards compatible
        isConnected: syncState.status === "connected",
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

    // Direct actions using the new Document API
    const updateAttribute = useCallback((nodeIds: string[], key: string, value: unknown | undefined) => {
        for (const id of nodeIds) {
            document.updateAttribute(id, key, value);
        }
    }, [document]);

    const updateTag = useCallback((nodeIds: string[], newTag: string) => {
        for (const id of nodeIds) {
            document.updateTag(id, newTag);
        }
    }, [document]);

    const deleteNodes = useCallback((nodeIds: string[]) => {
        for (const id of nodeIds) {
            document.deleteNode(id);
        }
    }, [document]);

    const updateValue = useCallback((nodeIds: string[], newValue: string, originalValue: string) => {
        const splice = calculateSplice(originalValue, newValue);
        for (const id of nodeIds) {
            document.spliceValue(id, splice.index, splice.deleteCount, splice.insertText);
        }
    }, [document]);

    const addChildren = useCallback((parentIds: string[], type: "element" | "value", content: string) => {
        const newIds: string[] = [];
        for (const id of parentIds) {
            const node = document.getNode(id);
            if (node?.kind === "element") {
                const newId = type === "value"
                    ? document.addChild(id, { kind: "value", value: content })
                    : document.addChild(id, { kind: "element", tag: content, attrs: {}, children: [] });
                newIds.push(newId);
            }
        }
        return newIds;
    }, [document]);

    return {
        undo,
        redo,
        canUndo: document.canUndo,
        canRedo: document.canRedo,
        updateAttribute,
        updateTag,
        updateValue,
        addChildren,
        deleteNodes,
    };
}

