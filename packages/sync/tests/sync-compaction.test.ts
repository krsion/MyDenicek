import { assertEquals } from "@std/assert";

import { Denicek } from "@mydenicek/core";
import type { PlainNode } from "@mydenicek/core";
import { applySyncResponse, createSyncRequest, SyncRoom } from "../mod.ts";
import { computeDocumentHashSync } from "../client.ts";

// ── Helper: sync a peer with the room and return updated frontiers ─────

function syncPeer(
  peer: Denicek,
  room: SyncRoom,
  roomId: string,
  knownFrontiers: string[],
  initialDoc?: PlainNode,
): string[] {
  const hash = initialDoc ? computeDocumentHashSync(initialDoc) : undefined;
  const response = room.computeSyncResponse(
    createSyncRequest(peer, roomId, knownFrontiers, hash, initialDoc),
  );
  applySyncResponse(peer, response);
  return response.frontiers;
}

// ── Helper: generate N edits on a peer ─────────────────────────────────

function generateEdits(peer: Denicek, count: number): void {
  for (let i = 0; i < count; i++) {
    peer.set("counter", i);
  }
}

// ── Basic compaction ───────────────────────────────────────────────────

Deno.test("SyncRoom basic compaction: two peers sync, server compacts", () => {
  const initial = { $tag: "root", counter: 0 } as const;
  const room = new SyncRoom("compact-basic", initial);
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);
  const roomId = "compact-basic";

  // Generate enough events to exceed the compaction threshold
  generateEdits(alice, SyncRoom.MIN_EVENTS_FOR_COMPACTION + 10);

  // Both peers sync and acknowledge the same frontier
  let aliceFrontiers = syncPeer(alice, room, roomId, []);
  let bobFrontiers = syncPeer(bob, room, roomId, []);

  // Second round so both have the full state
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);

  assertEquals(alice.toPlain(), bob.toPlain());

  // Both peers have acknowledged the room's frontier
  const eventsBefore = room.eventCount;
  assertEquals(eventsBefore >= SyncRoom.MIN_EVENTS_FOR_COMPACTION, true);

  const compacted = room.tryCompact();
  assertEquals(compacted, true);
  assertEquals(room.eventCount, 0);
  assertEquals(room.getCompactedFrontier() !== null, true);

  // After compaction, peers can still sync normally
  alice.set("counter", 999);
  // First round: peers get compacted resets (stale frontiers)
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);
  // Second round: peers send re-created events and catch up
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);

  assertEquals(alice.toPlain(), bob.toPlain());
});

// ── Late peer after compaction ─────────────────────────────────────────

Deno.test("SyncRoom late peer after compaction converges correctly", () => {
  const initial = { $tag: "root", counter: 0 } as const;
  const room = new SyncRoom("compact-late", initial);
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);
  const roomId = "compact-late";

  // Alice generates events
  generateEdits(alice, SyncRoom.MIN_EVENTS_FOR_COMPACTION + 10);

  // Both peers sync to get all events
  let aliceFrontiers = syncPeer(alice, room, roomId, []);
  let bobFrontiers = syncPeer(bob, room, roomId, []);

  // Second round
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);

  // Save Bob's frontiers before compaction
  const bobOldFrontiers = [...bobFrontiers];

  // Compact the room
  const compacted = room.tryCompact();
  assertEquals(compacted, true);

  // Alice adds more edits after compaction
  alice.set("counter", 777);
  // Alice gets compacted reset, then re-sends her event
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);

  // Bob reconnects with stale frontiers. He may get either a
  // compacted reset or a normal sync depending on event ID overlap.
  // Either way, the final state must converge.
  bobFrontiers = syncPeer(bob, room, roomId, bobOldFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);

  assertEquals(alice.toPlain(), bob.toPlain());
  const plain = alice.toPlain() as Record<string, unknown>;
  assertEquals(plain.counter, 777);
});

// ── Convergence after compaction ───────────────────────────────────────

Deno.test("SyncRoom convergence after compaction + continued editing", () => {
  const initial = {
    $tag: "root",
    counter: 0,
    name: "test",
  } as const;
  const room = new SyncRoom("compact-converge", initial);
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);
  const roomId = "compact-converge";

  // Generate events and sync
  generateEdits(alice, SyncRoom.MIN_EVENTS_FOR_COMPACTION + 5);
  let aliceFrontiers = syncPeer(alice, room, roomId, []);
  let bobFrontiers = syncPeer(bob, room, roomId, []);
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);

  // Compact
  room.tryCompact();

  // Both peers make new edits after compaction
  alice.set("name", "alice-post-compact");
  bob.set("name", "bob-post-compact");

  // Sync through multiple rounds to converge
  // First round: both get compacted resets
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);
  // Second round: send re-created events
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);
  // Third round: exchange all events
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);

  assertEquals(alice.toPlain(), bob.toPlain());
});

