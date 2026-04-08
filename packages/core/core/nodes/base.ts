import {
  type PrimitiveValue,
  Selector,
  type SelectorSegment,
} from "../selector.ts";
import type { PlainNode } from "./plain.ts";

type ReferenceTransformTarget = {
  basePath: Selector;
  referenceNode: Node;
};

/** Abstract base for all document tree nodes (record, list, primitive, reference). */
export abstract class Node {
  abstract clone(): Node;
  abstract toPlain(): unknown;
  abstract equals(other: Node): boolean;

  /** Returns child nodes matching the given segment, for navigation. */
  protected abstract resolveSegment(
    seg: SelectorSegment,
  ): { key: SelectorSegment; child: Node }[];

  /** Replaces a child at the given key. Used by copy and wrap operations. */
  abstract replaceChild(key: SelectorSegment, replacement: Node): void;

  /** Wraps children at the given key with a wrapper function. */
  abstract wrapChild(
    key: SelectorSegment,
    wrapper: (child: Node) => Node,
  ): void;

  // ── Polymorphic edit operations ───────────────────────────────────
  // Subclasses override the operations they support.
  // The base implementation throws when an operation does not apply.

  setPrimitive(_value: PrimitiveValue): void {
    throw this.createUnsupportedOperationError("setPrimitive");
  }
  addField(_name: string, _value: Node): void {
    throw this.createUnsupportedOperationError("addField");
  }
  deleteField(_name: string): void {
    throw this.createUnsupportedOperationError("deleteField");
  }
  renameField(_from: string, _to: string): void {
    throw this.createUnsupportedOperationError("renameField");
  }
  pushBack(_node: Node): void {
    throw this.createUnsupportedOperationError("pushBack");
  }
  pushFront(_node: Node): void {
    throw this.createUnsupportedOperationError("pushFront");
  }
  popBack(): void {
    throw this.createUnsupportedOperationError("popBack");
  }
  popFront(): void {
    throw this.createUnsupportedOperationError("popFront");
  }
  updateTag(_tag: string): void {
    throw this.createUnsupportedOperationError("updateTag");
  }
  setItems(_items: Node[]): void {
    throw this.createUnsupportedOperationError("setItems");
  }

  /** Called during updateReferences — only ReferenceNode overrides to update its selector. */
  protected applyReferenceTransform(
    _basePath: Selector,
    _transform: (abs: Selector) => Selector,
  ): void {}

  /** Called during reference scans — only ReferenceNode overrides to report its resolved target. */
  protected collectResolvedReferences(
    _basePath: Selector,
    _references: { referencePath: Selector; targetPath: Selector }[],
  ): void {}

  /** Called during structural edits — only ReferenceNode overrides to preserve its original path. */
  protected collectReferenceTransformTargets(
    _basePath: Selector,
    _targets: ReferenceTransformTarget[],
  ): void {}

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
  navigateWithPaths(
    target: Selector,
    depth = 0,
    path: SelectorSegment[] = [],
  ): { path: Selector; node: Node }[] {
    if (depth === target.length) {
      return [{ path: new Selector([...path]), node: this }];
    }
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
  forEach(
    visitor: (path: Selector, node: Node) => void,
    path: SelectorSegment[] = [],
  ): void {
    visitor(new Selector([...path]), this);
    this.forEachChild(visitor, path);
  }

  /** Visits children — overridden by RecordNode and ListNode. */
  protected forEachChild(
    _visitor: (path: Selector, node: Node) => void,
    _path: SelectorSegment[],
  ): void {}

  /** Rewrites all reference nodes in the tree after a structural edit. Mutates in place. */
  updateReferences(
    transform: (abs: Selector) => Selector,
    targets: ReferenceTransformTarget[] = this
      .captureReferenceTransformTargets(),
  ): void {
    for (const { basePath, referenceNode } of targets) {
      referenceNode.applyReferenceTransform(basePath, transform);
    }
  }

  captureReferenceTransformTargets(): ReferenceTransformTarget[] {
    const targets: ReferenceTransformTarget[] = [];
    this.forEach((basePath, current) => {
      current.collectReferenceTransformTargets(basePath, targets);
    });
    return targets;
  }

  findBlockingReference(
    removedPaths: Selector[],
  ):
    | { referencePath: Selector; targetPath: Selector; removedPath: Selector }
    | null {
    const references: { referencePath: Selector; targetPath: Selector }[] = [];
    this.forEach((basePath, current) => {
      current.collectResolvedReferences(basePath, references);
    });
    for (const reference of references) {
      for (const removedPath of removedPaths) {
        if (removedPath.matchPrefix(reference.targetPath).kind === "matched") {
          return { ...reference, removedPath };
        }
      }
    }
    return null;
  }

  collectResolvedReferencePaths(
    basePath: Selector,
  ): { referencePath: Selector; targetPath: Selector }[] {
    const references: { referencePath: Selector; targetPath: Selector }[] = [];
    this.forEach((relativePath, current) => {
      current.collectResolvedReferences(
        new Selector([...basePath.segments, ...relativePath.segments]),
        references,
      );
    });
    return references;
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

  private createUnsupportedOperationError(operation: string): Error {
    return new Error(
      `${this.constructor.name} does not support '${operation}'.`,
    );
  }
}
