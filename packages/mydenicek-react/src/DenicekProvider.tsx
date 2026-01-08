import {
    DocHandle,
    IndexedDBStorageAdapter,
    isValidAutomergeUrl,
    Repo,
    RepoContext,
    useDocument,
    useLocalAwareness,
    useRemoteAwareness,
    WebSocketClientAdapter
} from "@automerge/react";
import { DenicekModel, DenicekStore, UndoManager, type JsonDoc } from "@mydenicek/core";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Context to provide the current document state and actions
interface DenicekContextValue {
    model: DenicekModel | undefined;
    store: DenicekStore;
    connect: () => void;
    disconnect: () => void;
}

interface DenicekInternalContextValue {
    doc: any | null;
    selectedNodeIds: string[];
    setSelectedNodeIds: (ids: string[]) => void;
    remoteSelections: { [userId: string]: string[] | null };
    userId: string | null;
}

export const DenicekContext = createContext<DenicekContextValue | null>(null);
export const DenicekInternalContext = createContext<DenicekInternalContextValue | null>(null);

interface DenicekProviderProps {
    children: ReactNode;
    /**
     * The Sync URL for the WebSocket connection.
     * Default: "wss://sync.automerge.org/"
     */
    syncUrl?: string;
}

export function DenicekProvider({
    children,
    syncUrl = "wss://sync.automerge.org/",
}: DenicekProviderProps) {
    // Initialize Repo once
    const repo = useMemo(() => {
        return new Repo({
            network: [new WebSocketClientAdapter(syncUrl)],
            storage: new IndexedDBStorageAdapter(),
        });
    }, [syncUrl]);

    return (
        <RepoContext.Provider value={repo}>
            <DenicekInternalProvider repo={repo}>
                {children}
            </DenicekInternalProvider>
        </RepoContext.Provider>
    );
}

function DenicekInternalProvider({ children, repo }: { children: ReactNode, repo: Repo }) {
    // UndoManager instance - stable across renders
    const undoManager = useMemo(() => new UndoManager<JsonDoc>(), []);

    // Force re-render when store version changes
    const [, setStoreVersion] = useState(0);

    // DenicekStore instance
    const store = useMemo(() => new DenicekStore(undoManager, {
        onVersionChange: (v) => setStoreVersion(v)
    }), [undoManager]);

    const [handle, setHandle] = useState<DocHandle<JsonDoc> | null>(null);

    useEffect(() => {
        const initDocument = async () => {
            const locationHash = document.location.hash.substring(1);

            let h: DocHandle<JsonDoc>;
            if (isValidAutomergeUrl(locationHash)) {
                h = (await repo.find(locationHash)) as DocHandle<JsonDoc>;
            } else {
                h = repo.create<JsonDoc>(DenicekModel.createInitialDocument()) as DocHandle<JsonDoc>;
                document.location.hash = h.url;
            }
            setHandle(h);
        };

        initDocument();
    }, [repo]);

    const [doc] = useDocument<JsonDoc>(handle?.url);

    // Create a read-only model wrapper around the current document state
    const model = useMemo(() => doc ? new DenicekModel(doc) : undefined, [doc]);

    const connect = () => {
        repo.networkSubsystem.adapters[0]?.connect(repo.peerId);
    };

    const disconnect = () => {
        repo.networkSubsystem.adapters[0]?.disconnect();
    };

    const userId = repo?.peerId ?? null;

    const [localState, updateLocalState] = useLocalAwareness({
        handle: handle as any,
        userId: userId as string,
        initialState: { selectedNodeIds: [] as string[] },
    });

    const [peerStates] = useRemoteAwareness({
        handle: handle as any,
        localUserId: userId as string,
        offlineTimeout: 1000,
    });

    const selectedNodeIds = localState.selectedNodeIds || [];
    const setSelectedNodeIds = (ids: string[]) => {
        updateLocalState({ selectedNodeIds: ids });
    };

    const remoteSelections = useMemo(() => {
        const selections: { [peerId: string]: string[] | null } = {};
        Object.entries(peerStates).forEach(([peerId, state]) => {
            const selected = (state as any)?.selectedNodeIds;
            if (selected && Array.isArray(selected)) {
                selections[peerId] = selected;
            } else {
                selections[peerId] = null;
            }
        });
        return selections;
    }, [peerStates]);

    const contextValue: DenicekContextValue = {
        model,
        store,
        connect,
        disconnect,
    };

    const internalContextValue: DenicekInternalContextValue = {
        doc: handle,
        selectedNodeIds,
        setSelectedNodeIds,
        remoteSelections,
        userId
    };

    if (!handle) {
        return null; // Or a loading spinner if preferred
    }

    return (
        <DenicekInternalContext.Provider value={internalContextValue}>
            <DenicekContext.Provider value={contextValue}>
                {children}
            </DenicekContext.Provider>
        </DenicekInternalContext.Provider>
    );
}
