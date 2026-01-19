/**
 * mydenicek-core-v2
 *
 * Core document operations using Loro CRDT
 * No Loro types are exposed - all CRDT details are hidden
 */

// Main classes
export { DenicekDocument } from "./DenicekDocument.js";
export type { DenicekDocumentOptions, SyncOptions } from "./DenicekDocument.js";

export { DenicekModel } from "./DenicekModel.js";



// Error handling
export { DenicekError, handleModelError } from "./errors.js";

// Types
export type {
    DenicekAction,
    // Public node data types
    ElementNodeData,
    NodeData,
    ValueNodeData,
    // Snapshot for temporal comparisons
    Snapshot,
    // Internal node types (for model operations)
    ElementNode,
    Node,
    ValueNode,
    // Sync types
    SyncState,
    SyncStatus,
    // Other types
    GeneralizedPatch,
    OpId,
    SpliceInfo,
    Version,
} from "./types.js";

