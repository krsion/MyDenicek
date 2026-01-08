import { next as Automerge } from "@automerge/automerge";

export type GeneralizedPatch = Omit<Automerge.Patch, 'path'> & { path: (string | number)[], values?: unknown[], value?: unknown };
export type DenicekAction = GeneralizedPatch;

export type ElementNode = {
  kind: "element";
  tag: string;
  attrs: Record<string, unknown>;
  children: string[];
}

export type ValueNode = {
  kind: "value";
  value: string;
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
