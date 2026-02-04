/**
 * mydenicek-core
 *
 * Core document operations using Loro CRDT
 * No Loro types are exposed - all CRDT details are hidden
 */

// Main classes
export type { DenicekDocumentOptions, NodeInput, SyncOptions } from "./DenicekDocument.js";
export { DenicekDocument } from "./DenicekDocument.js";




// Types
export type {
    // Internal node types (for model operations)
    ActionNode,
    // Public node data types
    ActionNodeData,
    ElementNode,
    ElementNodeData,
    FormulaContext,
    FormulaDocumentAccessor,
    FormulaNode,
    FormulaNodeData,
    // Patch types
    GeneralizedPatch,
    GroupedPatch,
    MapPatch,
    Node,
    NodeData,
    // Formula types
    Operation,
    OpId,
    PatchNodeData,
    RefNode,
    RefNodeData,
    // Snapshot for temporal comparisons
    Snapshot,
    SpliceInfo,
    // Sync types
    SyncState,
    SyncStatus,
    TextPatch,
    TreePatch,
    ValueNode,
    ValueNodeData,
    Version
} from "./types.js";

// Formula engine
export { evaluateFormula, getNodeValue, isFormulaError } from "./formula/index.js";

