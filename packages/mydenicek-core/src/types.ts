export type PatchAction = "put" | "del" | "insert" | "splice" | "inc";

export type Heads = string[];

export interface GeneralizedPatch {
  action: PatchAction;
  path: (string | number)[];
  value?: unknown;
  values?: unknown[];
  length?: number;
  _deleteLength?: number; // Internal for undo/redo splice logic
}

export type DenicekAction = GeneralizedPatch;

/**
 * Tracks which transformations have been applied at each specificity level.
 * Key: specificity (3 = tag+depth, 2 = depth-only, 1 = tag-only)
 * Value: { version, transformationKey }
 */
export type AppliedTransformations = Record<number, { version: number; key: string }>;

export type ElementNode = {
  kind: "element";
  tag: string;
  attrs: Record<string, unknown>;
  children: string[];
  /** Tracks the highest transformation version applied to this node. Default 0. */
  version?: number;
  /** Tracks applied transformations by specificity for conflict resolution. */
  appliedTransformations?: AppliedTransformations;
}

export type ValueNode = {
  kind: "value";
  value: string;
  /** Tracks the highest transformation version applied to this node. Default 0. */
  version?: number;
  /** Tracks applied transformations by specificity for conflict resolution. */
  appliedTransformations?: AppliedTransformations;
};

export type Node = ElementNode | ValueNode;

/**
 * Key format: "${lca}:${selectorTag || '*'}:${selectorDepth ?? '*'}:${version}"
 * Examples:
 * - "ul:li:*:1" - matches <li> at any depth
 * - "ul:*:1:1" - matches any element at depth 1
 * - "ul:li:1:1" - matches <li> at depth 1
 */
export type TransformationKey = string;

export type JsonDoc = {
  root: string;
  nodes: Record<string, Node>;
  /** Keyed by transformation key to ensure uniqueness */
  transformations: Record<TransformationKey, Transformation>;
  /** Configuration for specificity ordering: 'depth-first' or 'tag-first'. Default: 'depth-first' */
  specificityOrder?: 'depth-first' | 'tag-first';
};

export type Transformation = {
  /** The LCA (lowest common ancestor) node for this transformation */
  lca: string;
  /** Version number for this LCA+selector combination */
  version: number;
  /** Type of transformation */
  type: "wrap" | "rename";
  /** The new tag to apply (for rename) or wrapper tag (for wrap) */
  tag: string;
  /** Optional: only apply to children matching this tag */
  selectorTag?: string;
  /** Optional: only apply to descendants at this depth from LCA (1 = direct children) */
  selectorDepth?: number;
};
