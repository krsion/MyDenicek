import type { Denicek, RemoteEvent } from "@mydenicek/core";
import type { EncodedRemoteEvent, EncodedRemoteEventId } from "@mydenicek/core";
import { collectRemoteEventsSince } from "./internal-events.ts";

/** Encoded event identifier (opaque string). */
export type EncodedEventId = EncodedRemoteEventId;

/** A sync request sent from client to server. */
export interface EncodedSyncRequest {
  /** Message type discriminator. */
  type: "sync";
  /** Room to sync with. */
  roomId: string;
  /** Client's current frontier event IDs. */
  frontiers: string[];
  /** New events the client wants to send. */
  events: EncodedEvent[];
}

/** A sync response sent from server to client. */
export interface EncodedSyncResponse {
  /** Message type discriminator. */
  type: "sync";
  /** Room that was synced. */
  roomId: string;
  /** Server's current frontier event IDs. */
  frontiers: string[];
  /** Events the client hasn't seen yet. */
  events: EncodedEvent[];
}

/** Server greeting sent when a WebSocket connection is established. */
export interface EncodedHelloMessage {
  /** Message type discriminator. */
  type: "hello";
  /** Room the client connected to. */
  roomId: string;
}

/** Error message sent by the server on protocol violations. */
export interface EncodedErrorMessage {
  /** Message type discriminator. */
  type: "error";
  /** Room associated with the error, if applicable. */
  roomId?: string;
  /** Human-readable error description. */
  message: string;
}

/** Union of all sync protocol message types. */
export type EncodedSyncMessage =
  | EncodedSyncRequest
  | EncodedSyncResponse
  | EncodedHelloMessage
  | EncodedErrorMessage;

/** A serialized CRDT event for wire transport. */
export type EncodedEvent = EncodedRemoteEvent;

/** Encode a {@linkcode RemoteEvent} for wire transport. */
export function encodeEvent(event: RemoteEvent): EncodedEvent {
  return event;
}

/** Decode a wire-format event back into a {@linkcode RemoteEvent}. */
export function decodeEvent(
  encodedEvent: EncodedEvent,
): RemoteEvent {
  return encodedEvent;
}

/** Build a sync request containing events the server hasn't seen yet. */
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

/** Apply events from a sync response to a local Denicek document. */
export function applySyncResponse(
  document: Denicek,
  response: EncodedSyncResponse,
): void {
  for (const encodedEvent of response.events) {
    document.applyRemote(decodeEvent(encodedEvent));
  }
}
