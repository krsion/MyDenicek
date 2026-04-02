import {
  CompositeEdit,
  createCompositeEdit,
  Edit,
  NoOpEdit,
  NoOpOnRemovedTargetEdit,
} from "./base.ts";
import { ListInsertEdit } from "./list-edits.ts";
import { mapSelector, Selector, type SelectorTransform } from "../selector.ts";
import { ListNode, type Node, RecordNode } from "../nodes.ts";
import {
  type EncodedRemoteEdit,
  registerRemoteEditDecoder,
} from "../remote-edit-codec.ts";

type EncodedUpdateTagEdit = Extract<
  EncodedRemoteEdit,
  { kind: "UpdateTagEdit" }
>;
type EncodedCopyEdit = Extract<EncodedRemoteEdit, { kind: "CopyEdit" }>;
type EncodedWrapRecordEdit = Extract<
  EncodedRemoteEdit,
  { kind: "WrapRecordEdit" }
>;
type EncodedWrapListEdit = Extract<EncodedRemoteEdit, { kind: "WrapListEdit" }>;

export class UpdateTagEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;
  readonly kind = "UpdateTag";

  constructor(readonly target: Selector, readonly tag: string) {
    super();
  }

  apply(doc: Node): void {
    const nodes = this.navigateOrThrow(doc, this.target);
    for (const n of nodes) {
      n.updateTag(this.tag);
    }
  }

  canApply(doc: Node): boolean {
    return this.canFindNodesOfType(
      doc,
      this.target,
      (node) => node instanceof RecordNode || node instanceof ListNode,
    );
  }

  transformSelector(sel: Selector): SelectorTransform {
    return mapSelector(sel);
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    if (!(concurrent instanceof ListInsertEdit)) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    const rewritten = concurrent.rewriteInsertedNode(
      this.target,
      (transformedNode, relativeTarget) => {
        if (relativeTarget.length !== 0) return null;
        transformedNode.updateTag(this.tag);
        return transformedNode;
      },
    );
    return rewritten ?? super.transformLaterConcurrentEdit(concurrent);
  }

  equals(other: Edit): boolean {
    return other instanceof UpdateTagEdit && this.target.equals(other.target) &&
      this.tag === other.tag;
  }

  withTarget(target: Selector): UpdateTagEdit {
    return new UpdateTagEdit(target, this.tag);
  }
  encodeRemoteEdit(): EncodedUpdateTagEdit {
    return {
      kind: "UpdateTagEdit",
      target: this.target.format(),
      tag: this.tag,
    };
  }
}

registerRemoteEditDecoder<EncodedUpdateTagEdit>(
  "UpdateTagEdit",
  (encodedEdit) =>
    new UpdateTagEdit(Selector.parse(encodedEdit.target), encodedEdit.tag),
);

export class CopyEdit extends Edit {
  readonly isStructural = true;
  readonly kind = "Copy";

  constructor(readonly target: Selector, readonly source: Selector) {
    super();
  }

  override get selectors(): Selector[] {
    return [this.target, this.source];
  }

  apply(doc: Node): void {
    const sourceNodes = doc.navigate(this.source);
    const targetEntries = doc.navigateWithPaths(this.target);
    if (sourceNodes.length === 0) {
      throw new Error(
        `copy: no nodes match source selector '${this.source.format()}'`,
      );
    }
    if (targetEntries.length === 0) {
      throw new Error(
        `copy: no nodes match target selector '${this.target.format()}'`,
      );
    }

    if (sourceNodes.length === targetEntries.length) {
      for (let i = 0; i < sourceNodes.length; i++) {
        const replacementNode = sourceNodes[i]!.clone();
        const entry = targetEntries[i]!;
        doc.replaceAtPath(entry.path, replacementNode);
      }
    } else if (
      targetEntries.length === 1 &&
      targetEntries[0]!.node instanceof ListNode
    ) {
      targetEntries[0]!.node.setItems(sourceNodes.map((n) => n.clone()));
    } else {
      throw new Error(
        `copy: source/target arity mismatch (source=${sourceNodes.length}, target=${targetEntries.length}). Need equal counts or one list target.`,
      );
    }
  }

  canApply(doc: Node): boolean {
    const sourceNodes = doc.navigate(this.source);
    const targetEntries = doc.navigateWithPaths(this.target);
    return sourceNodes.length > 0 &&
      targetEntries.length > 0 &&
      (sourceNodes.length === targetEntries.length ||
        (targetEntries.length === 1 &&
          targetEntries[0]!.node instanceof ListNode));
  }

