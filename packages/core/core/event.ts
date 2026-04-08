import {
  type Edit,
  MissingReferenceTargetError,
  NoOpEdit,
  ProtectedTargetError,
} from "./edits.ts";
import type { EventId } from "./event-id.ts";
import type { Node } from "./nodes.ts";
import { validatePeerId } from "./peer-id.ts";
import type { VectorClock } from "./vector-clock.ts";

function transformLaterConcurrentEdit(prior: Edit, concurrent: Edit): Edit {
  return prior.transformLaterConcurrentEdit(concurrent);
}

// ── Event ───────────────────────────────────────────────────────────

/** A single causal event in the CRDT event DAG, carrying an edit and its vector clock. */
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
    return this !== other && !this.clock.dominates(other.clock) &&
      !other.clock.dominates(this.clock);
  }

  validate(known: Map<string, Event>): void {
    const key = this.id.format();
    validatePeerId(this.id.peer);
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
    for (const [peer, seq] of Object.entries(this.clock.toRecord())) {
      validatePeerId(peer);
      if (!Number.isInteger(seq) || seq < 0) {
        throw new Error(
          `Invalid vector clock entry '${peer}:${seq}' for '${key}'.`,
        );
      }
    }
    // Every event advances exactly one peer-local sequence number, so the event's
    // own vector-clock component must match its stable id. Otherwise concurrency
    // checks could treat the event as if it had happened before or after itself.
    if (this.clock.get(this.id.peer) !== this.id.seq) {
      throw new Error(
        `Event '${key}' must have vector clock entry ${this.id.peer}=${this.id.seq}, ` +
          `but found ${this.clock.get(this.id.peer)}.`,
      );
    }
    for (const parent of this.parents) {
      const parentEvent = known.get(parent.format())!;
      // A child must happen after every parent in the causal DAG, so its vector
      // clock has to dominate each parent clock component-wise.
      if (!this.clock.dominates(parentEvent.clock)) {
        throw new Error(
          `Event '${key}' clock ${
            JSON.stringify(this.clock.toRecord())
          } must dominate parent ` +
            `'${parent.format()}' clock ${
              JSON.stringify(parentEvent.clock.toRecord())
            }.`,
        );
      }
    }
  }

  /**
   * Transforms this event's edit against all concurrent prior edits.
   * Most edit pairs map through unchanged, but some concurrent edits rewrite a
   * later edit's selector or inserted payload during deterministic replay.
   */
  resolveAgainst(applied: { ev: Event; edit: Edit }[], doc: Node): Edit {
    let edit: Edit = this.edit;
    let sawConcurrentEdit = false;
    let sawConcurrentTransform = false;
    for (const prior of applied) {
      if (this.clock.dominates(prior.ev.clock)) continue;
      if (this.isConcurrentWith(prior.ev)) {
        sawConcurrentEdit = true;
        sawConcurrentTransform = true;
        edit = transformLaterConcurrentEdit(prior.edit, edit);
      }
    }
    if (sawConcurrentTransform && !edit.canApply(doc)) {
      return new NoOpEdit(
        edit.target,
        `Concurrent replay left '${edit.target.format()}' unavailable before ${this.edit.constructor.name} could replay.`,
      );
    }
    // Only transformed edits need the extra protected-target check here: local
    // validation already blocked removals against the issuer's current state,
    // while concurrent rewrites can retarget a previously valid removal or
    // mutate an inserted payload during deterministic replay.
    if (sawConcurrentEdit) {
      try {
        edit.validate(doc);
      } catch (error) {
        if (
          !(error instanceof ProtectedTargetError) &&
          !(error instanceof MissingReferenceTargetError)
        ) throw error;
        return new NoOpEdit(
          edit.target,
          error instanceof ProtectedTargetError
            ? `Concurrent replay left '${edit.target.format()}' protected before ${this.edit.constructor.name} could replay.`
            : `Concurrent replay left '${edit.target.format()}' referencing a missing target before ${this.edit.constructor.name} could replay.`,
        );
      }
    }
    return edit;
  }
}
