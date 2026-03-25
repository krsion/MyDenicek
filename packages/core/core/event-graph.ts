import { BinaryHeap } from '@std/data-structures/binary-heap';
import { type Edit, NoOpEdit } from './edits.ts';
import { Event } from './event.ts';
import { EventId } from './event-id.ts';
import type { Node } from './nodes.ts';
import { VectorClock } from './vector-clock.ts';

// ── EventGraph ──────────────────────────────────────────────────────

export type MaterializeResult = { doc: Node; conflicts: Node[] };

/** A serializable snapshot of a single event for UI inspection. */
export type EventSnapshot = {
  id: string;
  peer: string;
  seq: number;
  parents: string[];
  editKind: string;
  target: string;
};
type PendingEventsByKey = Record<string, Event>;
type MissingParentCountsByKey = Record<string, number>;
type ChildKeysByMissingParent = Record<string, string[]>;
type PendingDependencyIndex = {
  missingParentCountsByKey: MissingParentCountsByKey;
  childKeysByMissingParent: ChildKeysByMissingParent;
  readyKeys: string[];
};

export class EventGraph {
  private initial: Node;
  private events: Map<string, Event>;
  private _frontierIds: EventId[];
  private cachedOrder: string[] | null = null;
  private bufferedEvents: Event[] = [];

  constructor(initial: Node, events?: Map<string, Event>, frontiers?: EventId[]) {
    this.initial = initial;
    this.events = events ?? new Map();
    this._frontierIds = frontiers ?? [];
  }

  get frontiers(): EventId[] {
    return [...this._frontierIds];
  }

  hasEvent(key: string): boolean {
    return this.events.has(key);
  }

  getEvent(key: string): Event | undefined {
    return this.events.get(key);
  }

  insertEvent(event: Event): void {
    event.validate(this.events);
    this.events.set(event.id.format(), event);
    const parentKeys = new Set(event.parents.map((p) => p.format()));
    this._frontierIds = [
      ...this._frontierIds.filter((h) => !parentKeys.has(h.format())),
      event.id,
    ].sort((a, b) => a.compareTo(b));
    this.cachedOrder = null;
  }

  /** Creates a new event from a local edit, inserts it, and returns it. */
  createEvent(peer: string, edit: Edit): Event {
    const parents = [...this._frontierIds];
    const clock = new VectorClock();
    for (const p of parents) {
      const parentEvent = this.events.get(p.format());
      if (parentEvent) clock.merge(parentEvent.clock);
    }
    const seq = clock.tick(peer);
    const event = new Event(new EventId(peer, seq), parents, edit, clock);
    this.insertEvent(event);
    return event;
  }

  private collectPendingEvents(incomingEvents: Event[]): PendingEventsByKey {
    const pendingByKey: PendingEventsByKey = {};
    for (const event of [...this.bufferedEvents, ...incomingEvents]) {
      const key = event.id.format();
      const existing = this.events.get(key);
      if (existing != null) {
        if (!existing.equals(event)) {
          throw new Error(`Conflicting payload for event '${key}'.`);
        }
        continue;
      }
      const pendingEvent = pendingByKey[key];
      if (pendingEvent !== undefined && !pendingEvent.equals(event)) {
        throw new Error(`Conflicting payload for event '${key}'.`);
      }
      pendingByKey[key] = event;
    }
    return pendingByKey;
  }

  private computePendingDependencyIndex(pendingByKey: PendingEventsByKey): PendingDependencyIndex {
    const missingParentCountsByKey: MissingParentCountsByKey = {};
    const childKeysByMissingParent: ChildKeysByMissingParent = {};
    const readyKeys: string[] = [];

    for (const [key, event] of Object.entries(pendingByKey)) {
      let missingParentCount = 0;
      for (const p of event.parents) {
        const pk = p.format();
        // Parents remain missing until they have actually been inserted into
        // `this.events`; merely being present in `pendingByKey` is not enough
        // to make a child causally ready.
        if (!this.events.has(pk)) {
          missingParentCount++;
          (childKeysByMissingParent[pk] ??= []).push(key);
        }
      }
      missingParentCountsByKey[key] = missingParentCount;
      if (missingParentCount === 0) readyKeys.push(key);
    }

    return { missingParentCountsByKey, childKeysByMissingParent, readyKeys };
  }

  private drainReadyEvents(
    pendingByKey: PendingEventsByKey,
    missingParentCountsByKey: MissingParentCountsByKey,
    childKeysByMissingParent: ChildKeysByMissingParent,
    readyKeys: string[],
  ): Event[] {
    while (readyKeys.length > 0) {
      const key = readyKeys.pop()!;
      const event = pendingByKey[key]!;
      this.insertEvent(event);
      delete pendingByKey[key];
      const childKeys = childKeysByMissingParent[key];
      if (childKeys != null) {
        for (const childKey of childKeys) {
          const newMissingParentCount = missingParentCountsByKey[childKey]! - 1;
          missingParentCountsByKey[childKey] = newMissingParentCount;
          if (newMissingParentCount === 0 && pendingByKey[childKey] !== undefined) {
            readyKeys.push(childKey);
          }
        }
      }
    }

    return Object.values(pendingByKey);
  }

