/**
 * Loro Sync Server for MyDenicek
 * 
 * This server uses loro-websocket's SimpleServer to handle
 * real-time synchronization of documents.
 */

import type { CrdtType, Permission } from "loro-protocol";
import { SimpleServer } from "loro-websocket/server";
import { initPersistence, loadDocument, saveDocument } from "./persistence.js";

export interface SyncServerOptions {
    /** Port to listen on */
    port: number;
    /** Host to bind to */
    host?: string;
    /** Path to persist documents */
    persistencePath?: string;
    /** Save interval in milliseconds */
    saveInterval?: number;
    /** Authentication callback */
    onAuth?: (roomId: string, crdtType: CrdtType, auth: Uint8Array) => Promise<Permission | null>;
}

/**
 * Create and start the sync server
 */
export function createSyncServer(options: SyncServerOptions): SimpleServer {
    const { port, host, persistencePath, saveInterval = 5000, onAuth } = options;

    if (persistencePath) {
        initPersistence(persistencePath);
    }

    const server = new SimpleServer({
        port,
        host,
        saveInterval,
        onLoadDocument: async (roomId: string, crdtType: CrdtType) => {
            if (persistencePath) {
                return loadDocument(roomId);
            }
            return null;
        },
        onSaveDocument: async (roomId: string, crdtType: CrdtType, data: Uint8Array) => {
            if (persistencePath) {
                await saveDocument(roomId, data);
            }
        },
    });

    console.log(`Loro sync server listening on ${host || "0.0.0.0"}:${port}`);

    return server;
}

export type { CrdtType, Permission } from "loro-protocol";
export { SimpleServer } from "loro-websocket/server";

