/**
 * @module
 * React hook for the Denicek collaborative CRDT.
 *
 * Provides {@linkcode useDenicek} — a hook that wraps a
 * {@linkcode Denicek} instance with React state management,
 * auto-rendering on mutations, and optional WebSocket sync.
 *
 * ```tsx
 * import { useDenicek } from "@mydenicek/react";
 *
 * function Editor() {
 *   const dk = useDenicek({ sync: { url: "wss://...", roomId: "room1" } });
 *   return <pre>{JSON.stringify(dk.doc, null, 2)}</pre>;
 * }
 * ```
 */

export { useDenicek } from "./useDenicek.ts";
export type {
  SyncOptions,
  UseDenicekOptions,
  UseDenicekReturn,
} from "./useDenicek.ts";
export type { SyncStatus } from "./sync.ts";

// Re-export core types for convenience
export {
  Denicek,
  type EncodedRemoteEdit,
  type EncodedRemoteEvent,
  type EncodedRemoteEventId,
  type EventSnapshot,
  FormulaError,
  type FormulaResult,
  type PlainList,
  type PlainNode,
  type PlainRecord,
  type PlainRef,
  type PrimitiveValue,
} from "@mydenicek/core";
