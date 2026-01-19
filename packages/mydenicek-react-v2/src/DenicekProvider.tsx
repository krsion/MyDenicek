/**
 * DenicekProvider - React context provider for Loro-based documents
 *
 * This provider creates and manages a DenicekDocument,
 * making it available to child components via React context.
 */

import {
    DenicekDocument,
    DenicekModel,
} from "@mydenicek/core-v2";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Context types
export interface DenicekContextValue {
    /** The document instance (includes undo/redo, history, replay, and node access) */
    document: DenicekDocument;
    /** Version counter - changes on each document update, use for reactive dependencies */
    version: number;
    /** Sync manager */
    syncManager?: {
        connect: (url: string, roomId: string) => Promise<void>;
        disconnect: () => Promise<void>;
        isConnected: boolean;
        roomId: string | null;
    };
}

export interface DenicekSelectionContextValue {
    /** Currently selected node IDs */
    selectedNodeIds: string[];
    /** Update selection */
    setSelectedNodeIds: (ids: string[]) => void;
}

// Contexts
export const DenicekContext = createContext<DenicekContextValue | null>(null);
export const DenicekSelectionContext = createContext<DenicekSelectionContextValue | null>(null);

export interface DenicekProviderProps {
    children: ReactNode;
    /** Optional initial document (for importing existing data) */
    initialDocument?: DenicekDocument;
    /** Optional initializer to set up document structure when creating a new document */
    initializer?: (model: DenicekModel) => void;
    /** Callback when document changes */
    onChange?: () => void;
}

/**
 * Provider component for Denicek documents
 */
export function DenicekProvider({
    children,
    initialDocument,
    initializer,
    onChange,
}: DenicekProviderProps) {
    // Version counter for triggering re-renders
    const [version, setVersion] = useState(0);

    // Create or use provided document
    const document = useMemo(() => {
        return initialDocument ?? DenicekDocument.create(
            { onVersionChange: () => setVersion(v => v + 1) },
            initializer
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialDocument]);

    // If using an external document, subscribe to its changes
    useEffect(() => {
        if (initialDocument) {
            return initialDocument.subscribe(() => {
                setVersion(v => v + 1);
            });
        }
    }, [initialDocument]);

    // Notify parent of changes
    useEffect(() => {
        onChange?.();
    }, [version, onChange]);

    // Sync handlers - use document's built-in sync methods
    const connect = async (url: string, roomId: string) => {
        await document.connectToSync({ url, roomId });
        setVersion(v => v + 1); // Trigger re-render to update sync state
    };

    const disconnect = async () => {
        await document.disconnectSync();
        setVersion(v => v + 1); // Trigger re-render to update sync state
    };

    // Selection state
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

    const contextValue: DenicekContextValue = {
        document,
        version,
        syncManager: {
            connect,
            disconnect,
            isConnected: document.isSyncConnected,
            roomId: document.syncRoomId,
        }
    };

    const selectionContextValue: DenicekSelectionContextValue = {
        selectedNodeIds,
        setSelectedNodeIds,
    };

    return (
        <DenicekSelectionContext.Provider value={selectionContextValue}>
            <DenicekContext.Provider value={contextValue}>
                {children}
            </DenicekContext.Provider>
        </DenicekSelectionContext.Provider>
    );
}
