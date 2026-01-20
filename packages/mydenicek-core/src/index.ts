/**
 * mydenicek-core
 *
 * Core document operations using Loro CRDT
 * No Loro types are exposed - all CRDT details are hidden
 */

// Main classes
export type { DenicekDocumentOptions, SyncOptions } from "./DenicekDocument.js";
export { DenicekDocument } from "./DenicekDocument.js";
export { DenicekModel } from "./DenicekModel.js";



// Error handling
export { DenicekError, handleModelError } from "./errors.js";

// Types
export type {
    DenicekAction,
    // Internal node types (for model operations)
    ElementNode,
    // Public node data types
    ElementNodeData,
    // Other types
    GeneralizedPatch,
    Node,
    NodeData,
    OpId,
    // Snapshot for temporal comparisons
    Snapshot,
    SpliceInfo,
    // Sync types
    SyncState,
    SyncStatus,
    ValueNode,
    ValueNodeData,
    Version
} from "./types.js";

