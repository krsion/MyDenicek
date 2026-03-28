import {
  ApplyPrimitiveEdit,
  CopyEdit,
  ListPopBackEdit,
  ListPopFrontEdit,
  ListPushBackEdit,
  ListPushFrontEdit,
  NoOpEdit,
  RecordAddEdit,
  RecordDeleteEdit,
  RecordRenameFieldEdit,
  SetValueEdit,
  UpdateTagEdit,
  WrapListEdit,
  WrapRecordEdit,
  type Edit,
} from './edits.ts';
import { Event, type RemoteEvent } from './event.ts';
import { EventId } from './event-id.ts';
import { Node, type PlainNode } from './nodes.ts';
import { type PrimitiveValue, Selector } from './selector.ts';
import { VectorClock } from './vector-clock.ts';

export interface EncodedRemoteEventId {
  peer: string;
  seq: number;
}

type EncodedRemoteEdit =
  | { kind: 'RecordAddEdit'; target: string; node: PlainNode }
  | { kind: 'RecordDeleteEdit'; target: string }
  | { kind: 'RecordRenameFieldEdit'; target: string; to: string }
  | { kind: 'SetValueEdit'; target: string; value: PrimitiveValue }
  | { kind: 'ApplyPrimitiveEdit'; target: string; editName: string }
  | { kind: 'ListPushBackEdit'; target: string; node: PlainNode }
  | { kind: 'ListPushFrontEdit'; target: string; node: PlainNode }
  | { kind: 'ListPopBackEdit'; target: string }
  | { kind: 'ListPopFrontEdit'; target: string }
  | { kind: 'UpdateTagEdit'; target: string; tag: string }
  | { kind: 'WrapRecordEdit'; target: string; field: string; tag: string }
  | { kind: 'WrapListEdit'; target: string; tag: string }
  | { kind: 'CopyEdit'; target: string; source: string }
  | { kind: 'NoOpEdit'; target: string; reason: string };

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

function encodeRemoteEdit(edit: Edit): EncodedRemoteEdit {
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
  if (edit instanceof ApplyPrimitiveEdit) {
    return { kind: 'ApplyPrimitiveEdit', target: edit.target.format(), editName: edit.editName };
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

function decodeRemoteEdit(encodedEdit: EncodedRemoteEdit): Edit {
  switch (encodedEdit.kind) {
    case 'RecordAddEdit':
      return new RecordAddEdit(Selector.parse(encodedEdit.target), Node.fromPlain(encodedEdit.node));
    case 'RecordDeleteEdit':
      return new RecordDeleteEdit(Selector.parse(encodedEdit.target));
    case 'RecordRenameFieldEdit':
      return new RecordRenameFieldEdit(Selector.parse(encodedEdit.target), encodedEdit.to);
    case 'SetValueEdit':
      return new SetValueEdit(Selector.parse(encodedEdit.target), encodedEdit.value);
    case 'ApplyPrimitiveEdit':
      return new ApplyPrimitiveEdit(Selector.parse(encodedEdit.target), encodedEdit.editName);
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
      throw new Error(`decodeRemoteEdit: unknown edit kind "${(encodedEdit as { kind: string }).kind}".`);
  }
}

export function encodeRemoteEvent(event: RemoteEvent): EncodedRemoteEvent {
  return {
    id: encodeRemoteEventId(event.id),
    parents: event.parents.map(encodeRemoteEventId),
    edit: encodeRemoteEdit(event.edit),
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
