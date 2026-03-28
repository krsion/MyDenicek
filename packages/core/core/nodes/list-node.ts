import type { Selector, SelectorSegment } from "../selector.ts";
import { Node } from "./base.ts";

export class ListNode extends Node {
  tag: string;
  items: Node[];

  constructor(tag: string, items: Node[]) {
    super();
    this.tag = tag;
    this.items = items;
  }

  override pushBack(node: Node): boolean {
    this.items.push(node);
    return true;
  }

  override pushFront(node: Node): boolean {
    this.items.unshift(node);
    return true;
  }

  override popBack(): boolean {
    if (this.items.length === 0) {
      throw new Error("list-pop-back: list is empty");
    }
    this.items.pop();
    return true;
  }

  override popFront(): boolean {
    if (this.items.length === 0) {
      throw new Error("list-pop-front: list is empty");
    }
    this.items.shift();
    return true;
  }

  override updateTag(tag: string): boolean {
    this.tag = tag;
    return true;
  }

  override setItems(items: Node[]): boolean {
    this.items = items;
    return true;
  }

  protected resolveSegment(
    seg: SelectorSegment,
  ): { key: SelectorSegment; child: Node }[] {
    if (seg === "*") {
      return this.items.map((child, i) => ({ key: i, child }));
    }
    if (typeof seg === "number" && seg >= 0 && seg < this.items.length) {
      return [{ key: seg, child: this.items[seg]! }];
    }
    return [];
  }

  replaceChild(key: SelectorSegment, replacement: Node): void {
    if (typeof key === "number" && key >= 0 && key < this.items.length) {
      this.items[key] = replacement;
    }
  }

  wrapChild(key: SelectorSegment, wrapper: (child: Node) => Node): void {
    if (key === "*") {
      for (let i = 0; i < this.items.length; i++) {
        this.items[i] = wrapper(this.items[i]!);
      }
    } else if (typeof key === "number" && key >= 0 && key < this.items.length) {
      this.items[key] = wrapper(this.items[key]!);
    }
  }

  protected override forEachChild(
    visitor: (path: Selector, node: Node) => void,
    path: SelectorSegment[],
  ): void {
    for (let i = 0; i < this.items.length; i++) {
      path.push(i);
      this.items[i]!.forEach(visitor, path);
      path.pop();
    }
  }

  clone(): ListNode {
    return new ListNode(this.tag, this.items.map((item) => item.clone()));
  }

  toPlain(): unknown {
    return { $tag: this.tag, $items: this.items.map((item) => item.toPlain()) };
  }

  equals(other: Node): boolean {
    if (!(other instanceof ListNode)) return false;
    if (this.tag !== other.tag || this.items.length !== other.items.length) {
      return false;
    }
    return this.items.every((item, i) => item.equals(other.items[i]!));
  }
}
