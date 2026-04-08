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
  type EventSnapshot,
  type PlainList,
  type PlainNode,
  type PlainRecord,
  type PlainRef,
  type PrimitiveValue,
} from "@mydenicek/core";
