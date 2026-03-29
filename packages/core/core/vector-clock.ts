import { EventId } from "./event-id.ts";

// ── VectorClock ─────────────────────────────────────────────────────

function validateClockEntry(peer: string, seq: number): void {
  EventId.validatePeer(peer);
  if (!Number.isSafeInteger(seq) || seq < 0) {
    throw new Error(
      `Invalid vector clock entry ${peer}=${
        String(seq)
      }. Expected a non-negative safe integer.`,
    );
  }
}

export class VectorClock {
  private entries: Record<string, number>;

  constructor(entries?: Record<string, number>) {
    this.entries = {};
    if (entries !== undefined) {
      for (const [peer, seq] of Object.entries(entries)) {
        validateClockEntry(peer, seq);
        this.entries[peer] = seq;
      }
    }
  }

  get(peer: string): number {
    return this.entries[peer] ?? -1;
  }

  set(peer: string, seq: number): void {
    validateClockEntry(peer, seq);
    this.entries[peer] = seq;
  }

  tick(peer: string): number {
    const next = this.get(peer) + 1;
    this.set(peer, next);
    return next;
  }

  dominates(other: VectorClock): boolean {
    return Object.entries(other.entries).every(([peer, seq]) =>
      this.get(peer) >= seq
    );
  }

  merge(other: VectorClock): void {
    for (const [peer, seq] of Object.entries(other.entries)) {
      this.set(peer, Math.max(this.get(peer), seq));
    }
  }

  equals(other: VectorClock): boolean {
    const aKeys = Object.keys(this.entries);
    if (aKeys.length !== Object.keys(other.entries).length) return false;
    return aKeys.every((k) => this.entries[k] === other.get(k));
  }

  clone(): VectorClock {
    return new VectorClock(this.entries);
  }

  entryRecords(): [string, number][] {
    return Object.entries(this.entries);
  }

  toRecord(): Record<string, number> {
    return { ...this.entries };
  }
}
