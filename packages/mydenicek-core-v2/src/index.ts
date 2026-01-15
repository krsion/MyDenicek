/**
 * mydenicek-core-v2
 *
 * Core document operations using Loro CRDT
 * No Loro types are exposed - all CRDT details are hidden
 */

// Main classes
export { DenicekDocument } from "./DenicekDocument.js";
export type { DenicekDocumentOptions } from "./DenicekDocument.js";

export { DenicekModel } from "./DenicekModel.js";

export { DenicekStore } from "./DenicekStore.js";
export type { StoreOptions } from "./DenicekStore.js";

// Error handling
export { DenicekError, handleModelError } from "./errors.js";

// Types
export type {
    DenicekAction,
    // Document types
    DocumentSnapshot, ElementNode, GeneralizedPatch, HistoryEntry,
    // Node types
    Node,
    // Recording/replay
    PatchAction,
    // Selection
    SelectionInfo, SpliceInfo,

    // Cursor and history
    TextCursor, ValueNode
} from "./types.js";

