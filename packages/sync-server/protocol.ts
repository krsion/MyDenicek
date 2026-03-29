import type { Denicek, RemoteEvent } from "@mydenicek/core";
import type { EncodedRemoteEvent, EncodedRemoteEventId } from "@mydenicek/core";
import { collectRemoteEventsSince } from "./internal-events.ts";

export type EncodedEventId = EncodedRemoteEventId;

export interface EncodedSyncRequest {
  type: "sync";
  roomId: string;
  frontiers: string[];
  events: EncodedEvent[];
}

export interface EncodedSyncResponse {
  type: "sync";
  roomId: string;
  frontiers: string[];
  events: EncodedEvent[];
}

export interface EncodedHelloMessage {
  type: "hello";
  roomId: string;
}

export interface EncodedErrorMessage {
  type: "error";
  roomId?: string;
  message: string;
}

export type EncodedSyncMessage =
  | EncodedSyncRequest
  | EncodedSyncResponse
  | EncodedHelloMessage
  | EncodedErrorMessage;

export type EncodedEvent = EncodedRemoteEvent;

export function encodeEvent(event: RemoteEvent): EncodedEvent {
  return event;
}

export function decodeEvent(
  encodedEvent: EncodedEvent,
): RemoteEvent {
  return encodedEvent;
}

export function createSyncRequest(
  document: Denicek,
  roomId: string,
  knownServerFrontiers: string[],
): EncodedSyncRequest {
  return {
    type: "sync",
    roomId,
    frontiers: document.frontiers,
    events: collectRemoteEventsSince(document, knownServerFrontiers).map(
      encodeEvent,
    ),
  };
}

export function applySyncResponse(
  document: Denicek,
  response: EncodedSyncResponse,
): void {
  for (const encodedEvent of response.events) {
    document.applyRemote(decodeEvent(encodedEvent));
  }
}