  transformSelector(sel: Selector): SelectorTransform {
    return mapSelector(sel);
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    if (concurrent instanceof CompositeEdit) {
      return concurrent.transform(this);
    }
    const transformed = concurrent.transform(this);
    if (transformed instanceof NoOpEdit) {
      return transformed;
    }
    if (this.source.equals(this.target)) {
      return transformed;
    }
    const mirroredTarget = this.computeMirrorTargetSelector(transformed.target);
    if (mirroredTarget === null || mirroredTarget.equals(transformed.target)) {
      return transformed;
    }
    return createCompositeEdit(transformed, [
      transformed.withTarget(mirroredTarget),
    ]);
  }

  override transform(prior: Edit): Edit {
    const t = prior.transformSelector(this.target);
    const s = prior.transformSelector(this.source);
    if (t.kind === "removed") {
      return new NoOpEdit(
        this.target,
        `${prior.constructor.name} removed copy target '${this.target.format()}'.`,
      );
    }
    if (s.kind === "removed") {
      return new NoOpEdit(
        this.target,
        `${prior.constructor.name} removed copy source '${this.source.format()}'.`,
      );
    }
    return new CopyEdit(t.selector, s.selector);
  }

  /**
   * Maps a concrete selector inside the copy source onto the corresponding
   * managed-copy target path.
   *
   * Supported shapes:
   * - direct subtree copies with no wildcards (for example `a/source` to `a/target`)
   * - one-to-one wildcard copies (for example `rows/<index>/name` to `rows/<index>/email`)
   * - copying a wildcard source collection into a single list target
   *   (for example `scratch/<index>` to `items`), where the captured source index becomes the list
   *   item index under the target list.
   *
   * More ambiguous source/target shape pairs currently opt out of mirroring and
   * return `null` instead of guessing a selector that could diverge.
   */
  private computeMirrorTargetSelector(sel: Selector): Selector | null {
    const matchedSource = this.source.matchPrefix(sel);
    if (matchedSource.kind === "no-match") {
      // Only selectors inside the copied source subtree should be mirrored onto
      // the new copy target.
      return null;
    }
    const wildcardCaptures = this.extractWildcardCaptures(
      matchedSource.specificPrefix,
    );
    const targetWildcardCount = this.computeWildcardSegmentCount(this.target);
    // Supported mirroring patterns:
    // 1. Source and target expose the same number of wildcard slots, so captures
    //    substitute one-to-one into the target selector.
    // 2. A single wildcard-selected source collection is copied into one list
    //    target, so the captured source index becomes the copied list item index.
    if (
      !(
        wildcardCaptures.length === targetWildcardCount ||
        (targetWildcardCount === 0 && wildcardCaptures.length === 1)
      )
    ) {
      return null;
    }
    let captureIndex = 0;
    const mirroredPrefix = this.target.segments.map((segment) =>
      segment === "*" ? wildcardCaptures[captureIndex++]! : segment
    );
    return new Selector([
      ...mirroredPrefix,
      ...wildcardCaptures.slice(captureIndex),
      ...matchedSource.rest.segments,
    ]);
  }

  private extractWildcardCaptures(
    specificSourcePrefix: Selector,
  ): Selector["segments"] {
    const captures: Selector["segments"] = [];
    for (
      let segmentIndex = 0;
      segmentIndex < this.source.length;
      segmentIndex++
    ) {
      if (this.source.segments[segmentIndex] === "*") {
        captures.push(specificSourcePrefix.segments[segmentIndex]!);
      }
    }
    return captures;
  }

  private computeWildcardSegmentCount(selector: Selector): number {
    return selector.segments.filter((segment) => segment === "*").length;
  }

  equals(other: Edit): boolean {
    return other instanceof CopyEdit && this.target.equals(other.target) &&
      this.source.equals(other.source);
  }

  withTarget(target: Selector): CopyEdit {
    return new CopyEdit(target, this.source);
  }
  encodeRemoteEdit(): EncodedCopyEdit {
    return {
      kind: "CopyEdit",
      target: this.target.format(),
      source: this.source.format(),
    };
  }
}

registerRemoteEditDecoder<EncodedCopyEdit>(
  "CopyEdit",
  (encodedEdit) =>
    new CopyEdit(
      Selector.parse(encodedEdit.target),
      Selector.parse(encodedEdit.source),
    ),
);

