import { Denicek } from '@mydenicek/core';
import {
  type EncodedEvent,
  type EncodedSyncRequest,
  type EncodedSyncResponse,
  decodeEvent,
  encodeEvent,
} from './protocol.ts';
import { collectRemoteEventsSince } from './internal-events.ts';

export class SyncRoom {
  readonly id: string;
  private roomPeer: Denicek;

  constructor(id: string) {
    this.id = id;
    this.roomPeer = new Denicek(`room:${id}`);
  }

  get frontiers(): string[] {
    return this.roomPeer.frontiers;
  }

  ingestEncodedEvents(events: EncodedEvent[]): void {
    for (const encodedEvent of events) {
      this.roomPeer.applyRemote(decodeEvent(encodedEvent));
    }
  }

  computeSyncResponse(request: EncodedSyncRequest): EncodedSyncResponse {
    this.ingestEncodedEvents(request.events);
    return {
      type: 'sync',
      roomId: this.id,
      frontiers: this.roomPeer.frontiers,
      events: collectRemoteEventsSince(this.roomPeer, request.frontiers).map(encodeEvent),
    };
  }

  listEncodedEvents(): EncodedEvent[] {
    return collectRemoteEventsSince(this.roomPeer, []).map(encodeEvent);
  }
}
