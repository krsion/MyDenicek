/**
 * @module
 * WebSocket sync server and client for the Denicek CRDT.
 *
 * Provides a ready-to-use sync server ({@linkcode createSyncServer}),
 * a browser/Deno sync client ({@linkcode SyncClient}), and the
 * underlying protocol types for custom integrations.
 *
 * ```ts
 * import { createSyncServer } from "@mydenicek/sync-server";
 *
 * createSyncServer({ port: 8787, persistencePath: "./data" });
 * ```
 */

export {
  applySyncResponse,
  createSyncRequest,
  decodeEvent,
  encodeEvent,
} from "./protocol.ts";
export type {
  EncodedErrorMessage,
  EncodedEvent,
  EncodedEventId,
  EncodedHelloMessage,
  EncodedSyncMessage,
  EncodedSyncRequest,
  EncodedSyncResponse,
} from "./protocol.ts";
export { SyncRoom } from "./room.ts";
export { createSyncServer } from "./server.ts";
export type { SyncServerHandle, SyncServerOptions } from "./server.ts";
export { SyncClient } from "./client.ts";
export type { SyncClientOptions } from "./client.ts";
