/**
 * DenicekProvider - React context provider for Loro-based documents
 *
 * This provider creates and manages a DenicekDocument,
 * making it available to child components via React context.
 */

import {
    DenicekDocument,
    DocumentView,
} from "@mydenicek/core-v2";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Context types
export interface DenicekContextValue {
    /** The document instance (includes undo/redo, history, replay) */
    document: DenicekDocument;
    /** Current document view (read-only, encapsulated tree access) */
    snapshot: DocumentView;
    /** Sync manager */
    syncManager?: {
        connect: (url: string, roomId: string) => Promise<void>;
        disconnect: () => void;
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
    /** Callback when document changes */
    onChange?: (view: DocumentView) => void;
}

/**
 * Provider component for Denicek documents
 */
export function DenicekProvider({
    children,
    initialDocument,
    onChange,
}: DenicekProviderProps) {
    // Version counter for triggering re-renders
    const [version, setVersion] = useState(0);

    // Create or use provided document
    const document = useMemo(() => {
        return initialDocument ?? DenicekDocument.create({
            onVersionChange: () => setVersion(v => v + 1),
        });
    }, [initialDocument]);

    // If using an external document, subscribe to its changes
    useEffect(() => {
        if (initialDocument) {
            return initialDocument.subscribe(() => {
                setVersion(v => v + 1);
            });
        }
    }, [initialDocument]);

    // Get current snapshot - updates when version changes
    const snapshot = useMemo(() => {
        return document.getSnapshot();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [document, version]);

    // Notify parent of changes
    useEffect(() => {
        onChange?.(snapshot);
    }, [snapshot, onChange]);

    // Sync state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [syncClient, setSyncClient] = useState<any>(null);
    const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);

    const connect = async (url: string, roomId: string) => {
        if (syncClient) {
            syncClient.close();
        }

        const { createDenicekSyncClient, LoroAdaptor } = await import("@mydenicek/sync-client");
        const client = createDenicekSyncClient({ url });

        await client.connect();

        const room = await client.join({
            roomId,
            crdtAdaptor: new LoroAdaptor(document._internal.doc)
        });

        // Wait for initial sync with server, then commit to push any local changes
        await room.waitForReachingServerVersion();
        document.commit("sync-connect");

        setSyncClient(client);
        setCurrentRoomId(roomId);
    };

    const disconnect = () => {
        if (syncClient) {
            syncClient.close();
            setSyncClient(null);
            setCurrentRoomId(null);
        }
    };

    // Selection state
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

    const contextValue: DenicekContextValue = {
        document,
        snapshot,
        syncManager: {
            connect,
            disconnect,
            isConnected: !!syncClient,
            roomId: currentRoomId,
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
