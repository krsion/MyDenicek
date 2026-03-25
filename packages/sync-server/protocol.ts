import type { Denicek, PlainNode, PrimitiveValue } from '../core/mod.ts';
import {
  CopyEdit,
  Event,
  EventId,
  ListPopBackEdit,
  ListPopFrontEdit,
  ListPushBackEdit,
  ListPushFrontEdit,
  NoOpEdit,
  Node,
  RecordAddEdit,
  RecordDeleteEdit,
  RecordRenameFieldEdit,
  Selector,
  SetValueEdit,
  UpdateTagEdit,
  VectorClock,
  WrapListEdit,
  WrapRecordEdit,
} from '../core/internal.ts';
import type { Edit } from '../core/internal.ts';
import { collectAndValidateInternalEventsSince } from './internal-events.ts';

export interface EncodedEventId {
  peer: string;
  seq: number;
}

export interface EncodedSyncRequest {
  type: 'sync';
  roomId: string;
  frontiers: string[];
  events: EncodedEvent[];
}

export interface EncodedSyncResponse {
  type: 'sync';
  roomId: string;
  frontiers: string[];
  events: EncodedEvent[];
}

export interface EncodedHelloMessage {
  type: 'hello';
  roomId: string;
}

export interface EncodedErrorMessage {
  type: 'error';
  roomId?: string;
  message: string;
}

export type EncodedSyncMessage = EncodedSyncRequest | EncodedSyncResponse | EncodedHelloMessage | EncodedErrorMessage;

type EncodedEdit =
  | { kind: 'RecordAddEdit'; target: string; node: PlainNode }
  | { kind: 'RecordDeleteEdit'; target: string }
  | { kind: 'RecordRenameFieldEdit'; target: string; to: string }
  | { kind: 'SetValueEdit'; target: string; value: PrimitiveValue }
  | { kind: 'ListPushBackEdit'; target: string; node: PlainNode }
  | { kind: 'ListPushFrontEdit'; target: string; node: PlainNode }
  | { kind: 'ListPopBackEdit'; target: string }
  | { kind: 'ListPopFrontEdit'; target: string }
  | { kind: 'UpdateTagEdit'; target: string; tag: string }
  | { kind: 'WrapRecordEdit'; target: string; field: string; tag: string }
  | { kind: 'WrapListEdit'; target: string; tag: string }
  | { kind: 'CopyEdit'; target: string; source: string }
  | { kind: 'NoOpEdit'; target: string; reason: string };

export interface EncodedEvent {
  id: EncodedEventId;
  parents: EncodedEventId[];
  edit: EncodedEdit;
  clock: Record<string, number>;
}

function encodeEventId(eventId: EventId): EncodedEventId {
  return { peer: eventId.peer, seq: eventId.seq };
}

function decodeEventId(encodedEventId: EncodedEventId): EventId {
  return new EventId(encodedEventId.peer, encodedEventId.seq);
}

function extractClockEntries(clock: VectorClock): Record<string, number> {
  return clock.toRecord();
}

function encodeEdit(edit: Edit): EncodedEdit {
  if (edit instanceof RecordAddEdit) {
    return { kind: 'RecordAddEdit', target: edit.target.format(), node: edit.node.toPlain() as PlainNode };
  }
  if (edit instanceof RecordDeleteEdit) {
    return { kind: 'RecordDeleteEdit', target: edit.target.format() };
  }
  if (edit instanceof RecordRenameFieldEdit) {
    return { kind: 'RecordRenameFieldEdit', target: edit.target.format(), to: edit.to };
  }
  if (edit instanceof SetValueEdit) {
    return { kind: 'SetValueEdit', target: edit.target.format(), value: edit.value };
  }
  if (edit instanceof ListPushBackEdit) {
    return { kind: 'ListPushBackEdit', target: edit.target.format(), node: edit.node.toPlain() as PlainNode };
  }
  if (edit instanceof ListPushFrontEdit) {
    return { kind: 'ListPushFrontEdit', target: edit.target.format(), node: edit.node.toPlain() as PlainNode };
  }
  if (edit instanceof ListPopBackEdit) {
    return { kind: 'ListPopBackEdit', target: edit.target.format() };
  }
  if (edit instanceof ListPopFrontEdit) {
    return { kind: 'ListPopFrontEdit', target: edit.target.format() };
  }
  if (edit instanceof UpdateTagEdit) {
    return { kind: 'UpdateTagEdit', target: edit.target.format(), tag: edit.tag };
  }
  if (edit instanceof WrapRecordEdit) {
    return { kind: 'WrapRecordEdit', target: edit.target.format(), field: edit.field, tag: edit.tag };
  }
  if (edit instanceof WrapListEdit) {
    return { kind: 'WrapListEdit', target: edit.target.format(), tag: edit.tag };
  }
  if (edit instanceof CopyEdit) {
    return { kind: 'CopyEdit', target: edit.target.format(), source: edit.source.format() };
  }
  if (edit instanceof NoOpEdit) {
    return { kind: 'NoOpEdit', target: edit.target.format(), reason: edit.reason };
  }
  throw new Error(`Cannot encode unknown edit type '${edit.constructor.name}'.`);
}

