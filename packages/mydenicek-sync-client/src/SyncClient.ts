/**
 * Loro Sync Client for MyDenicek
 *
 * Re-exports loro-websocket client and loro-adaptors for use with DenicekDocuments.
 * The loro-websocket library handles WebSocket sync with automatic reconnection.
 */

import {
    ClientStatus,
    LoroWebsocketClient,
    type ClientStatusValue,
    type LoroWebsocketClientOptions,
    type LoroWebsocketClientRoom
} from "loro-websocket/client";

// Re-export the main client and adaptor types from loro-websocket
export {
    ClientStatus,
    LoroWebsocketClient,
    type ClientStatusValue,
    type LoroWebsocketClientOptions,
    type LoroWebsocketClientRoom
};

// Re-export adaptors
// @ts-ignore - TS fails to resolve named export despite it existing in d.ts
    export { LoroAdaptor } from "loro-adaptors";

/**
 * Helper to create a properly configured sync client for DenicekDocument
 * 
 * @example
 * ```typescript
 * import { createDenicekSyncClient } from "@mydenicek/sync-client";
 * import { DenicekDocument } from "@mydenicek/core-v2";
 * 
 * const doc = DenicekDocument.create();
 * const client = createDenicekSyncClient({
 *     url: "ws://localhost:3001",
 * });
 * 
 * // Join a room - the adaptor will sync doc.getSnapshot() with peers
 * await client.connect();
 * const room = await client.join("my-room", new LoroAdaptor(doc._internal.doc));
 * 
 * // Leave and cleanup
 * room.leave();
 * client.close();
 * ```
 */
export function createDenicekSyncClient(options: {
    url: string;
    pingIntervalMs?: number;
}) {
    return new LoroWebsocketClient(options);
}