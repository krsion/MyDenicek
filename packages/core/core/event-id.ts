// ── EventId ─────────────────────────────────────────────────────────

export class EventId {
  constructor(readonly peer: string, readonly seq: number) {}

  static validatePeer(peer: string): void {
    if (peer.length === 0) {
      throw new Error("Peer ids must not be empty.");
    }
    if (peer.includes(":")) {
      throw new Error(`Peer id '${peer}' cannot contain ':'.`);
    }
  }

  static parse(value: string): EventId {
    const [peer, seqText] = value.split(":");
    const seq = Number(seqText);
    if (
      peer === undefined || seqText === undefined || !Number.isInteger(seq) ||
      seq < 0
    ) {
      throw new Error(`Invalid event id '${value}'.`);
    }
    EventId.validatePeer(peer);
    return new EventId(peer, seq);
  }

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
