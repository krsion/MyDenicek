import { assertEquals } from "@std/assert";
import { Event } from "../../core/event.ts";
import { EventId } from "../../core/event-id.ts";
import { NoOpEdit } from "../../core/edits.ts";
import { Selector } from "../../core/selector.ts";
import { VectorClock } from "../../core/vector-clock.ts";

function noop(): NoOpEdit {
  return new NoOpEdit(Selector.parse("x"), "test");
}

// Regression: `isConcurrentWith` must not report two distinct `Event`
// instances representing the same event (e.g. rehydrated from the wire)
// as concurrent. The vector-clock check already enforces this under the
// peer-id uniqueness invariant; this test locks the contract in.
Deno.test("Event.isConcurrentWith: same id, different instances are not concurrent", () => {
  const id = new EventId("alice", 0);
  const clock = new VectorClock({ alice: 0 });
  const a = new Event(id, [], noop(), clock);
  const b = new Event(
    new EventId("alice", 0),
    [],
    noop(),
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
    noop(),
    new VectorClock({ alice: 0 }),
  );
  const b = new Event(
    new EventId("bob", 0),
    [],
    noop(),
    new VectorClock({ bob: 0 }),
  );
  assertEquals(a.isConcurrentWith(b), true);
});

Deno.test("Event.isConcurrentWith: causally related events are not concurrent", () => {
  const a = new Event(
    new EventId("alice", 0),
    [],
    noop(),
    new VectorClock({ alice: 0 }),
  );
  const b = new Event(
    new EventId("alice", 1),
    [a.id],
    noop(),
    new VectorClock({ alice: 1 }),
  );
  assertEquals(a.isConcurrentWith(b), false);
  assertEquals(b.isConcurrentWith(a), false);
});
