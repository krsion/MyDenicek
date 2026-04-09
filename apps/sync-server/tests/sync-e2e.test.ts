import { assertEquals } from "@std/assert";
import { Denicek } from "@mydenicek/core";
import { createSyncServer, SyncClient } from "@mydenicek/sync-server";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until condition is true, polling every intervalMs. */
async function waitFor(
  condition: () => boolean,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for condition");
    }
    await delay(intervalMs);
  }
}

function startTestServer(): { handle: SyncServerHandle; url: string } {
  const handle = createSyncServer({ port: 0, persistencePath: undefined });
  const port = handle.server.addr.port;
  return { handle, url: `ws://127.0.0.1:${port}/sync` };
}

Deno.test({
  name: "two peers sync edits through the server",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const roomId = `room-${crypto.randomUUID().slice(0, 6)}`;

    // Both peers start from { $tag: "root" } — the same default as the server
    const dkA = new Denicek("peerA");
    const dkB = new Denicek("peerB");

    const clientA = new SyncClient({
      url,
      roomId,
      document: dkA,
      autoSyncIntervalMs: 100,
    });
    const clientB = new SyncClient({
      url,
      roomId,
      document: dkB,
      autoSyncIntervalMs: 100,
    });

    try {
      await clientA.connect();
      await clientB.connect();
      await delay(300);

      dkA.add("", "value", 42);

      await waitFor(
        () => (dkB.materialize() as Record<string, unknown>).value === 42,
      );

      assertEquals(dkA.materialize(), dkB.materialize());
    } finally {
      clientA.close();
      clientB.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "peer joining late receives full history",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const roomId = `room-${crypto.randomUUID().slice(0, 6)}`;

    const dkA = new Denicek("peerA");
    const clientA = new SyncClient({
      url,
      roomId,
      document: dkA,
      autoSyncIntervalMs: 100,
    });

    try {
      await clientA.connect();
      await delay(300);

      dkA.add("", "x", 10);
      dkA.add("", "y", 20);

      // Wait for auto-sync to push all events
      await delay(500);

      // B joins later
      const dkB = new Denicek("peerB");
      const clientB = new SyncClient({
        url,
        roomId,
        document: dkB,
        autoSyncIntervalMs: 100,
      });

      await clientB.connect();

      await waitFor(() => {
        const doc = dkB.materialize() as Record<string, unknown>;
        return doc.x === 10 && doc.y === 20;
      });

      assertEquals(dkB.materialize(), dkA.materialize());

      clientB.close();
    } finally {
      clientA.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "concurrent edits from both peers converge",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const roomId = `room-${crypto.randomUUID().slice(0, 6)}`;

    const dkA = new Denicek("peerA");
    const dkB = new Denicek("peerB");

    const clientA = new SyncClient({
      url,
      roomId,
      document: dkA,
      autoSyncIntervalMs: 100,
    });
    const clientB = new SyncClient({
      url,
      roomId,
      document: dkB,
      autoSyncIntervalMs: 100,
    });

    try {
      await clientA.connect();
      await clientB.connect();
      await delay(300);

      // Both edit concurrently — adding different fields
      dkA.add("", "x", 10);
      dkB.add("", "y", 20);

      await waitFor(() => {
        const a = dkA.materialize() as Record<string, unknown>;
        const b = dkB.materialize() as Record<string, unknown>;
        return a.x === 10 && a.y === 20 && b.x === 10 && b.y === 20;
      });

      assertEquals(dkA.materialize(), dkB.materialize());
    } finally {
      clientA.close();
      clientB.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "sync recovers after reconnect (simulated message loss)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const roomId = `room-${crypto.randomUUID().slice(0, 6)}`;

    const dkA = new Denicek("peerA");
    const dkB = new Denicek("peerB");

    const clientA = new SyncClient({
      url,
      roomId,
      document: dkA,
      autoSyncIntervalMs: 100,
    });

    try {
      await clientA.connect();
      await delay(300);

      // A adds a field
      dkA.add("", "step", 1);
      await delay(300);

      // B connects, receives the add
      const clientB1 = new SyncClient({
        url,
        roomId,
        document: dkB,
        autoSyncIntervalMs: 100,
      });
      await clientB1.connect();
      await waitFor(
        () => (dkB.materialize() as Record<string, unknown>).step === 1,
      );

      // B disconnects (simulates network loss)
      clientB1.close();

      // A makes more edits while B is offline
      dkA.set("step", 2);
      dkA.set("step", 3);
      await delay(300);

      // B reconnects — should catch up
      const clientB2 = new SyncClient({
        url,
        roomId,
        document: dkB,
        autoSyncIntervalMs: 100,
      });
      await clientB2.connect();

      await waitFor(
        () => (dkB.materialize() as Record<string, unknown>).step === 3,
      );

      assertEquals(dkA.materialize(), dkB.materialize());

      clientB2.close();
    } finally {
      clientA.close();
      await handle.close();
    }
  },
});
