import { CopyEdit, type Edit, ListPopBackEdit, ListPopFrontEdit, ListPushBackEdit, ListPushFrontEdit, RecordAddEdit, RecordDeleteEdit, RecordRenameFieldEdit, SetValueEdit, UpdateTagEdit, WrapListEdit, WrapRecordEdit } from './edits.ts';
import type { Event } from './event.ts';
import { EventGraph, type EventSnapshot } from './event-graph.ts';
import { EventId } from './event-id.ts';
import { Node, type PlainNode } from './nodes.ts';
import { type PrimitiveValue, Selector } from './selector.ts';

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

  /** Applies a validated local edit and records the resulting event. */
  private commit(edit: Edit): void {
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
  }

  /** Returns and clears opaque event payloads produced by local edits since the last drain. */
  drain(): unknown[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  /** Returns the current frontier as formatted event id strings. */
  get frontiers(): string[] {
    return this.graph.frontiers.map((eventId) => eventId.format());
  }

  /** Returns opaque event payloads unknown to a peer with the given frontier strings. */
  eventsSince(remoteFrontiers: string[]): unknown[] {
    return this.graph.eventsSince(remoteFrontiers.map((frontier) => EventId.parse(frontier)));
  }

  /** Ingests an opaque event payload produced by another peer. Buffers out-of-order events. */
  applyRemote(event: unknown): void {
    this.graph.ingestEvents([event as Event]);
    this.cachedDoc = null;
  }

  /** Adds a named field to every record matched by `target`. */
  add(target: string, field: string, value: PlainNode): void {
    const path = target === "" ? field : `${target}/${field}`;
    this.commit(new RecordAddEdit(Selector.parse(path), Node.fromPlain(value)));
  }

  /** Deletes a named field from every record matched by `target`. */
  delete(target: string, field: string): void {
    const path = target === "" ? field : `${target}/${field}`;
    this.commit(new RecordDeleteEdit(Selector.parse(path)));
  }

  /** Renames a field on every record matched by `target`. */
  rename(target: string, from: string, to: string): void {
    const path = target === "" ? from : `${target}/${from}`;
    this.commit(new RecordRenameFieldEdit(Selector.parse(path), to));
  }

  /** Replaces every primitive node matched by `target` with `value`. */
  set(target: string, value: PrimitiveValue): void {
    this.commit(new SetValueEdit(Selector.parse(target), value));
  }

  /** Appends `value` to every list matched by `target`. */
  pushBack(target: string, value: PlainNode): void {
    this.commit(new ListPushBackEdit(Selector.parse(target), Node.fromPlain(value)));
  }

  /** Prepends `value` to every list matched by `target`. */
  pushFront(target: string, value: PlainNode): void {
    this.commit(new ListPushFrontEdit(Selector.parse(target), Node.fromPlain(value)));
  }

  /** Removes the last item from every list matched by `target`. */
  popBack(target: string): void {
    this.commit(new ListPopBackEdit(Selector.parse(target)));
  }

  /** Removes the first item from every list matched by `target`. */
  popFront(target: string): void {
    this.commit(new ListPopFrontEdit(Selector.parse(target)));
  }

  /** Updates the structural tag on every matched record or list node. */
  updateTag(target: string, tag: string): void {
    this.commit(new UpdateTagEdit(Selector.parse(target), tag));
  }

  /** Wraps every node matched by `target` in a record with the given field and tag. */
  wrapRecord(target: string, field: string, tag: string): void {
    this.commit(new WrapRecordEdit(Selector.parse(target), field, tag));
  }

  /** Wraps every node matched by `target` in a single-item list with the given tag. */
  wrapList(target: string, tag: string): void {
    this.commit(new WrapListEdit(Selector.parse(target), tag));
  }

  /** Copies nodes from `source` into `target` following the package copy semantics. */
  copy(target: string, source: string): void {
    this.commit(new CopyEdit(Selector.parse(target), Selector.parse(source)));
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
   * Compacts the event graph — materializes current state as the new baseline
   * and discards all events. Call when all peers have synced.
   */
  compact(): void {
    this.graph.compact();
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
}
