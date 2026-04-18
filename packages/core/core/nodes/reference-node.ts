import {
  getSelectorIndexValue,
  isIndexSegment,
  Selector,
  type SelectorSegment,
} from "../selector.ts";
import { Node } from "./base.ts";

/** A pointer to another node via a relative or absolute path. */
export class ReferenceNode extends Node {
  /** The selector path this reference points to. */
  selector: Selector;

  constructor(selector: Selector) {
    super();
    this.selector = selector;
  }

  protected resolveSegment(): { key: SelectorSegment; child: Node }[] {
    return [];
  }
  replaceChild(): void {}
  wrapChild(): void {}

  protected override applyReferenceTransform(
    basePath: Selector,
    transform: (abs: Selector) => Selector,
  ): void {
    const resolved = ReferenceNode.resolveReference(basePath, this.selector);
    if (resolved === null) return;
    const mappedBase = transform(basePath);
    const mappedRef = transform(resolved);
    if (this.selector.isAbsolute) {
      this.selector = new Selector(["/", ...mappedRef.segments]);
    } else {
      this.selector = ReferenceNode.makeRelative(mappedBase, mappedRef);
    }
  }

  protected override collectResolvedReferences(
    basePath: Selector,
    references: { referencePath: Selector; targetPath: Selector }[],
  ): void {
    const resolved = ReferenceNode.resolveReference(basePath, this.selector);
    if (resolved !== null) {
      references.push({ referencePath: basePath, targetPath: resolved });
    }
  }

  protected override collectReferenceTransformTargets(
    basePath: Selector,
    targets: { basePath: Selector; referenceNode: Node }[],
  ): void {
    targets.push({ basePath, referenceNode: this });
  }

  clone(): ReferenceNode {
    return new ReferenceNode(new Selector([...this.selector.segments]));
  }

  toPlain(): { $ref: string } {
    return { $ref: this.selector.format() };
  }

  equals(other: Node): boolean {
    return other instanceof ReferenceNode &&
      this.selector.equals(other.selector);
  }

  /** Resolves a (possibly relative) reference to an absolute path. */
  static resolveReference(
    basePath: Selector,
    refSel: Selector,
  ): Selector | null {
    const combined = refSel.isAbsolute
      ? refSel.segments.slice(1)
      : [...basePath.segments, ...refSel.segments];
    const stack: SelectorSegment[] = [];
    for (const seg of combined) {
      if (seg === "..") {
        if (stack.length === 0) return null;
        stack.pop();
      } else {
        stack.push(seg);
      }
    }
    return new Selector(stack);
  }

  /** Converts an absolute path into a relative selector from `basePath`. */
  static makeRelative(basePath: Selector, absolutePath: Selector): Selector {
    let common = 0;
    while (common < basePath.length && common < absolutePath.length) {
      const baseSeg = basePath.segments[common]!;
      const absSeg = absolutePath.segments[common]!;
      const compatible = baseSeg === absSeg ||
        (baseSeg === "*" && isIndexSegment(absSeg)) ||
        (isIndexSegment(baseSeg) && absSeg === "*") ||
        (
          isIndexSegment(baseSeg) && isIndexSegment(absSeg) &&
          getSelectorIndexValue(baseSeg) === getSelectorIndexValue(absSeg)
        );
      if (!compatible) break;
      common++;
    }
    const ups: SelectorSegment[] = basePath.slice(common).segments.map(() =>
      ".."
    );
    return new Selector([...ups, ...absolutePath.slice(common).segments]);
  }
}
