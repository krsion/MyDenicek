import { assertEquals } from "@std/assert";

import { Denicek, registerPrimitiveEdit } from "@mydenicek/core";
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
  alice.pushBack("items", {
    $tag: "item",
    name: "Ship sync server",
    done: false,
  });

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

  bob.pushBack("items", { $tag: "item", name: "Bob task", done: false });
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
  // Register a custom primitive edit only on the client side. The server
  // must be able to relay events that carry this edit name without
  // requiring the same registration, because in relay mode it never
  // materializes the document.
  const initial = { $tag: "root", text: "hello, world" } as const;
  const room = new SyncRoom("demo");

  // Use a unique name per test run to avoid "already registered" errors.
  const editName = `__test_upper_${crypto.randomUUID().slice(0, 8)}`;
  registerPrimitiveEdit(editName, (value) => String(value).toUpperCase());
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);

  alice.applyPrimitiveEdit("text", editName);

  // Relay Alice's events through the server to Bob.
  const aliceResponse = room.computeSyncResponse(
    createSyncRequest(alice, "demo", []),
  );
  applySyncResponse(alice, aliceResponse);

  const bobResponse = room.computeSyncResponse(
    createSyncRequest(bob, "demo", []),
  );
  applySyncResponse(bob, bobResponse);

  assertEquals(alice.toPlain(), bob.toPlain());
});
