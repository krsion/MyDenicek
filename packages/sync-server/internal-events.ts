import { Denicek } from '../core/mod.ts';
import { Event } from '../core/internal.ts';

export function collectAndValidateInternalEventsSince(document: Denicek, frontiers: string[]): Event[] {
  const events = document.eventsSince(frontiers);
  if (!Array.isArray(events)) {
    throw new TypeError('Denicek.eventsSince() must return an array.');
  }
  for (const event of events) {
    if (!(event instanceof Event)) {
      throw new TypeError('Denicek.eventsSince() returned a non-Event value.');
    }
  }
  return events;
}
