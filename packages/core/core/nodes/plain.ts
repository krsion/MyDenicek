import type { PrimitiveValue } from '../selector.ts';

/** A plain serializable node accepted by the public package API. */
export type PlainNode = PrimitiveValue | PlainRef | PlainRecord | PlainList;

/** A plain reference node represented as a selector string. */
export interface PlainRef {
  /** Absolute or relative selector pointing at another node. */
  $ref: string;
}

/** A plain list node with a structural tag and ordered child items. */
export interface PlainList {
  /** Structural tag describing the list node. */
  $tag: string;
  /** Ordered child items contained in the list. Accepts readonly arrays from const fixtures. */
  $items: readonly PlainNode[];
}

/** A plain record node with a structural tag and named child fields. */
export interface PlainRecord {
  /** Structural tag describing the record node. */
  $tag: string;
  /** Named child fields contained in the record. */
  [key: string]: PlainNode;
}
