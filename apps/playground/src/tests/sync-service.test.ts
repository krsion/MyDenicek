import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { PeerSession } from "../peer-session.ts";
import { InMemorySyncService } from "../sync-service.ts";
import type { PlainNode } from "@mydenicek/core";

const INITIAL_DOC: PlainNode = { $tag: "root", value: "init" };

describe("InMemorySyncService", () => {
  it("push transfers events from source to target", () => {
    const service = new InMemorySyncService();
    const alice = new PeerSession("alice", INITIAL_DOC);
    const bob = new PeerSession("bob", INITIAL_DOC);
    alice.set("value", "hello");
    service.push(alice, bob);
    expect(bob.snapshot().events).toHaveLength(1);
    expect((bob.snapshot().doc as unknown as { value: string }).value).toBe(
      "hello",
    );
  });

  it("push is one-directional", () => {
    const service = new InMemorySyncService();
    const alice = new PeerSession("alice", INITIAL_DOC);
    const bob = new PeerSession("bob", INITIAL_DOC);
    alice.set("value", "alice-val");
    bob.set("value", "bob-val");
    service.push(alice, bob);
    // Bob got alice's events but alice doesn't know bob's
    expect(alice.snapshot().events).toHaveLength(1);
    expect(bob.snapshot().events).toHaveLength(2);
  });

  it("sync is bidirectional", () => {
    const service = new InMemorySyncService();
    const alice = new PeerSession("alice", INITIAL_DOC);
    const bob = new PeerSession("bob", INITIAL_DOC);
    alice.set("value", "alice-val");
    bob.set("value", "bob-val");
    service.sync(alice, bob);
    expect(alice.snapshot().events).toHaveLength(2);
    expect(bob.snapshot().events).toHaveLength(2);
    // Both converge
    expect(JSON.stringify(alice.snapshot().doc)).toBe(
      JSON.stringify(bob.snapshot().doc),
    );
  });

  it("syncAll converges all peers", () => {
    const service = new InMemorySyncService();
    const alice = new PeerSession("alice", INITIAL_DOC);
    const bob = new PeerSession("bob", INITIAL_DOC);
    const carol = new PeerSession("carol", INITIAL_DOC);
    alice.set("value", "a");
    bob.set("value", "b");
    carol.set("value", "c");
    service.syncAll([alice, bob, carol]);
    const aliceDoc = JSON.stringify(alice.snapshot().doc);
    const bobDoc = JSON.stringify(bob.snapshot().doc);
    const carolDoc = JSON.stringify(carol.snapshot().doc);
    expect(aliceDoc).toBe(bobDoc);
    expect(bobDoc).toBe(carolDoc);
    expect(alice.snapshot().events).toHaveLength(3);
  });

  it("sync is idempotent", () => {
    const service = new InMemorySyncService();
    const alice = new PeerSession("alice", INITIAL_DOC);
    const bob = new PeerSession("bob", INITIAL_DOC);
    alice.set("value", "hello");
    service.sync(alice, bob);
    service.sync(alice, bob);
    service.sync(alice, bob);
    // No duplicated events
    expect(alice.snapshot().events).toHaveLength(1);
    expect(bob.snapshot().events).toHaveLength(1);
  });
});
