import { Denicek } from "@mydenicek/core";
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
 */
export class SyncRoom {
  /** Unique room identifier. */
  readonly id: string;
  private roomPeer: Denicek;

  /** Create a new room with the given identifier. */
  constructor(id: string) {
    this.id = id;
    this.roomPeer = new Denicek(`room-${id.replaceAll(":", "-")}`);
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
