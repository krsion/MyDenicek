import { assertEquals } from "@std/assert";
import { Denicek } from "@mydenicek/core";
import {
  computeDocumentHash,
  createSyncServer,
  SyncClient,
} from "@mydenicek/sync";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  condition: () => boolean,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting");
    await delay(intervalMs);
  }
}

function startTestServer() {
  const handle = createSyncServer({ port: 0, persistencePath: undefined });
  const port = handle.server.addr.port;
  return { handle, url: `ws://127.0.0.1:${port}/sync` };
}

Deno.test({
  name: "two peers sync edits",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const room = `r-${crypto.randomUUID().slice(0, 6)}`;
    const dkA = new Denicek("peerA");
    const dkB = new Denicek("peerB");
    const cA = new SyncClient({
      url,
      roomId: room,
      document: dkA,
      autoSyncIntervalMs: 100,
    });
    const cB = new SyncClient({
      url,
      roomId: room,
      document: dkB,
      autoSyncIntervalMs: 100,
    });
    try {
      await cA.connect();
      await cB.connect();
      await delay(300);
      dkA.add("", "value", 42);
      await waitFor(
        () => (dkB.materialize() as Record<string, unknown>).value === 42,
      );
      assertEquals(dkA.materialize(), dkB.materialize());
    } finally {
      cA.close();
      cB.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "late-joining peer receives full history",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const room = `r-${crypto.randomUUID().slice(0, 6)}`;
    const dkA = new Denicek("peerA");
    const cA = new SyncClient({
      url,
      roomId: room,
      document: dkA,
      autoSyncIntervalMs: 100,
    });
    try {
      await cA.connect();
      await delay(300);
      dkA.add("", "x", 10);
      dkA.add("", "y", 20);
      await delay(500);

      const dkB = new Denicek("peerB");
      const cB = new SyncClient({
        url,
        roomId: room,
        document: dkB,
        autoSyncIntervalMs: 100,
      });
      await cB.connect();
      await waitFor(() => {
        const d = dkB.materialize() as Record<string, unknown>;
        return d.x === 10 && d.y === 20;
      });
      assertEquals(dkB.materialize(), dkA.materialize());
      cB.close();
    } finally {
      cA.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "concurrent edits converge",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const room = `r-${crypto.randomUUID().slice(0, 6)}`;
    const dkA = new Denicek("peerA");
    const dkB = new Denicek("peerB");
    const cA = new SyncClient({
      url,
      roomId: room,
      document: dkA,
      autoSyncIntervalMs: 100,
    });
    const cB = new SyncClient({
      url,
      roomId: room,
      document: dkB,
      autoSyncIntervalMs: 100,
    });
    try {
      await cA.connect();
      await cB.connect();
      await delay(300);
      dkA.add("", "x", 10);
      dkB.add("", "y", 20);
      await waitFor(() => {
        const a = dkA.materialize() as Record<string, unknown>;
        const b = dkB.materialize() as Record<string, unknown>;
        return a.x === 10 && a.y === 20 && b.x === 10 && b.y === 20;
      });
      assertEquals(dkA.materialize(), dkB.materialize());
    } finally {
      cA.close();
      cB.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "sync recovers after reconnect",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const room = `r-${crypto.randomUUID().slice(0, 6)}`;
    const dkA = new Denicek("peerA");
    const dkB = new Denicek("peerB");
    const initialHash = await computeDocumentHash(dkA.materialize());
    const cA = new SyncClient({
      url,
      roomId: room,
      document: dkA,
      autoSyncIntervalMs: 100,
      initialDocumentHash: initialHash,
    });
    try {
      await cA.connect();
      await delay(300);
      dkA.add("", "step", 1);
      await delay(300);

      const cB1 = new SyncClient({
        url,
        roomId: room,
        document: dkB,
        autoSyncIntervalMs: 100,
        initialDocumentHash: initialHash,
      });
      await cB1.connect();
      await waitFor(
        () => (dkB.materialize() as Record<string, unknown>).step === 1,
      );
      cB1.close();

      dkA.set("step", 2);
      dkA.set("step", 3);
      await delay(300);

      const cB2 = new SyncClient({
        url,
        roomId: room,
        document: dkB,
        autoSyncIntervalMs: 100,
        initialDocumentHash: initialHash,
      });
      await cB2.connect();
      await waitFor(
        () => (dkB.materialize() as Record<string, unknown>).step === 3,
      );
      assertEquals(dkA.materialize(), dkB.materialize());
      cB2.close();
    } finally {
      cA.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "server rejects mismatched initial document",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const room = `r-${crypto.randomUUID().slice(0, 6)}`;

    // A uses default { $tag: "root" }
    const dkA = new Denicek("peerA");
    const cA = new SyncClient({
      url,
      roomId: room,
      document: dkA,
      autoSyncIntervalMs: 100,
    });

    // B uses a DIFFERENT initial doc
    const dkB = new Denicek("peerB", { $tag: "different", data: "mismatch" });

    try {
      await cA.connect();
      await delay(300);
      dkA.add("", "x", 1);
      await delay(300);

      const cB = new SyncClient({
        url,
        roomId: room,
        document: dkB,
        autoSyncIntervalMs: 100,
      });
      await cB.connect();
      await delay(1000);

      // B should NOT have A's edits — server rejected the mismatched hash
      const bDoc = dkB.materialize() as Record<string, unknown>;
      assertEquals(bDoc.x, undefined, "B should not have A's edits");

      cB.close();
    } finally {
      cA.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "custom initial document: set works via server bootstrap",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const room = `r-${crypto.randomUUID().slice(0, 6)}`;

    const initial = { $tag: "app", counter: { $tag: "p", count: 0 } };
    const hash = await computeDocumentHash(initial);

    const dkA = new Denicek("peerA", initial);
    const dkB = new Denicek("peerB", initial);

    const cA = new SyncClient({
      url,
      roomId: room,
      document: dkA,
      autoSyncIntervalMs: 100,
      initialDocumentHash: hash,
    });
    const cB = new SyncClient({
      url,
      roomId: room,
      document: dkB,
      autoSyncIntervalMs: 100,
      initialDocumentHash: hash,
    });

    try {
      await cA.connect();
      await cB.connect();
      await delay(300);

      dkA.set("counter/count", 5);

      await waitFor(() => {
        const d = dkB.materialize() as Record<string, Record<string, unknown>>;
        return d.counter?.count === 5;
      });

      assertEquals(dkA.materialize(), dkB.materialize());

      dkA.set("counter/count", 10);
      await waitFor(() => {
        const d = dkB.materialize() as Record<string, Record<string, unknown>>;
        return d.counter?.count === 10;
      });

      assertEquals(dkA.materialize(), dkB.materialize());
    } finally {
      cA.close();
      cB.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "paused client does not send or receive edits",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const room = `r-${crypto.randomUUID().slice(0, 6)}`;
    const dkA = new Denicek("peerA");
    const dkB = new Denicek("peerB");
    const cA = new SyncClient({
      url,
      roomId: room,
      document: dkA,
      autoSyncIntervalMs: 100,
    });
    const cB = new SyncClient({
      url,
      roomId: room,
      document: dkB,
      autoSyncIntervalMs: 100,
    });
    try {
      await cA.connect();
      await cB.connect();
      await delay(300);

      // Verify sync works first
      dkA.add("", "x", 1);
      await waitFor(() =>
        (dkB.materialize() as Record<string, unknown>).x === 1
      );

      // Pause B
      cB.pause();
      await delay(200);

      // A edits while B is paused
      dkA.set("x", 99);
      await delay(500);

      // B should NOT have the edit
      assertEquals(
        (dkB.materialize() as Record<string, unknown>).x,
        1,
        "paused B must not receive edits",
      );

      // Resume B — should catch up
      cB.resume();
      await waitFor(() =>
        (dkB.materialize() as Record<string, unknown>).x === 99
      );
      assertEquals(dkA.materialize(), dkB.materialize());
    } finally {
      cA.close();
      cB.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "paused client does not send its edits",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const room = `r-${crypto.randomUUID().slice(0, 6)}`;
    const dkA = new Denicek("peerA");
    const dkB = new Denicek("peerB");
    const cA = new SyncClient({
      url,
      roomId: room,
      document: dkA,
      autoSyncIntervalMs: 100,
    });
    const cB = new SyncClient({
      url,
      roomId: room,
      document: dkB,
      autoSyncIntervalMs: 100,
    });
    try {
      await cA.connect();
      await cB.connect();
      await delay(300);

      // Verify sync works
      dkA.add("", "x", 1);
      await waitFor(() =>
        (dkB.materialize() as Record<string, unknown>).x === 1
      );

      // Pause A
      cA.pause();
      await delay(200);

      // A edits while paused
      dkA.set("x", 999);
      await delay(500);

      // B should NOT see the edit from paused A
      assertEquals(
        (dkB.materialize() as Record<string, unknown>).x,
        1,
        "B must not see paused A's edit",
      );

      // Resume A — B should now see the edit
      cA.resume();
      await waitFor(() =>
        (dkB.materialize() as Record<string, unknown>).x === 999
      );
      assertEquals(dkA.materialize(), dkB.materialize());
    } finally {
      cA.close();
      cB.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "pause buffers incoming messages and replays on resume",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const room = `r-${crypto.randomUUID().slice(0, 6)}`;
    const dkA = new Denicek("peerA");
    const dkB = new Denicek("peerB");
    const cA = new SyncClient({
      url,
      roomId: room,
      document: dkA,
      autoSyncIntervalMs: 100,
    });
    const cB = new SyncClient({
      url,
      roomId: room,
      document: dkB,
      autoSyncIntervalMs: 100,
    });
    try {
      await cA.connect();
      await cB.connect();
      await delay(300);

      dkA.add("", "x", 1);
      await waitFor(() =>
        (dkB.materialize() as Record<string, unknown>).x === 1
      );

      // Pause B — socket stays open, messages buffered
      cB.pause();
      await delay(100);

      // A makes edits while B is paused
      dkA.set("x", 10);
      dkA.add("", "y", 20);
      await delay(500);

      // B has NOT applied them
      const bBefore = dkB.materialize() as Record<string, unknown>;
      assertEquals(bBefore.x, 1);
      assertEquals(bBefore.y, undefined);

      // Resume B — buffered messages replayed
      cB.resume();
      await waitFor(() => {
        const d = dkB.materialize() as Record<string, unknown>;
        return d.x === 10 && d.y === 20;
      });
      assertEquals(dkA.materialize(), dkB.materialize());
    } finally {
      cA.close();
      cB.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "hard disconnect and reconnect syncs accumulated edits",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const room = `r-${crypto.randomUUID().slice(0, 6)}`;
    const dkA = new Denicek("peerA");
    const dkB = new Denicek("peerB");
    const hash = await computeDocumentHash(dkA.materialize());
    const cA = new SyncClient({
      url,
      roomId: room,
      document: dkA,
      autoSyncIntervalMs: 100,
      initialDocumentHash: hash,
    });
    try {
      await cA.connect();
      await delay(300);

      dkA.add("", "step", 1);
      await delay(300);

      const cB1 = new SyncClient({
        url,
        roomId: room,
        document: dkB,
        autoSyncIntervalMs: 100,
        initialDocumentHash: hash,
      });
      await cB1.connect();
      await waitFor(() =>
        (dkB.materialize() as Record<string, unknown>).step === 1
      );

      // B hard disconnects
      cB1.close();

      // A edits while B is offline
      dkA.set("step", 2);
      dkA.set("step", 3);
      await delay(300);

      assertEquals((dkB.materialize() as Record<string, unknown>).step, 1);

      // B reconnects — must pass same initial hash
      const cB2 = new SyncClient({
        url,
        roomId: room,
        document: dkB,
        autoSyncIntervalMs: 100,
        initialDocumentHash: hash,
      });
      await cB2.connect();
      await waitFor(() =>
        (dkB.materialize() as Record<string, unknown>).step === 3
      );
      assertEquals(dkA.materialize(), dkB.materialize());

      // B edits after reconnect — A gets them
      dkB.set("step", 99);
      await waitFor(() =>
        (dkA.materialize() as Record<string, unknown>).step === 99
      );
      assertEquals(dkA.materialize(), dkB.materialize());

      cB2.close();
    } finally {
      cA.close();
      await handle.close();
    }
  },
});

Deno.test({
  name: "hard disconnect: offline edits sync after reconnect",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { handle, url } = startTestServer();
    const room = `r-${crypto.randomUUID().slice(0, 6)}`;
    const dkA = new Denicek("peerA");
    const dkB = new Denicek("peerB");
    const hash = await computeDocumentHash(dkA.materialize());
    const cA = new SyncClient({
      url,
      roomId: room,
      document: dkA,
      autoSyncIntervalMs: 100,
      initialDocumentHash: hash,
    });
    const cB1 = new SyncClient({
      url,
      roomId: room,
      document: dkB,
      autoSyncIntervalMs: 100,
      initialDocumentHash: hash,
    });
    try {
      await cA.connect();
      await cB1.connect();
      await delay(300);

      dkA.add("", "v", 0);
      await waitFor(() =>
        (dkB.materialize() as Record<string, unknown>).v === 0
      );

      // B disconnects
      cB1.close();

      // BOTH edit while disconnected
      dkA.set("v", 10);
      dkB.set("v", 20);
      await delay(300);

      // B reconnects with same initial hash
      const cB2 = new SyncClient({
        url,
        roomId: room,
        document: dkB,
        autoSyncIntervalMs: 100,
        initialDocumentHash: hash,
      });
      await cB2.connect();
      await waitFor(() => {
        return JSON.stringify(dkA.materialize()) ===
          JSON.stringify(dkB.materialize());
      });
      assertEquals(dkA.materialize(), dkB.materialize());

      cB2.close();
    } finally {
      cA.close();
      await handle.close();
    }
  },
});
