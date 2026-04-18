import { assertEquals } from "@std/assert";

import { Denicek } from "@mydenicek/core";
import { applySyncResponse, createSyncRequest, SyncRoom } from "../mod.ts";

// ── Hash mismatch rejection ────────────────────────────────────────────

Deno.test("SyncRoom rejects initial document hash mismatch", () => {
  const room = new SyncRoom("hash-test");

  // First client bootstraps the room with hash "abc"
  const err1 = room.validateAndBootstrap("abc", {
    $tag: "root",
    title: "V1",
  });
  assertEquals(err1, undefined);

  // Second client with matching hash succeeds
  const err2 = room.validateAndBootstrap("abc", undefined);
  assertEquals(err2, undefined);

  // Third client with different hash is rejected
  const err3 = room.validateAndBootstrap("xyz", undefined);
  assertEquals(
    typeof err3,
    "string",
    "Expected an error message for mismatched hash",
  );
  assertEquals(err3!.includes("mismatch"), true);
});

// ── Missing hash is silently accepted ──────────────────────────────────

Deno.test("SyncRoom accepts sync request without hash", () => {
  const room = new SyncRoom("no-hash-test");

  // Client syncs without any hash — should succeed
  const err = room.validateAndBootstrap(undefined, undefined);
  assertEquals(err, undefined);
});

// ── Late-joining peer receives all events ──────────────────────────────

Deno.test("SyncRoom late-joining peer receives full history", () => {
  const initial = {
    $tag: "root",
    items: { $tag: "ul", $items: [] },
  } as const;
  const room = new SyncRoom("late-join");
  const alice = new Denicek("alice", initial);

  // Alice makes several edits and syncs
  alice.insert("items", -1, { $tag: "li", text: "A" }, true);
  alice.insert("items", -1, { $tag: "li", text: "B" }, true);
  alice.insert("items", -1, { $tag: "li", text: "C" }, true);

  room.computeSyncResponse(
    createSyncRequest(alice, "late-join", []),
  );

  // Bob joins late with empty frontiers — should get all 3 events
  const bob = new Denicek("bob", initial);
  const bobResponse = room.computeSyncResponse(
    createSyncRequest(bob, "late-join", []),
  );
  applySyncResponse(bob, bobResponse);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(bobResponse.events.length, 3);
});

// ── Duplicate events are idempotent ────────────────────────────────────

Deno.test("SyncRoom ignores duplicate events (idempotent ingest)", () => {
  const initial = { $tag: "root", val: "x" } as const;
  const room = new SyncRoom("dup-test");
  const alice = new Denicek("alice", initial);

  alice.set("val", "y");

  // Send same events twice
  const request = createSyncRequest(alice, "dup-test", []);
  room.computeSyncResponse(request);
  room.computeSyncResponse(request);

  // Bob gets exactly one event
  const bob = new Denicek("bob", initial);
  const bobResponse = room.computeSyncResponse(
    createSyncRequest(bob, "dup-test", []),
  );
  applySyncResponse(bob, bobResponse);

  assertEquals(bob.toPlain(), alice.toPlain());
  assertEquals(bobResponse.events.length, 1);
});

// ── Concurrent edits from three peers converge through room ────────────

Deno.test("SyncRoom three-peer concurrent edits converge", () => {
  const initial = {
    $tag: "root",
    a: "original-a",
    b: "original-b",
    c: "original-c",
  } as const;
  const room = new SyncRoom("three-peer");
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);
  const carol = new Denicek("carol", initial);

  // All three edit different fields concurrently
  alice.set("a", "alice-a");
  bob.set("b", "bob-b");
  carol.set("c", "carol-c");

  // Sync all through room
  let aFrontiers: string[] = [];
  let bFrontiers: string[] = [];
  let cFrontiers: string[] = [];

  const aResp = room.computeSyncResponse(
    createSyncRequest(alice, "three-peer", aFrontiers),
  );
  applySyncResponse(alice, aResp);
  aFrontiers = aResp.frontiers;

  const bResp = room.computeSyncResponse(
    createSyncRequest(bob, "three-peer", bFrontiers),
  );
  applySyncResponse(bob, bResp);
  bFrontiers = bResp.frontiers;

  const cResp = room.computeSyncResponse(
    createSyncRequest(carol, "three-peer", cFrontiers),
  );
  applySyncResponse(carol, cResp);
  cFrontiers = cResp.frontiers;

  // Second round to propagate all events
  const aResp2 = room.computeSyncResponse(
    createSyncRequest(alice, "three-peer", aFrontiers),
  );
  applySyncResponse(alice, aResp2);

  const bResp2 = room.computeSyncResponse(
    createSyncRequest(bob, "three-peer", bFrontiers),
  );
  applySyncResponse(bob, bResp2);

  const cResp2 = room.computeSyncResponse(
    createSyncRequest(carol, "three-peer", cFrontiers),
  );
  applySyncResponse(carol, cResp2);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(bob.toPlain(), carol.toPlain());
  const plain = alice.toPlain();
  assertEquals(
    typeof plain === "object" && plain !== null && "$tag" in plain,
    true,
  );
});

// ── Reconnection after offline period ──────────────────────────────────

Deno.test("SyncRoom reconnection: offline peer catches up", () => {
  const initial = {
    $tag: "root",
    items: { $tag: "ul", $items: [] },
  } as const;
  const room = new SyncRoom("reconnect");
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);

  // Alice syncs first edit
  alice.insert("items", -1, { $tag: "li", text: "First" }, true);
  let aFrontiers: string[] = [];
  const aResp1 = room.computeSyncResponse(
    createSyncRequest(alice, "reconnect", aFrontiers),
  );
  applySyncResponse(alice, aResp1);
  aFrontiers = aResp1.frontiers;

  // Bob comes online, gets first event
  let bFrontiers: string[] = [];
  const bResp1 = room.computeSyncResponse(
    createSyncRequest(bob, "reconnect", bFrontiers),
  );
  applySyncResponse(bob, bResp1);
  bFrontiers = bResp1.frontiers;

  // Bob goes offline. Alice makes two more edits.
  alice.insert("items", -1, { $tag: "li", text: "Second" }, true);
  alice.insert("items", -1, { $tag: "li", text: "Third" }, true);
  const aResp2 = room.computeSyncResponse(
    createSyncRequest(alice, "reconnect", aFrontiers),
  );
  applySyncResponse(alice, aResp2);
  aFrontiers = aResp2.frontiers;

  // Bob reconnects — uses his old frontiers, gets both missing events
  const bResp2 = room.computeSyncResponse(
    createSyncRequest(bob, "reconnect", bFrontiers),
  );
  applySyncResponse(bob, bResp2);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(bResp2.events.length, 2);
});
