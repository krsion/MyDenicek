import { assertEquals } from "@std/assert";

import { Denicek } from "@mydenicek/core";
import { collectRemoteEventsSince } from "../internal-events.ts";
import {
  applySyncResponse,
  createSyncRequest,
  decodeEvent,
  encodeEvent,
  SyncRoom,
} from "../mod.ts";

Deno.test("encodeEvent/decodeEvent preserves remote event behavior", () => {
  const initial = {
    $tag: "root",
    title: "Draft",
    items: { $tag: "items", $items: [] },
  } as const;
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);

  alice.set("title", "Published");
  alice.insert("items", -1, {
    $tag: "item",
    name: "Ship sync server",
    done: false,
  }, true);

  for (const event of collectRemoteEventsSince(alice, [])) {
    bob.applyRemote(decodeEvent(encodeEvent(event)));
  }

  assertEquals(bob.toPlain(), alice.toPlain());
});

Deno.test("SyncRoom exchanges only missing events between peers", () => {
  const initial = {
    $tag: "root",
    title: "Tasks",
    items: { $tag: "items", $items: [] },
  } as const;
  const room = new SyncRoom("demo");
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);

  alice.set("title", "Alice title");
  let aliceServerFrontiers: string[] = [];
  let aliceResponse = room.computeSyncResponse(
    createSyncRequest(alice, "demo", aliceServerFrontiers),
  );
  applySyncResponse(alice, aliceResponse);
  aliceServerFrontiers = aliceResponse.frontiers;

  bob.insert("items", -1, { $tag: "item", name: "Bob task", done: false }, true);
  let bobServerFrontiers: string[] = [];
  const bobResponse = room.computeSyncResponse(
    createSyncRequest(bob, "demo", bobServerFrontiers),
  );
  applySyncResponse(bob, bobResponse);
  bobServerFrontiers = bobResponse.frontiers;

  aliceResponse = room.computeSyncResponse(
    createSyncRequest(alice, "demo", aliceServerFrontiers),
  );
  applySyncResponse(alice, aliceResponse);
  aliceServerFrontiers = aliceResponse.frontiers;

  const finalBobResponse = room.computeSyncResponse(
    createSyncRequest(bob, "demo", bobServerFrontiers),
  );
  applySyncResponse(bob, finalBobResponse);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(aliceServerFrontiers, finalBobResponse.frontiers);
});

Deno.test("SyncRoom converges after concurrent edits from both peers", () => {
  const initial = {
    $tag: "root",
    title: "Tasks",
    items: {
      $tag: "items",
      $items: [{ $tag: "item", name: "Initial", done: false }],
    },
  } as const;
  const room = new SyncRoom("demo");
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);

  alice.rename("items/*", "name", "label");
  bob.wrapRecord("items/*", "inner", "wrapped-item");

  let aliceServerFrontiers: string[] = [];
  const aliceResponse = room.computeSyncResponse(
    createSyncRequest(alice, "demo", aliceServerFrontiers),
  );
  applySyncResponse(alice, aliceResponse);
  aliceServerFrontiers = aliceResponse.frontiers;

  let bobServerFrontiers: string[] = [];
  const bobResponse = room.computeSyncResponse(
    createSyncRequest(bob, "demo", bobServerFrontiers),
  );
  applySyncResponse(bob, bobResponse);
  bobServerFrontiers = bobResponse.frontiers;

  const finalAliceResponse = room.computeSyncResponse(
    createSyncRequest(alice, "demo", aliceServerFrontiers),
  );
  applySyncResponse(alice, finalAliceResponse);

  const finalBobResponse = room.computeSyncResponse(
    createSyncRequest(bob, "demo", bobServerFrontiers),
  );
  applySyncResponse(bob, finalBobResponse);

  assertEquals(alice.toPlain(), bob.toPlain());
});

Deno.test("SyncRoom relays events using app-specific primitive edits without registering them", () => {
  // Simulate a peer using a primitive edit name (e.g. mywebnicek's
  // "splitFirst") that the sync server process has never registered.
  // The server runs Denicek in relayMode and therefore must forward
  // such events without ever calling the edit implementation — only
  // the recipient peers (who do register the edit) will apply it.
  const initial = { $tag: "root", text: "hello, world" } as const;
  const unknownEditName = `__never_registered_${
    crypto.randomUUID().slice(0, 8)
  }`;

  // Use an already-registered edit ("set") to build a valid event,
  // then rewrite the wire payload so the edit name is unknown to the
  // relay process. This mirrors exactly what happens in production:
  // the wire payload references a name the server has never seen.
  const alice = new Denicek("alice", initial);
  alice.applyPrimitiveEdit("text", "set", "HELLO");
  const [aliceWire] = collectRemoteEventsSince(alice, []).map(encodeEvent);
  const mutatedWire: typeof aliceWire = {
    ...aliceWire,
    edit: { ...aliceWire.edit, editName: unknownEditName } as typeof aliceWire[
      "edit"
    ],
  };

  // The SyncRoom must ingest the event without throwing — it is a relay,
  // not an applier.
  const room = new SyncRoom("demo");
  room.computeSyncResponse({
    type: "sync",
    roomId: "demo",
    frontiers: [],
    events: [mutatedWire],
  });

  // And another peer can fetch the same event from the room.
  const response = room.computeSyncResponse({
    type: "sync",
    roomId: "demo",
    frontiers: [],
    events: [],
  });
  assertEquals(response.events.length, 1);
  assertEquals(
    (response.events[0].edit as { editName?: string }).editName,
    unknownEditName,
  );
});
