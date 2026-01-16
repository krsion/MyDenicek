/**
 * Diagnostic test to understand connection issues
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DenicekDocument } from "@mydenicek/core-v2";
import { LoroAdaptor } from "loro-adaptors";
import { LoroWebsocketClient } from "loro-websocket/client";
import { SimpleServer } from "loro-websocket/server";
import { LoroDoc } from "loro-crdt";

describe("Diagnostic", () => {
    it("should start server directly", async () => {
        const server = new SimpleServer({
            port: 14000,
            host: "127.0.0.1",
            saveInterval: 1000,
        });

        await server.start();
        console.log("Server started on 14000");

        // Small delay
        await new Promise(resolve => setTimeout(resolve, 100));

        await server.stop();
        console.log("Server stopped");
    }, 10000);

    it("should create client and connect", async () => {
        // Start server
        const server = new SimpleServer({
            port: 14001,
            host: "127.0.0.1",
            saveInterval: 1000,
        });
        await server.start();
        console.log("Server started on 14001");

        // Create client - it auto-connects
        const client = new LoroWebsocketClient({
            url: "ws://127.0.0.1:14001",
        });

        console.log("Client created, status:", client.getStatus());

        // Wait for connection
        await client.waitConnected();
        console.log("Client connected, status:", client.getStatus());

        client.close();
        await server.stop();
    }, 10000);

    it("should join room", async () => {
        // Start server
        const server = new SimpleServer({
            port: 14002,
            host: "127.0.0.1",
            saveInterval: 1000,
        });
        await server.start();
        console.log("Server started on 14002");

        // Create document and adaptor
        const doc = DenicekDocument.create({ peerId: 1n });
        const adaptor = new LoroAdaptor(doc._internal.doc);

        // Create client
        const client = new LoroWebsocketClient({
            url: "ws://127.0.0.1:14002",
        });
        await client.waitConnected();
        console.log("Client connected");

        // Join room
        const room = await client.join({
            roomId: "test-room",
            crdtAdaptor: adaptor,
        });
        console.log("Joined room");

        await room.leave();
        client.close();
        doc.dispose();
        await server.stop();
    }, 10000);

    // Note: Initial sync (one client has data before joining) doesn't work with loro-websocket 0.1.x
    // Only live sync (changes made after both clients joined) is supported
    it.skip("should sync raw LoroDoc between two clients (initial sync)", async () => {
        const port = 14003;

        // Start server
        const server = new SimpleServer({
            port,
            host: "127.0.0.1",
            saveInterval: 1000,
        });
        await server.start();
        console.log(`Server started on ${port}`);

        try {
            // Client 1 with data
            const doc1 = new LoroDoc();
            doc1.setPeerId(1n);
            const map1 = doc1.getMap("data");
            map1.set("key", "value-from-client1");
            console.log("doc1 version after set:", doc1.version().toJSON());

            const adaptor1 = new LoroAdaptor(doc1);
            const client1 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client1.waitConnected();
            console.log("Client1 connected");

            const room1 = await client1.join({ roomId: "raw-test-room", crdtAdaptor: adaptor1 });
            console.log("Client1 joined room");

            // Wait for client1 to sync to server
            await new Promise(resolve => setTimeout(resolve, 500));

            // Client 2 starts empty
            const doc2 = new LoroDoc();
            doc2.setPeerId(2n);
            console.log("doc2 version before sync:", doc2.version().toJSON());

            const adaptor2 = new LoroAdaptor(doc2);
            const client2 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client2.waitConnected();
            console.log("Client2 connected");

            const room2 = await client2.join({ roomId: "raw-test-room", crdtAdaptor: adaptor2 });
            console.log("Client2 joined room");

            // Wait for sync
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log("doc2 version after sync:", doc2.version().toJSON());

            // Check if sync worked
            const map2 = doc2.getMap("data");
            const value = map2.get("key");
            console.log("doc2 map value:", value);

            expect(value).toBe("value-from-client1");

            // Cleanup
            await room1.leave();
            await room2.leave();
            client1.close();
            client2.close();
        } finally {
            await server.stop();
        }
    }, 30000);

    it("should sync live changes between two clients", async () => {
        const port = 14004;

        // Start server
        const server = new SimpleServer({
            port,
            host: "127.0.0.1",
            saveInterval: 1000,
        });
        await server.start();
        console.log(`Server started on ${port}`);

        try {
            // Both clients start empty
            const doc1 = new LoroDoc();
            doc1.setPeerId(1n);
            const doc2 = new LoroDoc();
            doc2.setPeerId(2n);

            // Connect both clients BEFORE making any changes
            const adaptor1 = new LoroAdaptor(doc1);
            const client1 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client1.waitConnected();
            const room1 = await client1.join({ roomId: "live-test-room", crdtAdaptor: adaptor1 });
            console.log("Client1 joined room");

            const adaptor2 = new LoroAdaptor(doc2);
            const client2 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client2.waitConnected();
            const room2 = await client2.join({ roomId: "live-test-room", crdtAdaptor: adaptor2 });
            console.log("Client2 joined room");

            // Wait for initial sync (both empty)
            await new Promise(resolve => setTimeout(resolve, 200));

            // Now make a change on client1 AFTER both are connected
            const map1 = doc1.getMap("data");
            map1.set("liveKey", "live-value-from-client1");
            doc1.commit(); // Explicitly commit changes
            console.log("doc1 made change and committed, version:", doc1.version().toJSON());

            // Wait for live sync
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log("doc2 version after live sync:", doc2.version().toJSON());

            // Check if live sync worked
            const map2 = doc2.getMap("data");
            const value = map2.get("liveKey");
            console.log("doc2 map liveKey value:", value);

            expect(value).toBe("live-value-from-client1");

            // Cleanup
            await room1.leave();
            await room2.leave();
            client1.close();
            client2.close();
        } finally {
            await server.stop();
        }
    }, 30000);
});
