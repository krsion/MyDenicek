import { Selector, type SelectorSegment } from "../selector.ts";
import type { Node } from "../nodes/base.ts";
import { ReferenceNode } from "../nodes/reference-node.ts";
import { RecordNode } from "../nodes/record-node.ts";
import { RecordAddEdit } from "./record-edits.ts";
import { ListPushBackEdit, ListPushFrontEdit } from "./list-edits.ts";
import type { Edit } from "./base.ts";

/**
 * Sentinel index used as the payload base for {@link ListPushBackEdit}.
 *
 * PushBack appends at the **end** of the list, so the real insertion index is
 * always ≥ the current list length.  Using `0` as a placeholder would cause
 * `makeRelative` to find a false common prefix with explicit index-0 refs,
 * producing a shorter (and incorrect) relative path.  A very large sentinel
 * avoids accidental prefix matching with any realistic index while still
 * being recognised as a numeric index segment by the selector machinery.
 */
const PUSH_BACK_SENTINEL_INDEX = Number.MAX_SAFE_INTEGER;

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
 * Rewrites `$ref` selectors inside operation-based formula argument lists
 * (`$tag: "x-formula"`) after a structural edit has been applied to the
 * document.
 *
 * The formula engine resolves `$ref` paths in `args` relative to the
 * **formula node's path**, not the `$ref` node's tree position. The regular
 * `updateReferences()` mechanism resolves from the tree position, which for
 * a ref at `formulaPath/args/i` produces an incorrect absolute path.  This
 * function corrects the mismatch by re-resolving from the formula's path.
 *
 * **Must be called after `updateReferences()`** — the regular pass is a
 * no-op for these refs (the tree-position-based resolution doesn't match
 * the structural edit's target), so this second pass is safe.
 */
export function rewriteFormulaArgReferences(
  doc: Node,
  transform: (abs: Selector) => Selector,
): void {
  doc.forEach((path, node) => {
    if (!(node instanceof RecordNode)) return;
    if (node.tag !== "x-formula") return;

    const argsNode = node.fields["args"];
    if (argsNode === undefined) return;

    // Walk all descendants of the args subtree, rewriting any
    // ReferenceNode using the formula's path as resolution base.
    const formulaPath = path;
    argsNode.forEach((_relativePath, descendant) => {
      if (!(descendant instanceof ReferenceNode)) return;

      const resolved = ReferenceNode.resolveReference(
        formulaPath,
        descendant.selector,
      );
      if (resolved === null) return;

      const mappedBase = transform(formulaPath);
      const mappedRef = transform(resolved);

      if (descendant.selector.isAbsolute) {
        descendant.selector = new Selector(["/", ...mappedRef.segments]);
      } else {
        descendant.selector = ReferenceNode.makeRelative(
          mappedBase,
          mappedRef,
        );
      }
    });
  });
}

/**
 * If `edit` carries an inserted payload ({@link RecordAddEdit},
 * {@link ListPushBackEdit}, or {@link ListPushFrontEdit}), returns a copy of
 * the edit whose payload has all {@link ReferenceNode} selectors rewritten
 * through `transformSelector`. Other edit types are returned unchanged.
 */
export function rewriteInsertEditRefs(
  edit: Edit,
  transformSelector: (sel: Selector) => Selector,
): Edit {
  if (edit instanceof RecordAddEdit) {
    const node = edit.node.clone();
    rewriteRefsInPayload(node, edit.target, transformSelector);
    return new RecordAddEdit(edit.target, node);
  }
  if (edit instanceof ListPushBackEdit) {
    const node = edit.node.clone();
    rewriteRefsInPayload(
      node,
      new Selector([...edit.target.segments, PUSH_BACK_SENTINEL_INDEX]),
      transformSelector,
    );
    return new ListPushBackEdit(edit.target, node);
  }
  if (edit instanceof ListPushFrontEdit) {
    const node = edit.node.clone();
    rewriteRefsInPayload(
      node,
      new Selector([...edit.target.segments, 0]),
      transformSelector,
    );
    return new ListPushFrontEdit(edit.target, node);
  }
  return edit;
}
