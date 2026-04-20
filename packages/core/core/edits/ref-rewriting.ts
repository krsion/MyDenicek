import { Selector, type SelectorSegment } from "../selector.ts";
import type { Node } from "../nodes/base.ts";
import { ReferenceNode } from "../nodes/reference-node.ts";
import type { Edit } from "./base.ts";

/**
 * Walks a payload node tree and rewrites every {@link ReferenceNode}'s selector
 * through a structural-edit transform.
 *
 * For each reference found the helper:
 * 1. Absolutises the (possibly relative) selector from `payloadBasePath`
 * 2. Transforms both the base and target through the structural edit
 * 3. Re-relativises the result back to the (transformed) base
 *
 * Mutates `ReferenceNode.selector` in place — callers should pass a clone.
 */
export function rewriteRefsInPayload(
  payloadNode: Node,
  payloadBasePath: Selector,
  transform: (abs: Selector) => Selector,
): void {
  payloadNode.forEach((relativePath, current) => {
    if (!(current instanceof ReferenceNode)) return;
    const basePath = new Selector([
      ...payloadBasePath.segments,
      ...relativePath.segments,
    ]);

    if (current.selector.isAbsolute) {
      const resolved = ReferenceNode.resolveReference(
        basePath,
        current.selector,
      );
      if (resolved === null) return;
      const mappedRef = transform(resolved);
      current.selector = new Selector(["/", ...mappedRef.segments]);
      return;
    }

    // For relative refs, use an anchor-based approach that is independent
    // of the placeholder list index in `payloadBasePath`.
    //
    // 1. Count leading ".." segments to find how far up the ref goes.
    // 2. Compute the anchor (base minus upCount levels) and the meaningful
    //    suffix (the rest of the ref after the ".."s).
    // 3. Absolutize, transform, then strip the transformed anchor prefix
    //    and reattach the ".." segments.
    const segments = current.selector.segments;
    let upCount = 0;
    while (upCount < segments.length && segments[upCount] === "..") {
      upCount++;
    }
    const meaningful = segments.slice(upCount);
    const anchorLength = basePath.length - upCount;
    if (anchorLength < 0) return; // ref escapes above root — leave unchanged
    const anchor = basePath.slice(0, anchorLength);
    const absoluteTarget = new Selector([
      ...anchor.segments,
      ...meaningful,
    ]);
    const mappedTarget = transform(absoluteTarget);
    const mappedAnchor = transform(anchor);

    const match = mappedAnchor.matchPrefix(mappedTarget);
    if (match.kind === "no-match") return; // anchor diverged — leave unchanged

    const ups: SelectorSegment[] = Array(upCount).fill(
      "..",
    ) as SelectorSegment[];
    current.selector = new Selector([...ups, ...match.rest.segments]);
  });
}

/**
 * If `edit` carries an inserted payload ({@link Edit.mapInsertedPayload}),
 * returns a copy of the edit whose payload has all {@link ReferenceNode}
 * selectors rewritten through `transformSelector`. Other edit types are
 * returned unchanged.
 */
export function rewriteInsertEditRefs(
  edit: Edit,
  transformSelector: (sel: Selector) => Selector,
): Edit {
  return edit.mapInsertedPayload((node, basePath) => {
    const cloned = node.clone();
    rewriteRefsInPayload(cloned, basePath, transformSelector);
    return cloned;
  });
}