// ── No compaction with one peer ────────────────────────────────────────

Deno.test("SyncRoom no compaction with only one active peer", () => {
  const initial = { $tag: "root", counter: 0 } as const;
  const room = new SyncRoom("compact-one-peer", initial);
  const alice = new Denicek("alice", initial);
  const roomId = "compact-one-peer";

  generateEdits(alice, SyncRoom.MIN_EVENTS_FOR_COMPACTION + 10);
  syncPeer(alice, room, roomId, []);

  // Only one peer is active — compaction should not happen
  const compacted = room.tryCompact();
  assertEquals(compacted, false);
  assertEquals(room.eventCount > 0, true);
});

// ── Compaction doesn't lose un-synced edits ────────────────────────────

Deno.test("SyncRoom compaction preserves un-synced peer edits", () => {
  const initial = { $tag: "root", counter: 0, extra: "none" } as const;
  const room = new SyncRoom("compact-unsync", initial);
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);
  const roomId = "compact-unsync";

  // Sync both peers with enough events
  generateEdits(alice, SyncRoom.MIN_EVENTS_FOR_COMPACTION + 10);
  let aliceFrontiers = syncPeer(alice, room, roomId, []);
  let bobFrontiers = syncPeer(bob, room, roomId, []);
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);

  // Bob makes a local edit BEFORE compaction but doesn't sync it
  bob.set("extra", "bob-unseen");

  // Server compacts
  const compacted = room.tryCompact();
  assertEquals(compacted, true);

  // Bob syncs with his local unseen edit + stale frontiers
  const bobResponse = room.computeSyncResponse(
    createSyncRequest(bob, roomId, bobFrontiers),
  );

  // Bob's response includes compactedDocument because his frontier
  // references compacted events. After applying the reset, his local
  // pending edit is re-created against the compacted state.
  applySyncResponse(bob, bobResponse);
  bobFrontiers = bobResponse.frontiers;

  // Additional sync rounds: Bob sends re-created edit, Alice catches up
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  // Alice also got compacted reset, needs another round
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);

  assertEquals(alice.toPlain(), bob.toPlain());
  // Bob's edit should have survived
  const plain = alice.toPlain() as Record<string, unknown>;
  assertEquals(plain.extra, "bob-unseen");
});

// ── Compaction threshold not met ───────────────────────────────────────

Deno.test("SyncRoom no compaction when event count below threshold", () => {
  const initial = { $tag: "root", counter: 0 } as const;
  const room = new SyncRoom("compact-threshold", initial);
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);
  const roomId = "compact-threshold";

  // Generate only a few events (below threshold)
  generateEdits(alice, 5);
  syncPeer(alice, room, roomId, []);
  syncPeer(bob, room, roomId, []);

  const compacted = room.tryCompact();
  assertEquals(compacted, false);
});

// ── Peer activity timeout ──────────────────────────────────────────────

Deno.test("SyncRoom excludes inactive peers from compaction consensus", () => {
  const initial = { $tag: "root", counter: 0 } as const;
  const room = new SyncRoom("compact-timeout", initial);
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);
  const roomId = "compact-timeout";

  generateEdits(alice, SyncRoom.MIN_EVENTS_FOR_COMPACTION + 10);

  // Both peers sync
  syncPeer(alice, room, roomId, []);
  syncPeer(bob, room, roomId, []);

  // Simulate both peers going inactive — pass a future time
  const futureTime = Date.now() + SyncRoom.PEER_ACTIVITY_TIMEOUT_MS + 1000;
  const compacted = room.tryCompact(futureTime);
  assertEquals(compacted, false);
});

// ── computeMinAcknowledgedFrontier basics ──────────────────────────────

Deno.test("SyncRoom computeMinAcknowledgedFrontier returns null with no peers", () => {
  const room = new SyncRoom("compact-min-frontier-empty");
  assertEquals(room.computeMinAcknowledgedFrontier(), null);
});

Deno.test("SyncRoom computeMinAcknowledgedFrontier returns frontier when all peers agree", () => {
  const initial = { $tag: "root", counter: 0 } as const;
  const room = new SyncRoom("compact-min-frontier-agree", initial);
  const alice = new Denicek("alice", initial);
  const bob = new Denicek("bob", initial);
  const roomId = "compact-min-frontier-agree";

  alice.set("counter", 42);
  let aliceFrontiers = syncPeer(alice, room, roomId, []);
  let bobFrontiers = syncPeer(bob, room, roomId, []);

  // Second round so both have the full state
  aliceFrontiers = syncPeer(alice, room, roomId, aliceFrontiers);
  bobFrontiers = syncPeer(bob, room, roomId, bobFrontiers);

  const minFrontier = room.computeMinAcknowledgedFrontier();
  assertEquals(minFrontier !== null, true);
  assertEquals(minFrontier, room.frontiers);
});
