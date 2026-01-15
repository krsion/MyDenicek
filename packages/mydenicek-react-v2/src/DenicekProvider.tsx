/**
 * DenicekProvider - React context provider for Loro-based documents
 * 
 * This provider creates and manages a DenicekDocument and DenicekStore,
 * making them available to child components via React context.
 */

import {
    DenicekDocument,
    DenicekStore,
    type DocumentSnapshot
} from "@mydenicek/core-v2";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Context types
export interface DenicekContextValue {
    /** The document instance */
    document: DenicekDocument;
    /** The store for mutations and undo/redo */
    store: DenicekStore;
    /** Current document snapshot (read-only view) */
    snapshot: DocumentSnapshot;
    /** Sync manager */
    syncManager?: {
        connect: (url: string) => Promise<void>;
        disconnect: () => void;
        isConnected: boolean;
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
    onChange?: (snapshot: DocumentSnapshot) => void;
}

/**
 * Provider component for Denicek documents
 */
export function DenicekProvider({
    children,
    initialDocument,
    onChange,
}: DenicekProviderProps) {
    // Create or use provided document
    const document = useMemo(() => {
        return initialDocument ?? DenicekDocument.create();
    }, [initialDocument]);

    // Version counter for triggering re-renders
    const [version, setVersion] = useState(0);

    // Create store with version change callback
    const store = useMemo(() => {
        return new DenicekStore(document, {
            onVersionChange: () => setVersion(v => v + 1),
        });
    }, [document]);

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

    const connect = async (url: string) => {
        if (syncClient) {
            syncClient.close();
        }

        const { createDenicekSyncClient, LoroAdaptor } = await import("@mydenicek/sync-client");
        const client = createDenicekSyncClient({ url });

        await client.connect();

        // Use a fixed room name for simplicity in this migration
        await client.join({
            roomId: "denicek-room",
            crdtAdaptor: new LoroAdaptor(document._internal.doc)
        });

        setSyncClient(client);
    };

    const disconnect = () => {
        if (syncClient) {
            syncClient.close();
            setSyncClient(null);
        }
    };

    // Selection state
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

    const contextValue: DenicekContextValue = {
        document,
        store,
        snapshot,
        syncManager: {
            connect,
            disconnect,
            isConnected: !!syncClient,
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
