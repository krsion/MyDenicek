/**
 * MyDenicek React v2
 * 
 * React hooks for Loro-based Denicek documents.
 */

// Re-export types from core
export type {
    DenicekAction,
    ElementNode,
    ElementNodeData,
    Node,
    NodeData,
    Snapshot,
    SpliceInfo,
    ValueNode,
    ValueNodeData,
} from "@mydenicek/core-v2";

export { DenicekDocument, DenicekModel } from "@mydenicek/core-v2";

// Constants
export { DENICEK_NODE_ID_ATTR } from "./constants.js";

// Provider
export {
    DenicekContext, DenicekProvider, DenicekSelectionContext,
    type DenicekContextValue, type DenicekProviderProps, type DenicekSelectionContextValue
} from "./DenicekProvider.js";

// Hooks
export {
    calculateSplice, useConnectivity, useDenicekDocument, useDocumentActions, useDocumentState, useRecording, type DenicekActions
} from "./useDenicekDocument.js";

export { useSelectedNode, useSelection, type SelectedNodeDetails } from "./useSelection.js";

