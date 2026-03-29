import { Event } from "./event.ts";
import { EventId } from "./event-id.ts";
import {
  decodeRemoteEdit,
  type EncodedRemoteEdit,
} from "./remote-edit-codec.ts";
import { VectorClock } from "./vector-clock.ts";

export type { EncodedRemoteEdit } from "./remote-edit-codec.ts";

/** Serializable identifier for one remote event. */
export interface EncodedRemoteEventId {
  /** Peer that created the event. */
  peer: string;
  /** Per-peer sequence number. */
  seq: number;
}

/** Serializable replication payload exchanged between peers. */
export interface EncodedRemoteEvent {
  /** Stable event identifier. */
  id: EncodedRemoteEventId;
  /** Direct parent event identifiers. */
  parents: EncodedRemoteEventId[];
  /** Encoded edit payload to replay. */
  edit: EncodedRemoteEdit;
  /** Vector clock captured when the event was created. */
  clock: Record<string, number>;
}

/** Public transport payload exchanged between peers. */
export type RemoteEvent = EncodedRemoteEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeRemoteEventId(encodedEventId: EncodedRemoteEventId): EventId {
  if (!isRecord(encodedEventId)) {
    throw new Error("Remote event ids must be objects.");
  }
  if (typeof encodedEventId.peer !== "string") {
    throw new Error("Remote event id peer must be a string.");
  }
  if (!Number.isSafeInteger(encodedEventId.seq) || encodedEventId.seq < 0) {
    throw new Error("Remote event id seq must be a non-negative safe integer.");
  }
  EventId.validatePeer(encodedEventId.peer);
  return new EventId(encodedEventId.peer, encodedEventId.seq);
}

function encodeRemoteEventId(eventId: EventId): EncodedRemoteEventId {
  return { peer: eventId.peer, seq: eventId.seq };
}

/** Encodes an internal event into the public transport payload. */
export function encodeRemoteEvent(event: Event): EncodedRemoteEvent {
  return {
    id: encodeRemoteEventId(event.id),
    parents: event.parents.map(encodeRemoteEventId),
    edit: event.edit.encodeRemoteEdit(),
    clock: event.clock.toRecord(),
  };
}

/** Decodes a transport payload back into the internal event representation. */
export function decodeRemoteEvent(encodedEvent: EncodedRemoteEvent): Event {
  if (!isRecord(encodedEvent)) {
    throw new Error("Remote events must be objects.");
  }
  if (!Array.isArray(encodedEvent.parents)) {
    throw new Error("Remote event parents must be an array.");
  }
  if (!isRecord(encodedEvent.clock)) {
    throw new Error("Remote event clock must be an object.");
  }
  return new Event(
    decodeRemoteEventId(encodedEvent.id),
    encodedEvent.parents.map(decodeRemoteEventId),
    decodeRemoteEdit(encodedEvent.edit),
    new VectorClock(encodedEvent.clock),
  );
}
