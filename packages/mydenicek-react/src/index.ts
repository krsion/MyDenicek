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
    ValueNodeData
} from "@mydenicek/core";
export { DenicekDocument, DenicekModel } from "@mydenicek/core";

// Constants
export { DENICEK_NODE_ID_ATTR } from "./constants.js";

// Provider
export {
    DenicekContext, type DenicekContextValue, DenicekProvider, type DenicekProviderProps, DenicekSelectionContext, type DenicekSelectionContextValue
} from "./DenicekProvider.js";

// Hooks
export {
    calculateSplice, type DenicekActions,
useConnectivity, useDenicekDocument, useDocumentActions, useDocumentState, useRecording} from "./useDenicekDocument.js";
export { type SelectedNodeDetails,useSelectedNode, useSelection } from "./useSelection.js";