function decodeEdit(encodedEdit: EncodedEdit): Edit {
  switch (encodedEdit.kind) {
    case 'RecordAddEdit':
      return new RecordAddEdit(Selector.parse(encodedEdit.target), Node.fromPlain(encodedEdit.node));
    case 'RecordDeleteEdit':
      return new RecordDeleteEdit(Selector.parse(encodedEdit.target));
    case 'RecordRenameFieldEdit':
      return new RecordRenameFieldEdit(Selector.parse(encodedEdit.target), encodedEdit.to);
    case 'SetValueEdit':
      return new SetValueEdit(Selector.parse(encodedEdit.target), encodedEdit.value);
    case 'ListPushBackEdit':
      return new ListPushBackEdit(Selector.parse(encodedEdit.target), Node.fromPlain(encodedEdit.node));
    case 'ListPushFrontEdit':
      return new ListPushFrontEdit(Selector.parse(encodedEdit.target), Node.fromPlain(encodedEdit.node));
    case 'ListPopBackEdit':
      return new ListPopBackEdit(Selector.parse(encodedEdit.target));
    case 'ListPopFrontEdit':
      return new ListPopFrontEdit(Selector.parse(encodedEdit.target));
    case 'UpdateTagEdit':
      return new UpdateTagEdit(Selector.parse(encodedEdit.target), encodedEdit.tag);
    case 'WrapRecordEdit':
      return new WrapRecordEdit(Selector.parse(encodedEdit.target), encodedEdit.field, encodedEdit.tag);
    case 'WrapListEdit':
      return new WrapListEdit(Selector.parse(encodedEdit.target), encodedEdit.tag);
    case 'CopyEdit':
      return new CopyEdit(Selector.parse(encodedEdit.target), Selector.parse(encodedEdit.source));
    case 'NoOpEdit':
      return new NoOpEdit(Selector.parse(encodedEdit.target), encodedEdit.reason);
    default:
      throw new Error(`decodeEdit: unknown edit kind "${(encodedEdit as { kind: string }).kind}".`);
  }
}

export function encodeEvent(event: Event): EncodedEvent {
  return {
    id: encodeEventId(event.id),
    parents: event.parents.map(encodeEventId),
    edit: encodeEdit(event.edit),
    clock: extractClockEntries(event.clock),
  };
}

export function decodeEvent(encodedEvent: EncodedEvent): Event {
  return new Event(
    decodeEventId(encodedEvent.id),
    encodedEvent.parents.map(decodeEventId),
    decodeEdit(encodedEvent.edit),
    new VectorClock(encodedEvent.clock),
  );
}

export function createSyncRequest(document: Denicek, roomId: string, knownServerFrontiers: string[]): EncodedSyncRequest {
  return {
    type: 'sync',
    roomId,
    frontiers: document.frontiers,
    events: collectAndValidateInternalEventsSince(document, knownServerFrontiers).map(encodeEvent),
  };
}

export function applySyncResponse(document: Denicek, response: EncodedSyncResponse): void {
  for (const encodedEvent of response.events) {
    document.applyRemote(decodeEvent(encodedEvent));
  }
}
