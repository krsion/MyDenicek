import { Denicek } from "@mydenicek/core";
import type {
  EventSnapshot,
  FormulaResult,
  PlainNode,
  PrimitiveValue,
} from "@mydenicek/core";

/** Snapshot of a peer's visible state, safe to pass as React props. */
export type PeerSnapshot = {
  readonly peerId: string;
  readonly doc: PlainNode;
  readonly events: EventSnapshot[];
  readonly conflicts: PlainNode[];
  readonly frontiers: string[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly formulaResults: Map<string, FormulaResult>;
};

/**
 * Wraps a single Denicek instance for use in the UI.
 * Provides edit methods plus snapshot() for deriving React state.
 */
export class PeerSession {
  private readonly denicek: Denicek;

  constructor(peerId: string, initial?: PlainNode) {
    this.denicek = new Denicek(peerId, initial);
  }

  get peerId(): string {
    return this.denicek.peer;
  }

  get frontiers(): string[] {
    return this.denicek.frontiers;
  }

  /** Returns a plain serializable snapshot of the current peer state. */
  snapshot(): PeerSnapshot {
    return {
      peerId: this.denicek.peer,
      doc: this.denicek.materialize(),
      events: this.denicek.inspectEvents(),
      conflicts: this.denicek.conflicts,
      frontiers: this.denicek.frontiers,
      canUndo: this.denicek.canUndo,
      canRedo: this.denicek.canRedo,
      formulaResults: this.denicek.evaluateFormulas(),
    };
  }

  /** Receives all events from `other` that this peer has not yet seen. */
  receiveEventsFrom(other: PeerSession): void {
    const events = other.denicek.eventsSince(this.denicek.frontiers);
    for (const ev of events) this.denicek.applyRemote(ev);
  }

  // ── Edit operations ─────────────────────────────────────────────────

  add(target: string, field: string, value: PlainNode): void {
    this.denicek.add(target, field, value);
  }
  delete(target: string, field: string): void {
    this.denicek.delete(target, field);
  }
  rename(target: string, from: string, to: string): void {
    this.denicek.rename(target, from, to);
  }
  set(target: string, value: PrimitiveValue): void {
    this.denicek.set(target, value);
  }
  insert(target: string, index: number, value: PlainNode, strict?: boolean): void {
    this.denicek.insert(target, index, value, strict);
  }
  remove(target: string, index: number, strict?: boolean): void {
    this.denicek.remove(target, index, strict);
  }
  updateTag(target: string, tag: string): void {
    this.denicek.updateTag(target, tag);
  }
  wrapRecord(target: string, field: string, tag: string): void {
    this.denicek.wrapRecord(target, field, tag);
  }
  wrapList(target: string, tag: string): void {
    this.denicek.wrapList(target, tag);
  }
  copy(target: string, source: string): void {
    this.denicek.copy(target, source);
  }

  undo(): void {
    this.denicek.undo();
  }

  redo(): void {
    this.denicek.redo();
  }

  recomputeFormulas(): void {
    this.denicek.recomputeFormulas();
  }
}
