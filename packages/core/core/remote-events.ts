import { Event, type RemoteEvent } from './event.ts';
import { EventId } from './event-id.ts';
import { decodeRemoteEdit, type EncodedRemoteEdit } from './remote-edit-codec.ts';
import { VectorClock } from './vector-clock.ts';

export interface EncodedRemoteEventId {
  peer: string;
  seq: number;
}

export interface EncodedRemoteEvent {
  id: EncodedRemoteEventId;
  parents: EncodedRemoteEventId[];
  edit: EncodedRemoteEdit;
  clock: Record<string, number>;
}

function encodeRemoteEventId(eventId: EventId): EncodedRemoteEventId {
  return { peer: eventId.peer, seq: eventId.seq };
}

function decodeRemoteEventId(encodedEventId: EncodedRemoteEventId): EventId {
  return new EventId(encodedEventId.peer, encodedEventId.seq);
}

export function encodeRemoteEvent(event: RemoteEvent): EncodedRemoteEvent {
  return {
    id: encodeRemoteEventId(event.id),
    parents: event.parents.map(encodeRemoteEventId),
    edit: event.edit.encodeRemoteEdit(),
    clock: event.clock.toRecord(),
  };
}

export function decodeRemoteEvent(encodedEvent: EncodedRemoteEvent): RemoteEvent {
  return new Event(
    decodeRemoteEventId(encodedEvent.id),
    encodedEvent.parents.map(decodeRemoteEventId),
    decodeRemoteEdit(encodedEvent.edit),
    new VectorClock(encodedEvent.clock),
  );
}
