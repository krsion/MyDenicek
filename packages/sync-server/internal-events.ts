import type { Denicek, RemoteEvent } from '@mydenicek/core';

export function collectRemoteEventsSince(document: Denicek, frontiers: string[]): RemoteEvent[] {
  return document.eventsSince(frontiers);
}
