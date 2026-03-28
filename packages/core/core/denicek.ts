import { ApplyPrimitiveEdit, CopyEdit, type Edit, ListPopBackEdit, ListPopFrontEdit, ListPushBackEdit, ListPushFrontEdit, RecordAddEdit, RecordDeleteEdit, RecordRenameFieldEdit, SetValueEdit, UpdateTagEdit, WrapListEdit, WrapRecordEdit } from './edits.ts';
import type { Event, RemoteEvent } from './event.ts';
import { EventGraph, type EventSnapshot } from './event-graph.ts';
import { EventId } from './event-id.ts';
import { Node, type PlainNode, RecordNode } from './nodes.ts';
import { registerPrimitiveEdit, type PrimitiveEditImplementation } from './primitive-edits.ts';
import { type PrimitiveValue, Selector, validateFieldName } from './selector.ts';

// ── Denicek (collaborative document peer) ───────────────────────────

/**
 * A collaborative document scoped to a single peer.
 *
 * Manages its own event DAG internally: local edits produce events
 * (retrievable via {@link drain}), remote events are ingested via
 * {@link applyRemote}, and the document is reconstructed via {@link materialize}.
 */
export class Denicek {
  /** Stable identifier of the local peer that produces events. */
  readonly peer: string;
  private graph: EventGraph;
  private pendingEvents: Event[] = [];
  private cachedDoc: Node | null = null;

  /** Creates a peer with an optional initial plain document tree. */
  constructor(peer: string, initial?: PlainNode);
  constructor(peer: string, arg?: PlainNode) {
    this.peer = peer;
    this.graph = new EventGraph(Node.fromPlain(arg ?? { $tag: "root" }));
  }

  /** Registers a named primitive edit implementation used by local and remote replay. */
  static registerPrimitiveEdit(name: string, implementation: PrimitiveEditImplementation): void {
    registerPrimitiveEdit(name, implementation);
  }

  /**
   * Applies a validated local edit, records the resulting event, and returns its id.
   *
   * The returned string is the formatted stable event identifier (`${peer}:${seq}`)
   * assigned to the newly created local event. It can later be passed to
   * {@link replayEditFromEventId}, {@link repeatEditFromEventId}, or persisted
   * in application data.
   */
  private commit(edit: Edit): string {
    const doc = this.cachedDoc ?? this.rematerialize();
    try {
      edit.apply(doc);
    } catch (e) {
      this.cachedDoc = null;
      throw e;
    }
    const event = this.graph.createEvent(this.peer, edit);
    this.pendingEvents.push(event);
    this.cachedDoc = doc;
    return event.id.format();
  }

  /** Returns and clears opaque event payloads produced by local edits since the last drain. */
  drain(): RemoteEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  /** Returns the current frontier as formatted event id strings. */
  get frontiers(): string[] {
    return this.graph.frontiers.map((eventId) => eventId.format());
  }

  /** Returns opaque event payloads unknown to a peer with the given frontier strings. */
  eventsSince(remoteFrontiers: string[]): RemoteEvent[] {
    return this.graph.eventsSince(remoteFrontiers.map((frontier) => EventId.parse(frontier)));
  }

  /** Ingests an opaque event payload produced by another peer. Buffers out-of-order events. */
  applyRemote(event: RemoteEvent): void {
    this.graph.ingestEvents([event]);
    this.cachedDoc = null;
  }

  /**
   * Adds a named field to every record matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  add(target: string, field: string, value: PlainNode): string {
    validateFieldName(field);
    this.validateLocalAddTarget(target, field);
    const path = target === "" ? field : `${target}/${field}`;
    return this.commit(new RecordAddEdit(Selector.parse(path), Node.fromPlain(value)));
  }

  /**
   * Deletes a named field from every record matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  delete(target: string, field: string): string {
    validateFieldName(field);
    const path = target === "" ? field : `${target}/${field}`;
    return this.commit(new RecordDeleteEdit(Selector.parse(path)));
  }

  /**
   * Renames a field on every record matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  rename(target: string, from: string, to: string): string {
    validateFieldName(from);
    validateFieldName(to);
    this.validateLocalRenameTarget(target, from, to);
    const path = target === "" ? from : `${target}/${from}`;
    return this.commit(new RecordRenameFieldEdit(Selector.parse(path), to));
  }

  /**
   * Replaces every primitive node matched by `target` with `value`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  set(target: string, value: PrimitiveValue): string {
    return this.commit(new SetValueEdit(Selector.parse(target), value));
  }

  /**
   * Returns the plain nodes matched by `target` in the current materialized document.
   *
   * Missing paths return an empty array, while wildcard selectors naturally return
   * multiple concrete matches. Callers can pick one match or iterate all of them
   * without converting the whole document to plain first.
   */
  get(target: string): PlainNode[] {
    const doc = this.cachedDoc ?? this.rematerialize();
    this.cachedDoc = doc;
    return doc.navigate(Selector.parse(target)).map((node) => node.toPlain() as PlainNode);
  }

