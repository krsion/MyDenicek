import { BinaryHeap } from "@std/data-structures/binary-heap";
import {
  ApplyPrimitiveEdit,
  CopyEdit,
  type Edit,
  NoOpEdit,
  RecordAddEdit,
  RecordDeleteEdit,
  RecordRenameFieldEdit,
  UpdateTagEdit,
  WrapListEdit,
  WrapRecordEdit,
} from "./edits.ts";
import { Event } from "./event.ts";
import { EventId } from "./event-id.ts";
import type { Node } from "./nodes.ts";
import { ListNode, PrimitiveNode, RecordNode } from "./nodes.ts";
import { VectorClock } from "./vector-clock.ts";

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
  vectorClock: Record<string, number>;
  editDescription: string;
};

/** Produces a human-readable description of what an edit does. */
function describeEdit(edit: Edit): string {
  const target = edit.target.format();
  if (edit instanceof RecordAddEdit) {
    const field = String(edit.target.lastSegment);
    const valueStr = describeNode(edit.node);
    return `Add '${field}'${valueStr} to ${
      edit.target.parent.format() || "root"
    }`;
  }
  if (edit instanceof RecordDeleteEdit) {
    const field = String(edit.target.lastSegment);
    return `Delete '${field}' from ${edit.target.parent.format() || "root"}`;
  }
  if (edit instanceof RecordRenameFieldEdit) {
    const from = String(edit.target.lastSegment);
    return `Rename '${from}' → '${edit.to}' in ${
      edit.target.parent.format() || "root"
    }`;
  }
  if (edit instanceof ApplyPrimitiveEdit) {
    const argsStr = edit.args.map((a) =>
      typeof a === "string" ? `"${a}"` : String(a)
    ).join(", ");
    return `${edit.editName}(${argsStr}) at ${target}`;
  }
  if (edit instanceof CopyEdit) {
    return `Copy ${edit.source.format()} → ${target}`;
  }
  if (edit instanceof UpdateTagEdit) {
    return `Update tag → '${edit.tag}' at ${target}`;
  }
  if (edit instanceof WrapRecordEdit) {
    return `Wrap ${target} in record '${edit.field}' <${edit.tag}>`;
  }
  if (edit instanceof WrapListEdit) {
    return `Wrap ${target} in list <${edit.tag}>`;
  }
  if (edit instanceof NoOpEdit) {
    return `No-op: ${edit.reason}`;
  }
  return `${edit.kind} at ${target}`;
}

function describeNode(node: Node): string {
  if (node instanceof PrimitiveNode) {
    const v = node.value;
    return ` = ${typeof v === "string" ? `"${v}"` : String(v)}`;
  }
  if (node instanceof RecordNode) {
    return ` <${node.tag}>`;
  }
  if (node instanceof ListNode) {
    return ` [${node.tag}](${node.items.length} items)`;
  }
  return "";
}
type PendingEventsByKey = Record<string, Event>;
type MissingParentCountsByKey = Record<string, number>;
type ChildKeysByMissingParent = Record<string, string[]>;
type PendingDependencyIndex = {
  missingParentCountsByKey: MissingParentCountsByKey;
  childKeysByMissingParent: ChildKeysByMissingParent;
  readyKeys: string[];
};
// These limits bound pathological remote input. Hitting them already means a
// peer is far outside normal interactive-editing behavior, so rejecting the
// input is safer than letting buffering or replay work grow without bound.
const MAX_BUFFERED_REMOTE_EVENTS = 10_000;
const MAX_REPLAY_TRANSFORMATIONS = 10_000;

/** Options for configuring an {@linkcode EventGraph}. */
export interface EventGraphOptions {
  /**
   * When true, skip edit validation during event ingestion.
   * Use for relay servers that only store and forward events
   * without needing to understand edit semantics.
   */
  relayMode?: boolean;
}

export class EventGraph {
  private initial: Node;
  private events: Map<string, Event>;
  private _frontierIds: EventId[];
  private cachedOrder: string[] | null = null;
  private bufferedEvents: Event[] = [];
  private readonly relayMode: boolean;

