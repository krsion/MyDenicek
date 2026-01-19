/**
 * Public types for mydenicek-core-v2
 * No Loro types are exposed - all internal CRDT details are hidden
 */


/**
 * Element node - represents a structural element in the document tree
 */
export interface ElementNode {
    kind: "element";
    tag: string;
    attrs: Record<string, unknown>;
    children: string[];
}

/**
 * Value node - represents a text content node
 */
export interface ValueNode {
    kind: "value";
    value: string;
}

/**
 * Union type for all node types
 */
export type Node = ElementNode | ValueNode;

/**
 * Document snapshot - plain JSON representation of the document
 */
export interface DocumentSnapshot {
    root: string;
    nodes: Record<string, Node>;
}

/**
 * Splice info for text operations
 */
export interface SpliceInfo {
    index: number;
    deleteCount: number;
    insertText: string;
}


/**
 * Cursor position in a text node
 */
export interface TextCursor {
    nodeId: string;
    position: number;
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
 * History entry for time travel
 */
export interface HistoryEntry {
    /** Version identifier (frontiers) */
    version: Version;
    /** Timestamp when this version was created */
    timestamp?: number;
    /** Origin identifier for this change */
    origin?: string;
}

/**
 * Generalized patch for recording/replay
 */
export type PatchAction = "put" | "del" | "insert" | "splice" | "inc" | "move";

export interface GeneralizedPatch {
    action: PatchAction;
    path: (string | number)[];
    value?: unknown;
    values?: unknown[];
    length?: number;
    _deleteLength?: number;
}

/**
 * DenicekAction - alias for GeneralizedPatch for backwards compatibility
 */
export type DenicekAction = GeneralizedPatch;

