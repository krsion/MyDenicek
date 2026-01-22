/**
 * Loro Sync Server for MyDenicek
 *
 * This server uses loro-websocket's SimpleServer to handle
 * real-time synchronization of documents.
 */

import type { CrdtType, Permission } from "loro-protocol";
import { SimpleServer } from "loro-websocket/server";

import * as filePersistence from "./persistence.js";
import * as blobPersistence from "./blob-persistence.js";

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
    /** Path to persist documents (file-based persistence) */
    persistencePath?: string;
    /** Azure Storage connection string (blob persistence) */
    azureStorageConnectionString?: string;
    /** Azure Blob container name (default: "loro-documents") */
    blobContainerName?: string;
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
    const {
        port,
        host,
        persistencePath,
        azureStorageConnectionString,
        blobContainerName = "loro-documents",
        saveInterval = 5000
    } = options;

    // Determine persistence backend (Azure Blob takes priority over file-based)
    let persistence: {
        load: (roomId: string) => Promise<Uint8Array | null> | Uint8Array | null;
        save: (roomId: string, data: Uint8Array) => Promise<void>;
    } | null = null;

    if (azureStorageConnectionString) {
        // Use Azure Blob Storage
        await blobPersistence.initBlobPersistence(azureStorageConnectionString, blobContainerName);
        persistence = {
            load: blobPersistence.loadDocument,
            save: blobPersistence.saveDocument
        };
        console.log(`[${timestamp()}] Using Azure Blob Storage persistence (container: ${blobContainerName})`);
    } else if (persistencePath) {
        // Use file-based persistence
        filePersistence.initPersistence(persistencePath);
        persistence = {
            load: filePersistence.loadDocument,
            save: filePersistence.saveDocument
        };
        console.log(`[${timestamp()}] Using file-based persistence (path: ${persistencePath})`);
    } else {
        console.log(`[${timestamp()}] No persistence configured - documents will not be saved`);
    }

    const server = new SimpleServer({
        port,
        host,
        saveInterval,
        onLoadDocument: async (roomId: string, crdtType: CrdtType) => {
            console.log(`[${timestamp()}] LOAD room="${roomId}" type=${crdtType}`);
            if (persistence) {
                const data = await persistence.load(roomId);
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
            if (persistence) {
                await persistence.save(roomId, data);
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