  /** Ingests remote events, buffering out-of-order ones. Returns the current buffer. */
  ingestEvents(incomingEvents: Event[]): Event[] {
    // Stage 1: merge newly received events with the existing buffer, deduplicate
    // by ID, and reject same-ID/different-payload corruption.
    const pendingByKey = this.collectPendingEvents(incomingEvents);
    if (Object.keys(pendingByKey).length === 0) {
      this.bufferedEvents = [];
      return [];
    }

    // Stage 2: for each still-pending event, count how many parents are missing
    // and identify which pending events are already causally ready.
    const { missingParentCountsByKey, childKeysByMissingParent, readyKeys } =
      this.computePendingDependencyIndex(pendingByKey);

    // Stage 4: flush causally ready events, decrementing their dependents until
    // no more buffered events can be inserted in this pass.
    // Anything left still depends on parents we have not seen yet.
    this.bufferedEvents = this.drainReadyEvents(
      pendingByKey,
      missingParentCountsByKey,
      childKeysByMissingParent,
      readyKeys,
    );
    return [...this.bufferedEvents];
  }

  /** Returns events not known by a peer with the given frontiers. */
  eventsSince(remoteFrontiers: EventId[]): Event[] {
    const remoteKnown = this.filterCausalPast(remoteFrontiers, false);
    return [...this.events.values()].filter(
      (ev) => !remoteKnown.has(ev.id.format()),
    );
  }

  filterCausalPast(frontier: EventId[], strict = true): Set<string> {
    const causalPast = new Set<string>();
    const stack = frontier.map((id) => id.format());
    while (stack.length > 0) {
      const key = stack.pop() as string;
      if (causalPast.has(key)) continue;
      const ev = this.events.get(key);
      if (ev == null) {
        if (strict) throw new Error(`Unknown version '${key}'.`);
        continue;
      }
      causalPast.add(key);
      for (const p of ev.parents) stack.push(p.format());
    }
    return causalPast;
  }

  computeTopologicalOrder(frontier?: EventId[]): string[] {
    const front = frontier ?? this._frontierIds;
    const causalPast = this.filterCausalPast(front);
    const indegree: Record<string, number> = {};
    const children: Record<string, string[]> = {};
    for (const key of causalPast) {
      indegree[key] = 0;
      children[key] = [];
    }
    for (const key of causalPast) {
      const ev = this.events.get(key) as Event;
      for (const p of ev.parents) {
        const pk = p.format();
        if (!causalPast.has(pk)) continue;
        indegree[key] = (indegree[key] ?? 0) + 1;
        children[pk]?.push(key);
      }
    }
    const events = this.events;
    const compareEvents = (leftKey: string, rightKey: string) => {
      const leftEvent = events.get(leftKey) as Event, rightEvent = events.get(rightKey) as Event;
      const leftTarget = leftEvent.edit.target, rightTarget = rightEvent.edit.target;
      const minLength = Math.min(leftTarget.length, rightTarget.length);
      for (let i = 0; i < minLength; i++) {
        const leftIsAll = leftTarget.segments[i] === "*";
        const rightIsAll = rightTarget.segments[i] === "*";
        if (leftIsAll && !rightIsAll) return -1;
        if (!leftIsAll && rightIsAll) return 1;
      }
      if (leftTarget.length !== rightTarget.length) return leftTarget.length - rightTarget.length;
      return leftEvent.id.compareTo(rightEvent.id);
    };
    const queue = new BinaryHeap<string>(compareEvents);
    for (const key of Object.keys(indegree)) {
      if (indegree[key] === 0) queue.push(key);
    }
    const ordered: string[] = [];
    while (queue.length > 0) {
      const key = queue.pop()!;
      ordered.push(key);
      for (const ch of children[key] as string[]) {
        indegree[ch] = (indegree[ch] ?? 0) - 1;
        if (indegree[ch] === 0) queue.push(ch);
      }
    }
    if (ordered.length !== causalPast.size) {
      throw new Error("Event graph contains a cycle.");
    }
    return ordered;
  }

  materialize(frontier?: EventId[]): MaterializeResult {
    const ordered = frontier
      ? this.computeTopologicalOrder(frontier)
      : (this.cachedOrder ??= this.computeTopologicalOrder());
    const doc = this.initial.clone();
    const applied: { ev: Event; edit: Edit }[] = [];
    const conflicts: Node[] = [];
    for (const key of ordered) {
      const ev = this.events.get(key) as Event;
      const edit = ev.resolveAgainst(applied, doc);
      if (edit instanceof NoOpEdit) {
        conflicts.push(edit.toConflict());
        continue;
      }
      edit.apply(doc);
      applied.push({ ev, edit });
    }
    return { doc, conflicts };
  }

  /**
   * Compacts the event graph by materializing the current state into a new
   * initial document and discarding all events. Call this when all peers
   * have synced and old history is no longer needed.
   *
   * After compaction, the graph has zero events and the current materialized
   * state becomes the new initial document.
   */
  compact(): void {
    const { doc } = this.materialize();
    this.initial = doc;
    this.events = new Map();
    this._frontierIds = [];
    this.cachedOrder = null;
  }

  /** Returns a serializable snapshot of all known events for UI inspection. */
  snapshotEvents(): EventSnapshot[] {
    return [...this.events.values()].map((ev) => ({
      id: ev.id.format(),
      peer: ev.id.peer,
      seq: ev.id.seq,
      parents: ev.parents.map((p) => p.format()),
      editKind: ev.edit.constructor.name,
      target: ev.edit.target.format(),
    }));
  }
}