  /**
   * Applies a registered named primitive edit to every primitive node matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  applyPrimitiveEdit(target: string, editName: string): string {
    return this.commit(new ApplyPrimitiveEdit(Selector.parse(target), editName));
  }

  /**
   * Replays the edit carried by an existing event onto a different target.
   *
   * This is the explicit retargeting variant: callers choose both the source
   * event id and the new target selector. It reuses the stored edit through
   * `Edit.withTarget(...)`, so callers should use it only when replaying that
   * edit against a different selector is the behavior they want and the new
   * selector is compatible with that edit kind. In practice that means the
   * target must resolve to the same kind of nodes the original edit expects,
   * such as replaying a primitive edit onto primitive nodes or a list edit
   * onto list nodes. Use {@link repeatEditFromEventId} when you want the same
   * event to follow later wraps, renames, or reindexing automatically instead
   * of choosing a new selector yourself.
   * Returns the formatted id (`${peer}:${seq}`) of the newly recorded replay event.
   */
  replayEditFromEventId(eventId: string, target: string): string {
    const edit = this.resolveReplaySourceEdit(eventId);
    return this.commit(edit.withTarget(Selector.parse(target)));
  }

  /**
   * Replays the edit carried by an existing event at its original target.
   *
   * This is the simplest replay path when the caller wants to repeat the
   * recorded edit semantics without choosing a new selector manually. Unlike
   * {@link replayEditFromEventId}, this keeps the source event's own selector
   * intent and retargets it through later structural history before replaying.
   * Returns the formatted id (`${peer}:${seq}`) of the newly recorded replay event.
   */
  repeatEditFromEventId(eventId: string): string {
    return this.commit(this.resolveReplaySourceEdit(eventId));
  }

  /**
   * Appends `value` to every list matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  pushBack(target: string, value: PlainNode): string {
    return this.commit(new ListPushBackEdit(Selector.parse(target), Node.fromPlain(value)));
  }

  /**
   * Prepends `value` to every list matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  pushFront(target: string, value: PlainNode): string {
    return this.commit(new ListPushFrontEdit(Selector.parse(target), Node.fromPlain(value)));
  }

  /**
   * Removes the last item from every list matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  popBack(target: string): string {
    return this.commit(new ListPopBackEdit(Selector.parse(target)));
  }

  /**
   * Removes the first item from every list matched by `target`.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  popFront(target: string): string {
    return this.commit(new ListPopFrontEdit(Selector.parse(target)));
  }

  /**
   * Updates the structural tag on every matched record or list node.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  updateTag(target: string, tag: string): string {
    return this.commit(new UpdateTagEdit(Selector.parse(target), tag));
  }

  /**
   * Wraps every node matched by `target` in a record with the given field and tag.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  wrapRecord(target: string, field: string, tag: string): string {
    validateFieldName(field);
    return this.commit(new WrapRecordEdit(Selector.parse(target), field, tag));
  }

  /**
   * Wraps every node matched by `target` in a single-item list with the given tag.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  wrapList(target: string, tag: string): string {
    return this.commit(new WrapListEdit(Selector.parse(target), tag));
  }

  /**
   * Copies nodes from `source` into `target` following the package copy semantics.
   *
   * Returns the formatted id (`${peer}:${seq}`) of the recorded local event.
   */
  copy(target: string, source: string): string {
    return this.commit(new CopyEdit(Selector.parse(target), Selector.parse(source)));
  }

  /** Materializes the current document into a plain serializable tree. */
  materialize(): PlainNode {
    if (this.cachedDoc !== null) return this.cachedDoc.toPlain() as PlainNode;
    const doc = this.rematerialize();
    this.cachedDoc = doc;
    return doc.toPlain() as PlainNode;
  }

  /** Returns the plain conflict nodes produced during the last materialization. */
  get conflicts(): PlainNode[] {
    return this.lastConflicts.map((conflict) => conflict.toPlain() as PlainNode);
  }

  private lastConflicts: Node[] = [];

  /** Rebuilds the internal mutable document tree and refreshes cached conflicts. */
  private rematerialize(): Node {
    const { doc, conflicts } = this.graph.materialize();
    this.lastConflicts = conflicts;
    return doc;
  }

  /**
   * Compacts the event graph after the caller confirms the current globally
   * acknowledged frontier set. This refuses stale frontiers and buffered events.
   */
  compact(acknowledgedFrontiers: string[]): void {
    this.graph.compact(acknowledgedFrontiers.map((frontier) => EventId.parse(frontier)));
    this.cachedDoc = null;
  }

  /** Returns the current document as a plain serializable tree. */
  toPlain(): PlainNode {
    return this.materialize();
  }

  /** Returns a serializable snapshot of all known events for UI inspection. */
  inspectEvents(): EventSnapshot[] {
    return this.graph.snapshotEvents();
  }

  /** Resolves and validates an event id before replaying its retargeted edit payload. */
  private resolveReplaySourceEdit(eventId: string): Edit {
    return this.graph.resolveReplayEdit(EventId.parse(eventId).format());
  }

  private validateLocalAddTarget(target: string, field: string): void {
    const doc = this.cachedDoc ?? this.rematerialize();
    this.cachedDoc = doc;
    for (const node of doc.navigate(Selector.parse(target))) {
      if (node instanceof RecordNode && field in node.fields) {
        throw new Error(`Cannot add field '${field}' because it already exists at '${target || "/"}'.`);
      }
    }
  }

  private validateLocalRenameTarget(target: string, from: string, to: string): void {
    if (from === to) return;
    const doc = this.cachedDoc ?? this.rematerialize();
    this.cachedDoc = doc;
    for (const node of doc.navigate(Selector.parse(target))) {
      if (node instanceof RecordNode && from in node.fields && to in node.fields) {
        throw new Error(`Cannot rename field '${from}' to '${to}' at '${target || "/"}' because '${to}' already exists.`);
      }
    }
  }
}
