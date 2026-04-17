import { assertEquals, assertThrows } from "@std/assert";
import {
  ConflictingEventPayloadError,
  EventGraph,
} from "../../core/event-graph.ts";
import { Event } from "../../core/event.ts";
import { EventId } from "../../core/event-id.ts";
import { NoOpEdit } from "../../core/edits.ts";
import { Selector } from "../../core/selector.ts";
import { PrimitiveNode, RecordNode } from "../../core/nodes.ts";
import { VectorClock } from "../../core/vector-clock.ts";

function makeEvent(peer: string, seq: number, reason: string): Event {
  return new Event(
    new EventId(peer, seq),
    [],
    new NoOpEdit(Selector.parse("x"), reason),
    new VectorClock({ [peer]: seq }),
  );
}

function makeOrphan(peer: string, seq: number, reason: string): Event {
  const parent = new EventId("ghost", 0);
  return new Event(
    new EventId(peer, seq),
    [parent],
    new NoOpEdit(Selector.parse("x"), reason),
    new VectorClock({ [peer]: seq, ghost: 0 }),
  );
}

Deno.test("ingestEvents: conflicting payloads throw ConflictingEventPayloadError with key", () => {
  const graph = new EventGraph(
    new RecordNode("root", { x: new PrimitiveNode("initial") }),
    undefined,
    undefined,
    { relayMode: true },
  );
  const a = makeEvent("alice", 0, "one");
  const aPrime = makeEvent("alice", 0, "two");

  const err = assertThrows(
    () => graph.ingestEvents([a, aPrime]),
    ConflictingEventPayloadError,
  );
  assertEquals(err.key, "alice:0");
});

Deno.test("discardBufferedEvent recovers from a poisoned buffer", () => {
  const graph = new EventGraph(
    new RecordNode("root", { x: new PrimitiveNode("initial") }),
    undefined,
    undefined,
    { relayMode: true },
  );

  // Buffer a causally orphan event (parent not in graph).
  const orphan = makeOrphan("alice", 5, "orphan");
  graph.ingestEvents([orphan]);

  // Retry with conflicting payload for same id poisons the buffer.
  const poisoned = makeOrphan("alice", 5, "poisoned");
  assertThrows(
    () => graph.ingestEvents([poisoned]),
    ConflictingEventPayloadError,
  );

  // Recover: drop the buffered copy, then an empty ingest succeeds.
  assertEquals(graph.discardBufferedEvent("alice:5"), true);
  graph.ingestEvents([]);
  assertEquals(graph.discardBufferedEvent("alice:5"), false);
});

