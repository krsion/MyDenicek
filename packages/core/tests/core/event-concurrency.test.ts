import { assertEquals } from "@std/assert";
import { Event } from "../../core/event.ts";
import { EventId } from "../../core/event-id.ts";
import { NoOpEdit } from "../../core/edits.ts";
import { VectorClock } from "../../core/vector-clock.ts";

// Regression: `isConcurrentWith` must compare by EventId, not by reference.
// Two distinct `Event` instances representing the same event (e.g. rehydrated
// from the wire) with identical vector clocks should NOT be reported as
// concurrent, because they are the same event.
Deno.test("Event.isConcurrentWith: same id, different instances are not concurrent", () => {
  const id = new EventId("alice", 0);
  const clock = new VectorClock({ alice: 0 });
  const a = new Event(id, [], new NoOpEdit(), clock);
  const b = new Event(
    new EventId("alice", 0),
    [],
    new NoOpEdit(),
    new VectorClock({ alice: 0 }),
  );

  assertEquals(a === b, false, "instances should be distinct");
  assertEquals(a.isConcurrentWith(b), false);
  assertEquals(b.isConcurrentWith(a), false);
});

Deno.test("Event.isConcurrentWith: genuinely concurrent events", () => {
  const a = new Event(
    new EventId("alice", 0),
    [],
    new NoOpEdit(),
    new VectorClock({ alice: 0 }),
  );
  const b = new Event(
    new EventId("bob", 0),
    [],
    new NoOpEdit(),
    new VectorClock({ bob: 0 }),
  );
  assertEquals(a.isConcurrentWith(b), true);
});

Deno.test("Event.isConcurrentWith: causally related events are not concurrent", () => {
  const a = new Event(
    new EventId("alice", 0),
    [],
    new NoOpEdit(),
    new VectorClock({ alice: 0 }),
  );
  const b = new Event(
    new EventId("alice", 1),
    [a.id],
    new NoOpEdit(),
    new VectorClock({ alice: 1 }),
  );
  assertEquals(a.isConcurrentWith(b), false);
  assertEquals(b.isConcurrentWith(a), false);
});
