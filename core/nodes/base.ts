import { type PrimitiveValue, type SelectorSegment, Selector } from '../selector.ts';
import type { PlainNode } from './plain.ts';

export abstract class Node {
  abstract clone(): Node;
  abstract toPlain(): unknown;
  abstract equals(other: Node): boolean;

  /** Returns child nodes matching the given segment, for navigation. */
  protected abstract resolveSegment(seg: SelectorSegment): { key: SelectorSegment; child: Node }[];

  /** Replaces a child at the given key. Used by copy and wrap operations. */
  abstract replaceChild(key: SelectorSegment, replacement: Node): void;

  /** Wraps children at the given key with a wrapper function. */
  abstract wrapChild(key: SelectorSegment, wrapper: (child: Node) => Node): void;

  // ── Polymorphic edit operations ───────────────────────────────────
  // Subclasses override the methods they support and return true.
  // Default: return false (not applicable to this node type).

  setPrimitive(_value: PrimitiveValue): boolean { return false; }
  addField(_name: string, _value: Node): boolean { return false; }
  deleteField(_name: string): boolean { return false; }
  renameField(_from: string, _to: string): boolean { return false; }
  pushBack(_node: Node): boolean { return false; }
  pushFront(_node: Node): boolean { return false; }
  popBack(): boolean { return false; }
  popFront(): boolean { return false; }
  updateTag(_tag: string): boolean { return false; }
  setItems(_items: Node[]): boolean { return false; }

  /** Called during updateReferences — only ReferenceNode overrides to update its selector. */
  protected applyReferenceTransform(_basePath: Selector, _transform: (abs: Selector) => Selector): void {}

  /** Follows selector segments to collect matched nodes. */
  navigate(target: Selector, depth = 0): Node[] {
    if (depth === target.length) return [this];
    const entries = this.resolveSegment(target.segments[depth]!);
    const result: Node[] = [];
    for (const { child } of entries) {
      result.push(...child.navigate(target, depth + 1));
    }
    return result;
  }

  /** Follows selector segments to collect matched nodes with their concrete paths. */
  navigateWithPaths(target: Selector, depth = 0, path: SelectorSegment[] = []): { path: Selector; node: Node }[] {
    if (depth === target.length) return [{ path: new Selector([...path]), node: this }];
    const entries = this.resolveSegment(target.segments[depth]!);
    const result: { path: Selector; node: Node }[] = [];
    for (const { key, child } of entries) {
      path.push(key);
      result.push(...child.navigateWithPaths(target, depth + 1, path));
      path.pop();
    }
    return result;
  }

  /** Walks every node in the tree, calling `visitor` with its path. */
  forEach(visitor: (path: Selector, node: Node) => void, path: SelectorSegment[] = []): void {
    visitor(new Selector([...path]), this);
    this.forEachChild(visitor, path);
  }

  /** Visits children — overridden by RecordNode and ListNode. */
  protected forEachChild(_visitor: (path: Selector, node: Node) => void, _path: SelectorSegment[]): void {}

  /** Rewrites all reference nodes in the tree after a structural edit. Mutates in place. */
  updateReferences(transform: (abs: Selector) => Selector): void {
    this.forEach((basePath, current) => {
      current.applyReferenceTransform(basePath, transform);
    });
  }

  /** Replaces the node at a concrete path within this tree. */
  replaceAtPath(path: Selector, replacement: Node): void {
    if (path.length === 0) return;
    for (const parent of this.navigate(path.parent)) {
      parent.replaceChild(path.lastSegment, replacement);
    }
  }

  /** Wraps nodes at the given selector path with a wrapper function. */
  wrapAtPath(target: Selector, wrapper: (child: Node) => Node): void {
    if (target.length === 0) throw new Error("Cannot wrap the root node.");
    if (target.length === 1) {
      this.wrapChild(target.lastSegment, wrapper);
      return;
    }
    for (const parent of this.navigate(target.parent)) {
      parent.wrapChild(target.lastSegment, wrapper);
    }
  }

  static fromPlain(_plain: PlainNode): Node {
    throw new Error("Node.fromPlain is not initialized.");
  }
}