  constructor(
    initial: Node,
    events?: Map<string, Event>,
    frontiers?: EventId[],
    options?: EventGraphOptions,
  ) {
    this.initial = initial;
    this.events = events ?? new Map();
    this._frontierIds = frontiers ?? [];
    this.relayMode = options?.relayMode ?? false;
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

  /**
   * Resolves an event into the edit shape it should replay against the current
   * graph state.
   *
   * The returned edit first reuses the same conflict-resolution path as normal
   * materialization, then it is transformed through every later structural edit
   * that changed the document shape after the source event was recorded. This
   * lets replay follow renamed, wrapped, or reindexed targets instead of using
   * the source event's stale original selectors.
   *
   * Throws when the source event is unknown, already resolves to a conflict, or
   * later structural history has removed the replay target entirely.
   */
  resolveReplayEdit(key: string): Edit {
    const sourceEvent = this.events.get(key);
    if (sourceEvent === undefined) {
      throw new Error(
        `Unknown event '${key}'. Events must be recorded locally or received before they can be replayed.`,
      );
    }
    const ordered = this.cachedOrder ??= this.computeTopologicalOrder();
    const doc = this.initial.clone();
    const applied: { ev: Event; edit: Edit }[] = [];
    let replayEdit: Edit | null = null;
    let replayTransformationCount = 0;
    for (const orderedKey of ordered) {
      const event = this.events.get(orderedKey) as Event;
      const edit = event.resolveAgainst(applied, doc);
      if (orderedKey === key) {
        if (edit instanceof NoOpEdit) {
          throw new Error(
            `Cannot replay event '${key}' because it currently resolves to a conflict.`,
          );
        }
        replayEdit = edit;
      } else if (replayEdit !== null && edit.isStructural) {
        replayTransformationCount++;
        if (replayTransformationCount > MAX_REPLAY_TRANSFORMATIONS) {
          throw new Error(
            `Cannot replay event '${key}' through more than ${MAX_REPLAY_TRANSFORMATIONS} structural transformations.`,
          );
        }
        replayEdit = edit.transformLaterConcurrentEdit(replayEdit);
        if (replayEdit instanceof NoOpEdit) {
          throw new Error(
            `Cannot replay event '${key}' because later structural edits removed its target.`,
          );
        }
      }
      if (edit instanceof NoOpEdit) {
        continue;
      }
      edit.apply(doc);
      applied.push({ ev: event, edit });
    }
    if (replayEdit === null) {
      throw new Error(
        `Unknown event '${key}'. Events must be recorded locally or received before they can be replayed.`,
      );
    }
    return replayEdit;
  }

  insertEvent(event: Event): void {
    event.validate(this.events);
    if (!this.relayMode) {
      this.validateEventAgainstCausalState(event);
    }
    this.events.set(event.id.format(), event);
    const parentKeys = new Set(event.parents.map((p) => p.format()));
    this._frontierIds = [
      ...this._frontierIds.filter((h) => !parentKeys.has(h.format())),
      event.id,
    ].sort((a, b) => a.compareTo(b));
    this.cachedOrder = null;
  }

  private validateEventAgainstCausalState(event: Event): void {
    const { doc } = this.materialize(event.parents);
    event.edit.validate(doc);
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

  private computePendingDependencyIndex(
    pendingByKey: PendingEventsByKey,
  ): PendingDependencyIndex {
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
          if (
            newMissingParentCount === 0 && pendingByKey[childKey] !== undefined
          ) {
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
    if (this.bufferedEvents.length > MAX_BUFFERED_REMOTE_EVENTS) {
      throw new Error(
        `Cannot buffer more than ${MAX_BUFFERED_REMOTE_EVENTS} out-of-order remote events.`,
      );
    }
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

  /**
   * Computes a deterministic topological order with plain Kahn scheduling.
   *
   * The only tie-break among currently ready nodes is EventId ordering; there
   * are no replay-specific heuristics here. Any semantics that depend on
   * concurrent ordering must therefore be expressed by edit transforms rather
   * than by materialization order.
   */
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
    const queue = new BinaryHeap<string>((leftKey, rightKey) =>
      (this.events.get(leftKey) as Event).id.compareTo(
        (this.events.get(rightKey) as Event).id,
      )
    );
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
   * initial document and discarding all events once the caller confirms the
   * currently acknowledged frontier set.
   *
   * After compaction, the graph has zero events and the current materialized
   * state becomes the new initial document.
   */
  compact(acknowledgedFrontiers: EventId[]): void {
    const expectedFrontiers = [...this._frontierIds].map((eventId) =>
      eventId.format()
    ).sort();
    const providedFrontiers = acknowledgedFrontiers.map((eventId) =>
      eventId.format()
    ).sort();
    if (
      expectedFrontiers.length !== providedFrontiers.length ||
      expectedFrontiers.some((frontier, index) =>
        frontier !== providedFrontiers[index]
      )
    ) {
      throw new Error(
        "Cannot compact with stale frontiers. Pass the current acknowledged frontiers.",
      );
    }
    if (this.bufferedEvents.length > 0) {
      throw new Error(
        "Cannot compact while out-of-order remote events are still buffered.",
      );
    }
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
      editKind: ev.edit.kind,
      target: ev.edit.target.format(),
      vectorClock: ev.clock.toRecord(),
      editDescription: describeEdit(ev.edit),
    }));
  }
}
