import { CopyEdit, Edit, ListPopBackEdit, ListPopFrontEdit, ListPushBackEdit, ListPushFrontEdit, RecordAddEdit, RecordDeleteEdit, RecordRenameFieldEdit, SetValueEdit, UpdateTagEdit, WrapListEdit, WrapRecordEdit } from './edits.ts';
import { Event } from './event.ts';
import { EventGraph } from './event-graph.ts';
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
  readonly peer: string;
  private graph: EventGraph;
  private pendingEvents: Event[] = [];
  private cachedDoc: Node | null = null;

  constructor(peer: string, initial?: PlainNode);
  constructor(peer: string, graph: { initial: Node; events: Record<string, Event>; frontiers: EventId[] });
  constructor(peer: string, arg?: PlainNode | { initial: Node; events: Record<string, Event>; frontiers: EventId[] }) {
    this.peer = peer;
    if (arg && typeof arg === "object" && arg !== null && "events" in arg) {
      const g = arg as { initial: Node; events: Record<string, Event>; frontiers: EventId[] };
      const eventsMap = new Map<string, Event>(Object.entries(g.events));
      this.graph = new EventGraph(g.initial, eventsMap, g.frontiers);
    } else {
      this.graph = new EventGraph(Node.fromPlain((arg as PlainNode) ?? { $tag: "root" }));
    }
  }

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

  /** Returns and clears events produced by local edits since the last drain. */
  drain(): Event[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  /** Returns the current frontier (tip event IDs). */
  get frontiers(): EventId[] {
    return this.graph.frontiers;
  }

  /** Returns all events that the holder of `remoteFrontiers` hasn't seen. */
  eventsSince(remoteFrontiers: EventId[]): Event[] {
    return this.graph.eventsSince(remoteFrontiers);
  }

  /** Ingests an event produced by another peer. Buffers out-of-order events. */
  applyRemote(event: Event): void {
    this.graph.ingestEvents([event]);
    this.cachedDoc = null;
  }

  add(target: string, field: string, value: PlainNode): void {
    const path = target === "" ? field : `${target}/${field}`;
    this.commit(new RecordAddEdit(Selector.parse(path), Node.fromPlain(value)));
  }

  delete(target: string, field: string): void {
    const path = target === "" ? field : `${target}/${field}`;
    this.commit(new RecordDeleteEdit(Selector.parse(path)));
  }

  rename(target: string, from: string, to: string): void {
    const path = target === "" ? from : `${target}/${from}`;
    this.commit(new RecordRenameFieldEdit(Selector.parse(path), to));
  }

  set(target: string, value: PrimitiveValue): void {
    this.commit(new SetValueEdit(Selector.parse(target), value));
  }

  pushBack(target: string, value: PlainNode): void {
    this.commit(new ListPushBackEdit(Selector.parse(target), Node.fromPlain(value)));
  }

  pushFront(target: string, value: PlainNode): void {
    this.commit(new ListPushFrontEdit(Selector.parse(target), Node.fromPlain(value)));
  }

  popBack(target: string): void {
    this.commit(new ListPopBackEdit(Selector.parse(target)));
  }

  popFront(target: string): void {
    this.commit(new ListPopFrontEdit(Selector.parse(target)));
  }

  updateTag(target: string, tag: string): void {
    this.commit(new UpdateTagEdit(Selector.parse(target), tag));
  }

  wrapRecord(target: string, field: string, tag: string): void {
    this.commit(new WrapRecordEdit(Selector.parse(target), field, tag));
  }

  wrapList(target: string, tag: string): void {
    this.commit(new WrapListEdit(Selector.parse(target), tag));
  }

  copy(target: string, source: string): void {
    this.commit(new CopyEdit(Selector.parse(target), Selector.parse(source)));
  }

  materialize(): Node {
    if (this.cachedDoc !== null) return this.cachedDoc;
    const doc = this.rematerialize();
    this.cachedDoc = doc;
    return doc;
  }

  /** Returns conflicts from the last materialization, if any. */
  get conflicts(): Node[] {
    return this.lastConflicts;
  }

  private lastConflicts: Node[] = [];

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

  toPlain(): unknown {
    return this.materialize().toPlain();
  }
}
