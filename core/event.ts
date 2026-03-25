import { Edit, NoOpEdit } from './edits.ts';
import { EventId } from './event-id.ts';
import { Node } from './nodes.ts';
import { VectorClock } from './vector-clock.ts';

// ── Event ───────────────────────────────────────────────────────────

export class Event {
  constructor(
    readonly id: EventId,
    readonly parents: EventId[],
    readonly edit: Edit,
    readonly clock: VectorClock,
  ) {}

  equals(other: Event): boolean {
    if (!this.id.equals(other.id)) return false;
    if (this.parents.length !== other.parents.length) return false;
    for (let i = 0; i < this.parents.length; i++) {
      if (!this.parents[i]!.equals(other.parents[i]!)) return false;
    }
    if (!this.clock.equals(other.clock)) return false;
    return this.edit.equals(other.edit);
  }

  isConcurrentWith(other: Event): boolean {
    return this !== other && !this.clock.dominates(other.clock) && !other.clock.dominates(this.clock);
  }

  validate(known: Map<string, Event>): void {
    const key = this.id.format();
    if (!Number.isInteger(this.id.seq) || this.id.seq < 0) {
      throw new Error(`Invalid seq for '${key}'.`);
    }
    if (this.parents.some((p) => p.format() === key)) {
      throw new Error(`Event '${key}' is its own parent.`);
    }
    for (const p of this.parents) {
      if (!known.has(p.format())) {
        throw new Error(`Unknown parent '${p.format()}' for event '${key}'.`);
      }
    }
  }

  /**
   * Transforms this event's edit against all concurrent prior structural edits.
   * If those edits have already removed or overwritten the target at replay
   * time, the result becomes an explicit no-op edit reported as a conflict.
   */
  resolveAgainst(applied: { ev: Event; edit: Edit }[], doc: Node): Edit {
    let edit: Edit = this.edit;
    let sawConcurrentStructuralEdit = false;
    for (const prior of applied) {
      if (this.clock.dominates(prior.ev.clock)) continue;
      if (this.isConcurrentWith(prior.ev)) {
        if (prior.edit.isStructural) {
          sawConcurrentStructuralEdit = true;
          edit = edit.transform(prior.edit);
        }
      }
    }
    if (sawConcurrentStructuralEdit && !edit.canApply(doc)) {
      return new NoOpEdit(
        edit.target,
        `Concurrent replay left '${edit.target.format()}' unavailable before ${this.edit.constructor.name} could replay.`,
      );
    }
    return edit;
  }
}
