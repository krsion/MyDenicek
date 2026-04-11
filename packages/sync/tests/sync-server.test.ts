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
