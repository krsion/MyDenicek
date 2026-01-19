/**
 * Public types for mydenicek-core-v2
 * No Loro types are exposed - all internal CRDT details are hidden
 */


// ============================================================================
// Public Node Data Types
// ============================================================================

/**
 * Element node data - public read-only view of an element node
 * Children are accessed via DenicekDocument.getChildIds(), not stored here
 */
export interface ElementNodeData {
    id: string;
    kind: "element";
    tag: string;
    attrs: Record<string, unknown>;
}

/**
 * Value node data - public read-only view of a text content node
 */
export interface ValueNodeData {
    id: string;
    kind: "value";
    value: string;
}

/**
 * Union type for public node data
 */
export type NodeData = ElementNodeData | ValueNodeData;

/**
 * Immutable snapshot of document state for temporal comparisons.
 * Use DenicekDocument methods for live document access.
 */
export interface Snapshot {
    readonly nodes: ReadonlyMap<string, NodeData>;
    readonly parents: ReadonlyMap<string, string | null>;
    readonly childIds: ReadonlyMap<string, readonly string[]>;
    readonly rootId: string | null;
}


// ============================================================================
// Internal Node Types
// ============================================================================

/**
 * Internal element node - includes children IDs for tree operations
 * @internal
 */
export interface ElementNode {
    kind: "element";
    tag: string;
    attrs: Record<string, unknown>;
    children: string[];
}

/**
 * Internal value node
 * @internal
 */
export interface ValueNode {
    kind: "value";
    value: string;
}

/**
 * Internal union type for all node types
 * @internal
 */
export type Node = ElementNode | ValueNode;

/**
 * Splice info for text operations
 */
export interface SpliceInfo {
    index: number;
    deleteCount: number;
    insertText: string;
}

/**
 * OpId represents a single operation ID (peer + counter)
 */
export interface OpId {
    peer: string;
    counter: number;
}

/**
 * Version is an array of OpIds (frontiers in Loro terminology)
 */
export type Version = OpId[];

/**
 * Generalized patch for recording/replay
 */
export type PatchAction = "put" | "del" | "insert" | "splice" | "inc" | "move";

export interface GeneralizedPatch {
    action: PatchAction;
    path: (string | number)[];
    value?: unknown;
    length?: number;
}

/**
 * DenicekAction - alias for GeneralizedPatch for backwards compatibility
 */
export type DenicekAction = GeneralizedPatch;

