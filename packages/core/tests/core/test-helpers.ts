import { assertEquals, assertThrows } from "@std/assert";
import { Denicek, registerPrimitiveEdit, type RemoteEvent } from "../../mod.ts";
import { Edit, RecordAddEdit, RecordDeleteEdit } from "../../core/edits.ts";
import { Event } from "../../core/event.ts";
import { EventGraph } from "../../core/event-graph.ts";
import { EventId } from "../../core/event-id.ts";
import { Node, PrimitiveNode, RecordNode } from "../../core/nodes.ts";
import { encodeRemoteEvent } from "../../core/remote-events.ts";
import { Selector } from "../../core/selector.ts";
import { VectorClock } from "../../core/vector-clock.ts";

function sync(a: Denicek, b: Denicek): void {
  const aFrontiers = a.frontiers;
  const bFrontiers = b.frontiers;
  for (const event of a.eventsSince(bFrontiers)) b.applyRemote(event);
  for (const event of b.eventsSince(aFrontiers)) a.applyRemote(event);
}

function syncMesh(peers: Denicek[]): void {
  const frontiers = peers.map((peer) => peer.frontiers);
  const diffs = peers.map((peer, sourceIndex) => {
    const events: RemoteEvent[] = [];
    for (let targetIndex = 0; targetIndex < peers.length; targetIndex++) {
      if (sourceIndex !== targetIndex) {
        events.push(...peer.eventsSince(frontiers[targetIndex]!));
      }
    }
    return events;
  });
  for (let targetIndex = 0; targetIndex < peers.length; targetIndex++) {
    for (let sourceIndex = 0; sourceIndex < peers.length; sourceIndex++) {
      if (targetIndex !== sourceIndex) {
        for (const event of diffs[sourceIndex]!) {
          peers[targetIndex]!.applyRemote(event);
        }
      }
    }
  }
}

function materializedConflicts(peer: Denicek): unknown[] {
  peer.materialize();
  return peer.conflicts;
}

function createRecordAddEvent(
  peer: string,
  seq: number,
  parentSeqs: number[],
  field: string,
): Event {
  return new Event(
    new EventId(peer, seq),
    parentSeqs.map((parentSeq) => new EventId(peer, parentSeq)),
    new RecordAddEdit(Selector.parse(field), new PrimitiveNode(field)),
    new VectorClock({ [peer]: seq }),
  );
}

export {
  assertEquals,
  assertThrows,
  createRecordAddEvent,
  Denicek,
  Edit,
  encodeRemoteEvent,
  Event,
  EventGraph,
  EventId,
  materializedConflicts,
  Node,
  PrimitiveNode,
  RecordAddEdit,
  RecordDeleteEdit,
  RecordNode,
  registerPrimitiveEdit,
  Selector,
  sync,
  syncMesh,
  VectorClock,
};
