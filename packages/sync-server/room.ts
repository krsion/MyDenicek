import { Denicek, type PlainNode } from "@mydenicek/core";
import {
  decodeEvent,
  type EncodedEvent,
  type EncodedSyncRequest,
  type EncodedSyncResponse,
  encodeEvent,
} from "./protocol.ts";
import { collectRemoteEventsSince } from "./internal-events.ts";

/**
 * Server-side room that merges events from all connected peers.
 * Each room maintains its own Denicek instance as the authoritative state.
 *
 * The first client to sync bootstraps the room with its initial document.
 * All subsequent clients must share the same initial document (verified
 * via hash comparison).
 */
export class SyncRoom {
  /** Unique room identifier. */
  readonly id: string;
  private roomPeer: Denicek;
  /** Hash of the initial document agreed upon by the first client. */
  private _initialDocumentHash: string | undefined;
  private bootstrapped = false;

  /** Create a new room with the given identifier and optional initial doc. */
  constructor(id: string, initialDocument?: PlainNode) {
    this.id = id;
    this.roomPeer = new Denicek(
      `room-${id.replaceAll(":", "-")}`,
      initialDocument,
    );
    this.bootstrapped = initialDocument !== undefined;
  }

  /** The initial document hash for this room, if set. */
  get initialDocumentHash(): string | undefined {
    return this._initialDocumentHash;
  }

  /** Current frontier event IDs of this room's merged state. */
  get frontiers(): string[] {
    return this.roomPeer.frontiers;
  }

  /** Ingest encoded events into this room's state. */
  ingestEncodedEvents(events: EncodedEvent[]): void {
    for (const encodedEvent of events) {
      this.roomPeer.applyRemote(decodeEvent(encodedEvent));
    }
  }

  /**
   * Validate the initial document hash and bootstrap the room if needed.
   * The first client with a hash and document sets the room's initial state.
   * Returns an error message if the hash mismatches, or undefined if OK.
   */
  validateAndBootstrap(
    clientHash: string | undefined,
    clientInitialDocument: PlainNode | undefined,
  ): string | undefined {
    if (!clientHash) return undefined;

    if (!this._initialDocumentHash) {
      this._initialDocumentHash = clientHash;
      if (clientInitialDocument && !this.bootstrapped) {
        this.roomPeer = new Denicek(
          `room-${this.id.replaceAll(":", "-")}`,
          clientInitialDocument,
        );
        this.bootstrapped = true;
      }
      return undefined;
    }

    if (this._initialDocumentHash !== clientHash) {
      return `Initial document mismatch: room expects '${this._initialDocumentHash}' but client sent '${clientHash}'. All peers must start from the same initial document.`;
    }
    return undefined;
  }

  /** Process a sync request: ingest client events and return missing events. */
  computeSyncResponse(request: EncodedSyncRequest): EncodedSyncResponse {
    this.ingestEncodedEvents(request.events);
    return {
      type: "sync",
      roomId: this.id,
      frontiers: this.roomPeer.frontiers,
      events: collectRemoteEventsSince(this.roomPeer, request.frontiers).map(
        encodeEvent,
      ),
    };
  }

  /** Return all events stored in this room as encoded events. */
  listEncodedEvents(): EncodedEvent[] {
    return collectRemoteEventsSince(this.roomPeer, []).map(encodeEvent);
  }
}
