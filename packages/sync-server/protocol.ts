import {
  decodeRemoteEvent,
  encodeRemoteEvent,
  type Denicek,
  type EncodedRemoteEvent,
} from '@mydenicek/core';
import { collectRemoteEventsSince } from './internal-events.ts';

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

export interface EncodedEvent {
  id: EncodedEventId;
  parents: EncodedEventId[];
  edit: EncodedRemoteEvent['edit'];
  clock: Record<string, number>;
}
export function encodeEvent(event: Parameters<typeof encodeRemoteEvent>[0]): EncodedEvent {
  return encodeRemoteEvent(event);
}

export function decodeEvent(encodedEvent: EncodedEvent): ReturnType<typeof decodeRemoteEvent> {
  return decodeRemoteEvent(encodedEvent);
}

export function createSyncRequest(document: Denicek, roomId: string, knownServerFrontiers: string[]): EncodedSyncRequest {
  return {
    type: 'sync',
    roomId,
    frontiers: document.frontiers,
    events: collectRemoteEventsSince(document, knownServerFrontiers).map(encodeEvent),
  };
}

export function applySyncResponse(document: Denicek, response: EncodedSyncResponse): void {
  for (const encodedEvent of response.events) {
    document.applyRemote(decodeEvent(encodedEvent));
  }
}
