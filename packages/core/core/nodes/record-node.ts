import type { Selector, SelectorSegment } from "../selector.ts";
import { Node } from "./base.ts";

/** A set of named fields with a structural tag. */
export class RecordNode extends Node {
  /** Structural tag (e.g. `"div"`, `"speaker"`). */
  tag: string;
  /** Named child nodes keyed by field name. */
  fields: Record<string, Node>;

  constructor(tag: string, fields: Record<string, Node>) {
    super();
    this.tag = tag;
    this.fields = fields;
  }

  override addField(name: string, value: Node): void {
    this.fields[name] = value;
  }

  override deleteField(name: string): void {
    const result: Record<string, Node> = {};
    for (const k in this.fields) {
      if (k !== name) result[k] = this.fields[k]!;
    }
    this.fields = result;
  }

  override renameField(from: string, to: string): void {
    if (from === to || !(from in this.fields)) return;
    const result: Record<string, Node> = {};
    for (const k in this.fields) {
      if (k === from) result[to] = this.fields[k]!;
      else if (k === to) continue;
      else result[k] = this.fields[k]!;
    }
    this.fields = result;
  }

  override updateTag(tag: string): void {
    this.tag = tag;
  }

  protected resolveSegment(
    seg: SelectorSegment,
  ): { key: SelectorSegment; child: Node }[] {
    if (typeof seg === "string" && seg in this.fields) {
      return [{ key: seg, child: this.fields[seg]! }];
    }
    return [];
  }

  replaceChild(key: SelectorSegment, replacement: Node): void {
    if (typeof key === "string") this.fields[key] = replacement;
  }

  wrapChild(key: SelectorSegment, wrapper: (child: Node) => Node): void {
    if (typeof key === "string" && key in this.fields) {
      this.fields[key] = wrapper(this.fields[key]!);
    }
  }

  protected override forEachChild(
    visitor: (path: Selector, node: Node) => void,
    path: SelectorSegment[],
  ): void {
    for (const k in this.fields) {
      path.push(k);
      this.fields[k]!.forEach(visitor, path);
      path.pop();
    }
  }

  clone(): RecordNode {
    const fields: Record<string, Node> = {};
    for (const k in this.fields) fields[k] = this.fields[k]!.clone();
    return new RecordNode(this.tag, fields);
  }

  toPlain(): unknown {
    const out: Record<string, unknown> = { $tag: this.tag };
    for (const k in this.fields) out[k] = this.fields[k]!.toPlain();
    return out;
  }

  equals(other: Node): boolean {
    if (!(other instanceof RecordNode)) return false;
    if (this.tag !== other.tag) return false;
    const aKeys = Object.keys(this.fields);
    if (aKeys.length !== Object.keys(other.fields).length) return false;
    return aKeys.every((k) =>
      k in other.fields && this.fields[k]!.equals(other.fields[k]!)
    );
  }
}
