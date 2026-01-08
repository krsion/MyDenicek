import {
    DocHandle,
    IndexedDBStorageAdapter,
    isValidAutomergeUrl,
    Repo,
    RepoContext,
    useDocument,
    WebSocketClientAdapter
} from "@automerge/react";
import { DenicekModel, UndoManager, type JsonDoc } from "@mydenicek/core";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Context to provide the current document state and actions
interface DenicekContextValue {
    model: DenicekModel | undefined;
    undoManager: UndoManager<JsonDoc>;
    connect: () => void;
    disconnect: () => void;
}

interface DenicekInternalContextValue {
    handle: DocHandle<JsonDoc> | null;
    repo: Repo | null;
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

    const contextValue: DenicekContextValue = {
        model,
        undoManager,
        connect,
        disconnect,
    };

    const internalContextValue: DenicekInternalContextValue = {
        handle,
        repo
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
