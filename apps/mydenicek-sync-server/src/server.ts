/**
 * Loro Sync Server for MyDenicek
 *
 * This server uses loro-websocket's SimpleServer to handle
 * real-time synchronization of documents.
 */

import type { CrdtType, Permission } from "loro-protocol";
import { SimpleServer } from "loro-websocket/server";

import { initPersistence, loadDocument, saveDocument } from "./persistence.js";

function timestamp(): string {
    return new Date().toISOString();
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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
export async function createSyncServer(
    options: SyncServerOptions
): Promise<SimpleServer> {
    const { port, host, persistencePath, saveInterval = 5000 } = options;

    if (persistencePath) {
        initPersistence(persistencePath);
    }

    const server = new SimpleServer({
        port,
        host,
        saveInterval,
        onLoadDocument: async (roomId: string, crdtType: CrdtType) => {
            console.log(`[${timestamp()}] LOAD room="${roomId}" type=${crdtType}`);
            if (persistencePath) {
                const data = loadDocument(roomId);
                if (data) {
                    console.log(
                        `[${timestamp()}] LOADED room="${roomId}" size=${formatBytes(data.length)}`
                    );
                } else {
                    console.log(`[${timestamp()}] NEW room="${roomId}" (no existing data)`);
                }
                return data;
            }
            return null;
        },
        onSaveDocument: async (roomId: string, crdtType: CrdtType, data: Uint8Array) => {
            console.log(
                `[${timestamp()}] SYNC room="${roomId}" size=${formatBytes(data.length)}`
            );
            if (persistencePath) {
                await saveDocument(roomId, data);
                console.log(`[${timestamp()}] SAVED room="${roomId}"`);
            }
        },
    });

    await server.start();
    console.log(`[${timestamp()}] Loro sync server listening on ${host || "0.0.0.0"}:${port}`);

    return server;
}

export type { CrdtType, Permission } from "loro-protocol";
export { SimpleServer } from "loro-websocket/server";

