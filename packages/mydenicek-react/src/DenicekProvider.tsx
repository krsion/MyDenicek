import {
    DocHandle,
    IndexedDBStorageAdapter,
    isValidAutomergeUrl,
    Repo,
    RepoContext,
    WebSocketClientAdapter
} from "@automerge/react";
import { DenicekModel, type JsonDoc } from "@mydenicek/core";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

// Context to provide the current document handle
interface DenicekContextValue {
    handle: DocHandle<JsonDoc> | null;
    connect: () => void;
    disconnect: () => void;
}

export const DenicekContext = createContext<DenicekContextValue | null>(null);

export const useDenicekContext = () => {
    const context = useContext(DenicekContext);
    if (!context) {
        throw new Error("useDenicekContext must be used within a DenicekProvider");
    }
    return context;
};

interface DenicekProviderProps {
    children: ReactNode;
    /**
     * The Sync URL for the WebSocket connection.
     * Default: "wss://sync.automerge.org/"
     */
    syncUrl?: string;
    /**
     * Optional appId for differentiating storage if needed.
     * Currently not strictly used by IndexedDB adapter in this implementation but good practice for future.
     */
    appId?: string;
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

    if (!handle) {
        return null; // Or a loading spinner if preferred, but null blocks rendering children until ready
    }

    const connect = () => {
        repo.networkSubsystem.adapters[0]?.connect(repo.peerId);
    };

    const disconnect = () => {
        repo.networkSubsystem.adapters[0]?.disconnect();
    };

    return (
        <RepoContext.Provider value={repo}>
            <DenicekContext.Provider value={{ handle, connect, disconnect }}>
                {children}
            </DenicekContext.Provider>
        </RepoContext.Provider>
    );
}
