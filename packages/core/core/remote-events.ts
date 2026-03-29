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

function encodeRemoteEventId(eventId: EventId): EncodedRemoteEventId {
  return { peer: eventId.peer, seq: eventId.seq };
}

function decodeRemoteEventId(encodedEventId: EncodedRemoteEventId): EventId {
  return new EventId(encodedEventId.peer, encodedEventId.seq);
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
  return new Event(
    decodeRemoteEventId(encodedEvent.id),
    encodedEvent.parents.map(decodeRemoteEventId),
    decodeRemoteEdit(encodedEvent.edit),
    new VectorClock(encodedEvent.clock),
  );
}
