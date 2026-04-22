import { createCompositeEdit, Edit, NoOpEdit } from "./base.ts";
import { mapSelector, Selector, type SelectorTransform } from "../selector.ts";
import { ListNode, Node, type PlainNode, RecordNode } from "../nodes.ts";
import {
  type EncodedRemoteEdit,
  registerRemoteEditDecoder,
} from "../remote-edit-codec.ts";
import { UnwrapListEdit, UnwrapRecordEdit } from "./unwrap-edits.ts";
import { rewriteInsertEditRefs } from "./ref-rewriting.ts";

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

/** Updates the structural tag on every matched record or list node. */
export class UpdateTagEdit extends Edit {
  /** @inheritDoc */
  readonly isStructural = true;
  /** @inheritDoc */
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

  override canApply(doc: Node): boolean {
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

  computeInverse(preDoc: Node): Edit {
    const nodes = this.navigateOrThrow(preDoc, this.target);
    const plain = nodes[0]!.toPlain() as Record<string, unknown>;
    const oldTag = plain.$tag;
    if (typeof oldTag !== "string") {
      throw new Error(
        "UpdateTagEdit.computeInverse: node has no $tag.",
      );
    }
    return new UpdateTagEdit(this.target, oldTag);
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

  override describe(): string {
    return `Update tag → '${this.tag}' at ${this.target.format()}`;
  }
}

registerRemoteEditDecoder<EncodedUpdateTagEdit>(
  "UpdateTagEdit",
  (encodedEdit) =>
    new UpdateTagEdit(Selector.parse(encodedEdit.target), encodedEdit.tag),
);

/** Copies nodes from a source selector to a target selector. */
export class CopyEdit extends Edit {
  /** @inheritDoc */
  readonly isStructural = true;
  /** @inheritDoc */
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

  override canApply(doc: Node): boolean {
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
    if (concurrent.skipMirroring) {
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

  computeInverse(preDoc: Node): Edit {
    const targetEntries = preDoc.navigateWithPaths(this.target);
    if (targetEntries.length === 0) {
      throw new Error("CopyEdit.computeInverse: no targets found.");
    }

    const restoreEdits: Edit[] = targetEntries.map((entry) => {
      return new RestoreSnapshotEdit(
        new Selector(entry.path.segments),
        entry.node.clone(),
      );
    });

    if (restoreEdits.length === 1) return restoreEdits[0]!;
    return createCompositeEdit(restoreEdits[0]!, restoreEdits.slice(1));
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

  override describe(): string {
    return `Copy ${this.source.format()} → ${this.target.format()}`;
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

/** Wraps every matched node in a new record with the given field name and tag. */
export class WrapRecordEdit extends Edit {
  /** @inheritDoc */
  readonly isStructural = true;
  /** @inheritDoc */
  readonly kind = "WrapRecord";

  constructor(
    readonly target: Selector,
    readonly field: string,
    readonly tag: string,
  ) {
    super();
  }

  apply(doc: Node): void {
    this.applyWithReferenceUpdate(doc, () => {
      this.navigateOrThrow(doc, this.target);
      doc.wrapAtPath(
        this.target,
        (child) => new RecordNode(this.tag, { [this.field]: child }),
      );
    });
  }

  override canApply(doc: Node): boolean {
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

  computeInverse(_preDoc: Node): Edit {
    return new UnwrapRecordEdit(this.target, this.field);
  }

  equals(other: Edit): boolean {
    return other instanceof WrapRecordEdit &&
      this.target.equals(other.target) &&
      this.field === other.field && this.tag === other.tag;
  }

  withTarget(target: Selector): WrapRecordEdit {
    return new WrapRecordEdit(target, this.field, this.tag);
  }

  override transformLaterConcurrentEdit(concurrent: Edit): Edit {
    const rewritten = concurrent.rewriteInsertedNode(
      this.target,
      (insertedNode, relativeTarget) => {
        if (relativeTarget.length === 0) {
          return new RecordNode(this.tag, { [this.field]: insertedNode });
        }
        // Navigate into the inserted node to wrap a nested child
        const targets = insertedNode.navigate(relativeTarget);
        if (targets.length === 0) return null;
        insertedNode.wrapAtPath(
          relativeTarget,
          (child) => new RecordNode(this.tag, { [this.field]: child }),
        );
        return insertedNode;
      },
    );
    const result = rewritten ?? super.transformLaterConcurrentEdit(concurrent);
    if (result instanceof NoOpEdit) return result;
    return rewriteInsertEditRefs(
      result,
      (abs) => this.transformSelectorOrThrow(abs),
    );
  }

  encodeRemoteEdit(): EncodedWrapRecordEdit {
    return {
      kind: "WrapRecordEdit",
      target: this.target.format(),
      field: this.field,
      tag: this.tag,
    };
  }

  override describe(): string {
    return `Wrap ${this.target.format()} in record '${this.field}' <${this.tag}>`;
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

/** Wraps every matched node in a new single-item list with the given tag. */
export class WrapListEdit extends Edit {
  /** @inheritDoc */
  readonly isStructural = true;
  /** @inheritDoc */
  readonly kind = "WrapList";

  constructor(readonly target: Selector, readonly tag: string) {
    super();
  }

  apply(doc: Node): void {
    this.applyWithReferenceUpdate(
      doc,
      () => {
        this.navigateOrThrow(doc, this.target);
        doc.wrapAtPath(this.target, (child) => new ListNode(this.tag, [child]));
      },
      (abs) => this.transformReferenceSelector(abs),
    );
  }

  override canApply(doc: Node): boolean {
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
    const rewritten = concurrent.rewriteInsertedNode(
      this.target,
      (insertedNode, relativeTarget) =>
        relativeTarget.length !== 0
          ? null
          : new ListNode(this.tag, [insertedNode]),
    );
    const result = rewritten ?? super.transformLaterConcurrentEdit(concurrent);
    if (result instanceof NoOpEdit) return result;
    return rewriteInsertEditRefs(
      result,
      (abs) => this.transformSelectorOrThrow(abs),
    );
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

  computeInverse(_preDoc: Node): Edit {
    return new UnwrapListEdit(this.target);
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

  override describe(): string {
    return `Wrap ${this.target.format()} in list <${this.tag}>`;
  }
}

registerRemoteEditDecoder<EncodedWrapListEdit>(
  "WrapListEdit",
  (encodedEdit) =>
    new WrapListEdit(Selector.parse(encodedEdit.target), encodedEdit.tag),
);

type EncodedRestoreSnapshotEdit = Extract<
  EncodedRemoteEdit,
  { kind: "RestoreSnapshotEdit" }
>;

/**
 * Edit that restores a previously snapshotted node at a target path.
 * Used by `CopyEdit.computeInverse` to undo copy operations.
 */
export class RestoreSnapshotEdit extends Edit {
  /** @inheritDoc */
  readonly isStructural = false;
  /** @inheritDoc */
  readonly kind = "RestoreSnapshot";

  constructor(readonly target: Selector, readonly snapshot: Node) {
    super();
  }

  apply(doc: Node): void {
    this.navigateOrThrow(doc, this.target);
    doc.replaceAtPath(this.target, this.snapshot.clone());
  }

  override canApply(doc: Node): boolean {
    return this.canFindNodes(doc, this.target);
  }

  transformSelector(sel: Selector): SelectorTransform {
    return mapSelector(sel);
  }

  computeInverse(preDoc: Node): Edit {
    const entries = preDoc.navigateWithPaths(this.target);
    if (entries.length === 0) {
      throw new Error(
        "RestoreSnapshotEdit.computeInverse: no targets found.",
      );
    }
    return new RestoreSnapshotEdit(this.target, entries[0]!.node.clone());
  }

  equals(other: Edit): boolean {
    return other instanceof RestoreSnapshotEdit &&
      this.target.equals(other.target) &&
      this.snapshot.equals(other.snapshot);
  }

  withTarget(target: Selector): RestoreSnapshotEdit {
    return new RestoreSnapshotEdit(target, this.snapshot);
  }

  encodeRemoteEdit(): EncodedRestoreSnapshotEdit {
    return {
      kind: "RestoreSnapshotEdit",
      target: this.target.format(),
      snapshot: this.snapshot.toPlain() as PlainNode,
    };
  }

  override describe(): string {
    return `Restore snapshot at ${this.target.format()}`;
  }
}

registerRemoteEditDecoder<EncodedRestoreSnapshotEdit>(
  "RestoreSnapshotEdit",
  (encodedEdit) =>
    new RestoreSnapshotEdit(
      Selector.parse(encodedEdit.target),
      Node.fromPlain(encodedEdit.snapshot),
    ),
);
