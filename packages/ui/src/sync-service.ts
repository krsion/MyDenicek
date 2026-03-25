import type { PeerSession } from './peer-session.ts';

/** Transfers events between peers. Swap in a server-backed version later. */
export interface SyncService {
  /** Push all events from `from` that `to` has not seen. */
  push(from: PeerSession, to: PeerSession): void;
  /** Bidirectional sync: push A→B then B→A. */
  sync(a: PeerSession, b: PeerSession): void;
  /** Full mesh sync across all sessions until convergence. */
  syncAll(sessions: PeerSession[]): void;
}

/** In-memory sync service for multi-peer simulation. */
export class InMemorySyncService implements SyncService {
  push(from: PeerSession, to: PeerSession): void {
    to.receiveEventsFrom(from);
  }

  sync(a: PeerSession, b: PeerSession): void {
    // One round is sufficient for convergence when both peers have all causal history.
    b.receiveEventsFrom(a);
    a.receiveEventsFrom(b);
  }

  syncAll(sessions: PeerSession[]): void {
    // Two passes are sufficient: in pass 1, every peer receives all events from all
    // other peers that don't depend on pass-1 deliveries. Pass 2 covers any events
    // whose causal parents were themselves delivered in pass 1.
    for (let pass = 0; pass < 2; pass++) {
      for (const target of sessions) {
        for (const source of sessions) {
          if (source !== target) target.receiveEventsFrom(source);
        }
      }
    }
  }
}
