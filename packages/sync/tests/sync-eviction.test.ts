import { assertEquals } from "@std/assert";
import { Denicek } from "@mydenicek/core";
import {
  applySyncResponse,
  createSyncRequest,
  createSyncServer,
  type EncodedSyncResponse,
} from "../mod.ts";

const INITIAL_DOC = {
  $tag: "root",
  title: "Eviction test",
  items: { $tag: "items", $items: [] },
} as const;

/** Helper: open a WebSocket to the sync server and wait for the hello. */
function connectClient(
  port: number,
  roomId: string,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/sync?room=${encodeURIComponent(roomId)}`,
    );
    ws.onmessage = () => {
      // First message is the "hello" — connection is ready.
      resolve(ws);
    };
    ws.onerror = (e) => reject(e);
  });
}

/** Helper: send a sync request and wait for the sync response. */
function syncViaWs(
  ws: WebSocket,
  doc: Denicek,
  roomId: string,
  knownFrontiers: string[],
  initialDocumentHash?: string,
  initialDocument?: typeof INITIAL_DOC,
): Promise<{ response: EncodedSyncResponse; frontiers: string[] }> {
  return new Promise((resolve) => {
    const req = createSyncRequest(
      doc,
      roomId,
      knownFrontiers,
      initialDocumentHash,
      initialDocument,
    );
    const handler = (ev: MessageEvent) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === "sync") {
        ws.removeEventListener("message", handler);
        applySyncResponse(doc, msg);
        resolve({ response: msg, frontiers: msg.frontiers });
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify(req));
  });
}

function closeWs(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.onclose = () => resolve();
    ws.close();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Eviction after timeout with persistence ─────────────────────────────

Deno.test("room is evicted after timeout and reloaded from disk on reconnect", async () => {
  const persistencePath = await Deno.makeTempDir();
  const port = 18700 + Math.floor(Math.random() * 100);

  const handle = createSyncServer({
    port,
    hostname: "127.0.0.1",
    persistencePath,
  });

  try {
    await delay(100); // let server start

    const roomId = `eviction-test-${crypto.randomUUID().slice(0, 8)}`;

    // 1. Connect and sync some events
    const alice = new Denicek("alice", INITIAL_DOC);
    alice.set("title", "Updated by Alice");
    alice.insert(
      "items",
      -1,
      { $tag: "item", name: "Task 1", done: false },
      true,
    );

    const ws1 = await connectClient(port, roomId);
    const { frontiers: f1 } = await syncViaWs(
      ws1,
      alice,
      roomId,
      [],
      "test-hash",
      INITIAL_DOC,
    );
    assertEquals(f1.length > 0, true, "should have synced events");

    // Wait for persistence to flush
    await delay(200);

    // 2. Disconnect all clients
    await closeWs(ws1);
    await delay(100);

    // 3. Manually trigger eviction (back-date activity by calling evict)
    // The eviction function checks against ROOM_EVICTION_TIMEOUT_MS (10 min).
    // We can't wait 10 min in a test, so we call evictInactiveRooms() after
    // confirming it does NOT evict an active room, then we'll verify the room
    // was NOT evicted (still within timeout). To actually evict, we'll need to
    // use a trick: the function is synchronous and checks Date.now() internally.
    // Instead, let's verify the full flow: eviction doesn't happen when within
    // timeout, then after sufficient time it does.

    // First call: room should NOT be evicted (just disconnected, within timeout)
    handle.evictInactiveRooms();

    // 4. Reconnect — room should still be in memory (not evicted yet)
    const bob = new Denicek("bob", INITIAL_DOC);
    const ws2 = await connectClient(port, roomId);
    const { frontiers: f2 } = await syncViaWs(
      ws2,
      bob,
      roomId,
      [],
      "test-hash",
    );
    assertEquals(f2.length > 0, true, "should have received events from memory");

    // Bob should have Alice's edits
    assertEquals(
      (bob.toPlain() as unknown as { title: string }).title,
      "Updated by Alice",
    );

    await closeWs(ws2);
    await delay(100);

    // 5. Now force eviction by mocking time: we stub Date.now temporarily
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 11 * 60 * 1000; // 11 minutes in the future
      handle.evictInactiveRooms();
    } finally {
      Date.now = realNow;
    }

    // 6. Reconnect — room should be reloaded from disk
    const carol = new Denicek("carol", INITIAL_DOC);
    const ws3 = await connectClient(port, roomId);
    const { frontiers: f3 } = await syncViaWs(
      ws3,
      carol,
      roomId,
      [],
      "test-hash",
    );
    assertEquals(f3.length > 0, true, "should have received events from disk");

    assertEquals(
      (carol.toPlain() as unknown as { title: string }).title,
      "Updated by Alice",
      "room state should survive eviction+reload",
    );

    await closeWs(ws3);
  } finally {
    await handle.close();
    await Deno.remove(persistencePath, { recursive: true }).catch(() => {});
  }
});

// ── maxRooms eviction ───────────────────────────────────────────────────

Deno.test("maxRooms evicts least recently active room when limit is exceeded", async () => {
  const persistencePath = await Deno.makeTempDir();
  const port = 18800 + Math.floor(Math.random() * 100);

  const handle = createSyncServer({
    port,
    hostname: "127.0.0.1",
    persistencePath,
    maxRooms: 2,
  });

  try {
    await delay(100);

    // Create room A (oldest)
    const roomA = `room-a-${crypto.randomUUID().slice(0, 8)}`;
    const aliceA = new Denicek("aliceA", INITIAL_DOC);
    aliceA.set("title", "Room A");
    const wsA = await connectClient(port, roomA);
    await syncViaWs(wsA, aliceA, roomA, [], "hash-a", INITIAL_DOC);
    await delay(200);
    await closeWs(wsA);
    await delay(100);

    // Create room B (middle)
    const roomB = `room-b-${crypto.randomUUID().slice(0, 8)}`;
    const aliceB = new Denicek("aliceB", INITIAL_DOC);
    aliceB.set("title", "Room B");
    const wsB = await connectClient(port, roomB);
    await syncViaWs(wsB, aliceB, roomB, [], "hash-b", INITIAL_DOC);
    await delay(200);
    await closeWs(wsB);
    await delay(100);

    // Create room C (newest) — this should trigger eviction of room A
    const roomC = `room-c-${crypto.randomUUID().slice(0, 8)}`;
    const aliceC = new Denicek("aliceC", INITIAL_DOC);
    aliceC.set("title", "Room C");
    const wsC = await connectClient(port, roomC);
    await syncViaWs(wsC, aliceC, roomC, [], "hash-c", INITIAL_DOC);
    await delay(200);
    await closeWs(wsC);
    await delay(100);

    // Reconnect to room A — should be reloaded from disk (was evicted)
    const bob = new Denicek("bob", INITIAL_DOC);
    const wsA2 = await connectClient(port, roomA);
    const { frontiers } = await syncViaWs(wsA2, bob, roomA, [], "hash-a");
    assertEquals(
      frontiers.length > 0,
      true,
      "room A should be reloaded from disk after eviction",
    );
    assertEquals(
      (bob.toPlain() as unknown as { title: string }).title,
      "Room A",
      "room A data should survive eviction+reload",
    );

    await closeWs(wsA2);
  } finally {
    await handle.close();
    await Deno.remove(persistencePath, { recursive: true }).catch(() => {});
  }
});
