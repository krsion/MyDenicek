// ── EventId ─────────────────────────────────────────────────────────

export class EventId {
  constructor(readonly peer: string, readonly seq: number) {}

  format(): string {
    return `${this.peer}:${this.seq}`;
  }

  compareTo(other: EventId): number {
    if (this.peer < other.peer) return -1;
    if (this.peer > other.peer) return 1;
    return this.seq - other.seq;
  }

  equals(other: EventId): boolean {
    return this.peer === other.peer && this.seq === other.seq;
  }
}
