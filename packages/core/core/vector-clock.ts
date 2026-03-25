// ── VectorClock ─────────────────────────────────────────────────────

export class VectorClock {
  private entries: Record<string, number>;

  constructor(entries?: Record<string, number>) {
    this.entries = entries ? { ...entries } : {};
  }

  get(peer: string): number {
    return this.entries[peer] ?? -1;
  }

  set(peer: string, seq: number): void {
    this.entries[peer] = seq;
  }

  tick(peer: string): number {
    const next = this.get(peer) + 1;
    this.entries[peer] = next;
    return next;
  }

  dominates(other: VectorClock): boolean {
    return Object.entries(other.entries).every(([peer, seq]) => this.get(peer) >= seq);
  }

  merge(other: VectorClock): void {
    for (const [peer, seq] of Object.entries(other.entries)) {
      this.entries[peer] = Math.max(this.get(peer), seq);
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

  toRecord(): Record<string, number> {
    return { ...this.entries };
  }
}
