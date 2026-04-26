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
    for (const prior of applied) {
      // O(1) causal ancestor check: if we've seen this peer's seq, it's an
      // ancestor. This replaces the O(P) vector-clock dominates() check.
      if (this.clock.get(prior.ev.id.peer) >= prior.ev.id.seq) continue;
      // Prior is in applied (before us in topo order) and not our ancestor,
      // so it must be concurrent.
      sawConcurrentEdit = true;
      edit = transformLaterConcurrentEdit(prior.edit, edit);
    }
    return this.finalizeResolved(edit, sawConcurrentEdit, doc);
  }

  /**
   * Like resolveAgainst, but uses a per-peer index to skip causal ancestors
   * entirely in O(P + C) instead of scanning all N priors.
   *
   * The index maps each peer to its applied events, each tagged with its
   * topological position. Events within a peer are in sequence order. For
   * event E with clock Vₑ, events from peer Y with seq ≤ Vₑ[Y] are
   * guaranteed causal ancestors and are skipped via binary search.
   * Concurrent events from all peers are merged by topological position
   * to ensure transformations compose in the correct order.
   */
  resolveAgainstIndex(
    peerIndex: Map<string, { ev: Event; edit: Edit; topoPos: number }[]>,
    doc: Node,
  ): Edit {
    // Collect concurrent events from each peer with their topo positions.
    const concurrent: { edit: Edit; topoPos: number }[] = [];
    for (const [peer, peerEvents] of peerIndex) {
      const knownSeq = this.clock.get(peer);
      // Events are in sequence order; find first with seq > knownSeq.
      // Binary search for the boundary.
      let lo = 0, hi = peerEvents.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (peerEvents[mid]!.ev.id.seq <= knownSeq) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < peerEvents.length; i++) {
        concurrent.push(peerEvents[i]!);
      }
    }
    if (concurrent.length === 0) return this.edit;

    // Sort by topological position to ensure correct transformation order.
    concurrent.sort((a, b) => a.topoPos - b.topoPos);

    let edit: Edit = this.edit;
    for (const prior of concurrent) {
      edit = transformLaterConcurrentEdit(prior.edit, edit);
    }
    return this.finalizeResolved(edit, true, doc);
  }

  private finalizeResolved(
    edit: Edit,
    sawConcurrentEdit: boolean,
    doc: Node,
  ): Edit {
    if (sawConcurrentEdit && !edit.canApply(doc)) {
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
