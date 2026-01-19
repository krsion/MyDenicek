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


// DocumentView - encapsulated read-only view of the document
export { DocumentView } from "./DocumentView.js";

// Error handling
export { DenicekError, handleModelError } from "./errors.js";

// Types
export type {
    DenicekAction,
    // Public node data types (used with DocumentView)
    ElementNodeData,
    NodeData,
    ValueNodeData,
    // Internal node types (for model operations)
    ElementNode,
    Node,
    ValueNode,
    // Other types
    GeneralizedPatch,
    HistoryEntry,
    PatchAction,
    SpliceInfo,
    TextCursor,
} from "./types.js";