export class WrapRecordEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;
  readonly kind = "WrapRecord";

  constructor(
    readonly target: Selector,
    readonly field: string,
    readonly tag: string,
  ) {
    super();
  }

  apply(doc: Node): void {
    const referenceTargets = doc.captureReferenceTransformTargets();
    this.navigateOrThrow(doc, this.target);
    doc.wrapAtPath(
      this.target,
      (child) => new RecordNode(this.tag, { [this.field]: child }),
    );
    doc.updateReferences(
      (abs) => this.transformSelectorOrThrow(abs),
      referenceTargets,
    );
  }

  canApply(doc: Node): boolean {
    return this.target.length > 0 && this.canFindNodes(doc, this.target);
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    return m.kind === "no-match" ? mapSelector(sel) : mapSelector(
      new Selector([
        ...m.specificPrefix.segments,
        this.field,
        ...m.rest.segments,
      ]),
    );
  }

  override transform(prior: Edit): Edit {
    const transformedTarget = prior.transformSelector(this.target);
    if (transformedTarget.kind === "removed") {
      return this.handleRemovedTarget(prior);
    }
    return new WrapRecordEdit(transformedTarget.selector, this.field, this.tag);
  }

  equals(other: Edit): boolean {
    return other instanceof WrapRecordEdit &&
      this.target.equals(other.target) &&
      this.field === other.field && this.tag === other.tag;
  }

  withTarget(target: Selector): WrapRecordEdit {
    return new WrapRecordEdit(target, this.field, this.tag);
  }
  encodeRemoteEdit(): EncodedWrapRecordEdit {
    return {
      kind: "WrapRecordEdit",
      target: this.target.format(),
      field: this.field,
      tag: this.tag,
    };
  }
}

registerRemoteEditDecoder<EncodedWrapRecordEdit>(
  "WrapRecordEdit",
  (encodedEdit) =>
    new WrapRecordEdit(
      Selector.parse(encodedEdit.target),
      encodedEdit.field,
      encodedEdit.tag,
    ),
);

export class WrapListEdit extends NoOpOnRemovedTargetEdit {
  readonly isStructural = true;
  readonly kind = "WrapList";

  constructor(readonly target: Selector, readonly tag: string) {
    super();
  }

  apply(doc: Node): void {
    const referenceTargets = doc.captureReferenceTransformTargets();
    this.navigateOrThrow(doc, this.target);
    doc.wrapAtPath(this.target, (child) => new ListNode(this.tag, [child]));
    doc.updateReferences(
      (abs) => this.transformReferenceSelector(abs),
      referenceTargets,
    );
  }

  canApply(doc: Node): boolean {
    return this.target.length > 0 && this.canFindNodes(doc, this.target);
  }

  transformSelector(sel: Selector): SelectorTransform {
    const m = this.target.matchPrefix(sel);
    // Wrapping a wildcard-selected child (for example `items/*`) produces a
    // concrete single-item list at index 0 for each matched child, while
    // wrapping a concrete target keeps wildcard semantics for future lookups.
    const insertedSegment = this.target.lastSegment === "*" ? 0 : "*";
    return m.kind === "no-match" ? mapSelector(sel) : mapSelector(
      new Selector([
        ...m.specificPrefix.segments,
        insertedSegment,
        ...m.rest.segments,
      ]),
    );
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    if (!(concurrent instanceof ListInsertEdit)) {
      return super.transformLaterConcurrentEdit(concurrent);
    }
    const rewritten = concurrent.rewriteInsertedNode(
      this.target,
      (insertedNode, relativeTarget) =>
        relativeTarget.length !== 0
          ? null
          : new ListNode(this.tag, [insertedNode]),
    );
    return rewritten ?? super.transformLaterConcurrentEdit(concurrent);
  }

  private transformReferenceSelector(sel: Selector): Selector {
    const m = this.target.matchPrefix(sel);
    if (m.kind === "no-match") return sel;
    return new Selector([
      ...m.specificPrefix.segments,
      "*",
      ...m.rest.segments,
    ]);
  }

  equals(other: Edit): boolean {
    return other instanceof WrapListEdit && this.target.equals(other.target) &&
      this.tag === other.tag;
  }

  withTarget(target: Selector): WrapListEdit {
    return new WrapListEdit(target, this.tag);
  }
  encodeRemoteEdit(): EncodedWrapListEdit {
    return {
      kind: "WrapListEdit",
      target: this.target.format(),
      tag: this.tag,
    };
  }
}

registerRemoteEditDecoder<EncodedWrapListEdit>(
  "WrapListEdit",
  (encodedEdit) =>
    new WrapListEdit(Selector.parse(encodedEdit.target), encodedEdit.tag),
);
