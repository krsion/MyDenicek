export type PatchAction = "put" | "del" | "insert" | "splice" | "inc";

export type Heads = string[];

export interface GeneralizedPatch {
  action: PatchAction;
  path: (string | number)[];
  value?: any;
  values?: any[];
  length?: number;
  _deleteLength?: number; // Internal for undo/redo splice logic
}

export type DenicekAction = GeneralizedPatch;

export type ElementNode = {
  kind: "element";
  tag: string;
  attrs: Record<string, unknown>;
  children: string[];
  /** Tracks the highest transformation version applied to this node from its parent. Default 0. */
  version?: number;
}

export type ValueNode = {
  kind: "value";
  value: string;
  /** Tracks the highest transformation version applied to this node from its parent. Default 0. */
  version?: number;
};

export type Node = ElementNode | ValueNode;

export type JsonDoc = {
  root: string;
  nodes: Record<string, Node>;
  transformations: Transformation[];
};

export type Transformation = {
  parent: string;
  version: number; // 1-based incrementing version for this parent
  type: "wrap" | "rename";
  tag: string;
};
