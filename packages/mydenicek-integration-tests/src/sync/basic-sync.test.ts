/**
 * Basic sync integration tests
 *
 * Tests the fundamental sync behavior: two clients connecting to the same room
 * and synchronizing document changes.
 */

import { describe, it, expect } from "vitest";
import { DenicekDocument } from "@mydenicek/core-v2";
import { LoroAdaptor } from "loro-adaptors";
import { LoroWebsocketClient } from "loro-websocket/client";
import { SimpleServer } from "loro-websocket/server";

let portCounter = 15000;

function getPort(): number {
    return portCounter++;
}

describe("Basic Sync", () => {
    it("should sync live changes between clients (both empty at join time)", async () => {
        const port = getPort();

        // Start server
        const server = new SimpleServer({
            port,
            host: "127.0.0.1",
            saveInterval: 1000,
        });
        await server.start();

        try {
            // Both clients start with EMPTY documents
            const doc1 = new DenicekDocument({ peerId: 1n });
            const doc2 = new DenicekDocument({ peerId: 2n });

            // Connect both clients BEFORE making any changes
            const client1 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client1.waitConnected();
            const adaptor1 = new LoroAdaptor(doc1._internal.doc);
            const room1 = await client1.join({ roomId: "test-room", crdtAdaptor: adaptor1 });

            const client2 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client2.waitConnected();
            const adaptor2 = new LoroAdaptor(doc2._internal.doc);
            const room2 = await client2.join({ roomId: "test-room", crdtAdaptor: adaptor2 });

            // Wait for initial sync (both empty)
            await new Promise(resolve => setTimeout(resolve, 200));

            // Now initialize document on client1 AFTER both are connected
            doc1.change((model) => {
                model.initializeDocument();
            });

            // Wait for sync between clients
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify both documents have the same root
            expect(doc1.getRootId()).toBeDefined();
            expect(doc2.getRootId()).toBe(doc1.getRootId());

            // Cleanup
            await room1.leave();
            await room2.leave();
            client1.close();
            client2.close();
            doc1.dispose();
            doc2.dispose();
        } finally {
            await server.stop();
        }
    }, 30000);

    it("should sync node creation from client1 to client2", async () => {
        const port = getPort();

        const server = new SimpleServer({
            port,
            host: "127.0.0.1",
            saveInterval: 1000,
        });
        await server.start();

        try {
            // Both clients start empty
            const doc1 = new DenicekDocument({ peerId: 1n });
            const doc2 = new DenicekDocument({ peerId: 2n });

            // Connect both clients BEFORE making changes
            const client1 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client1.waitConnected();
            const adaptor1 = new LoroAdaptor(doc1._internal.doc);
            const room1 = await client1.join({ roomId: "sync-room", crdtAdaptor: adaptor1 });

            const client2 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client2.waitConnected();
            const adaptor2 = new LoroAdaptor(doc2._internal.doc);
            const room2 = await client2.join({ roomId: "sync-room", crdtAdaptor: adaptor2 });

            // Wait for initial sync (both empty)
            await new Promise(resolve => setTimeout(resolve, 200));

            // Initialize document and add a node AFTER both are connected
            let newNodeId: string = "";
            doc1.change((model) => {
                model.initializeDocument();
            });
            doc1.change((model) => {
                const rootId = model.rootId;
                newNodeId = model.addElementChildNode(rootId, "div");
                model.updateAttribute(newNodeId, "class", "synced-from-client1");
            });

            // Wait for sync
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify client2 has the change
            expect(doc2.getRootId()).toBe(doc1.getRootId());
            const snapshot2 = doc2.getSnapshot();
            expect(snapshot2.nodes[newNodeId]).toBeDefined();
            const node = snapshot2.nodes[newNodeId];
            expect(node.kind).toBe("element");
            if (node.kind === "element") {
                expect(node.attrs.class).toBe("synced-from-client1");
            }

            // Cleanup
            await room1.leave();
            await room2.leave();
            client1.close();
            client2.close();
            doc1.dispose();
            doc2.dispose();
        } finally {
            await server.stop();
        }
    }, 30000);

    it("should sync changes from client2 to client1 (bidirectional)", async () => {
        const port = getPort();

        const server = new SimpleServer({
            port,
            host: "127.0.0.1",
            saveInterval: 1000,
        });
        await server.start();

        try {
            // Both clients start empty
            const doc1 = new DenicekDocument({ peerId: 1n });
            const doc2 = new DenicekDocument({ peerId: 2n });

            // Connect both clients
            const client1 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client1.waitConnected();
            const adaptor1 = new LoroAdaptor(doc1._internal.doc);
            const room1 = await client1.join({ roomId: "bidirectional-room", crdtAdaptor: adaptor1 });

            const client2 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client2.waitConnected();
            const adaptor2 = new LoroAdaptor(doc2._internal.doc);
            const room2 = await client2.join({ roomId: "bidirectional-room", crdtAdaptor: adaptor2 });

            // Wait for initial sync
            await new Promise(resolve => setTimeout(resolve, 200));

            // Client1 initializes document
            doc1.change((model) => {
                model.initializeDocument();
            });

            // Wait for sync
            await new Promise(resolve => setTimeout(resolve, 300));

            // Now client2 makes a change
            let client2NodeId: string = "";
            doc2.change((model) => {
                const rootId = model.rootId;
                client2NodeId = model.addElementChildNode(rootId, "span");
                model.updateAttribute(client2NodeId, "data-from", "client2");
            });

            // Wait for sync back to client1
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify client1 has the change from client2
            const snapshot1 = doc1.getSnapshot();
            expect(snapshot1.nodes[client2NodeId]).toBeDefined();
            const node = snapshot1.nodes[client2NodeId];
            expect(node.kind).toBe("element");
            if (node.kind === "element") {
                expect(node.attrs["data-from"]).toBe("client2");
            }

            // Cleanup
            await room1.leave();
            await room2.leave();
            client1.close();
            client2.close();
            doc1.dispose();
            doc2.dispose();
        } finally {
            await server.stop();
        }
    }, 30000);

    it("should handle concurrent changes from both clients", async () => {
        const port = getPort();

        const server = new SimpleServer({
            port,
            host: "127.0.0.1",
            saveInterval: 1000,
        });
        await server.start();

        try {
            // Both clients start empty
            const doc1 = new DenicekDocument({ peerId: 1n });
            const doc2 = new DenicekDocument({ peerId: 2n });

            // Connect both clients
            const client1 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client1.waitConnected();
            const adaptor1 = new LoroAdaptor(doc1._internal.doc);
            const room1 = await client1.join({ roomId: "concurrent-room", crdtAdaptor: adaptor1 });

            const client2 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client2.waitConnected();
            const adaptor2 = new LoroAdaptor(doc2._internal.doc);
            const room2 = await client2.join({ roomId: "concurrent-room", crdtAdaptor: adaptor2 });

            // Wait for initial sync
            await new Promise(resolve => setTimeout(resolve, 200));

            // Client1 initializes document
            doc1.change((model) => {
                model.initializeDocument();
            });

            // Wait for sync
            await new Promise(resolve => setTimeout(resolve, 300));

            // Both clients make changes concurrently
            let node1Id: string = "";
            let node2Id: string = "";

            doc1.change((model) => {
                const rootId = model.rootId;
                node1Id = model.addElementChildNode(rootId, "div");
                model.updateAttribute(node1Id, "id", "from-client1");
            });

            doc2.change((model) => {
                const rootId = model.rootId;
                node2Id = model.addElementChildNode(rootId, "div");
                model.updateAttribute(node2Id, "id", "from-client2");
            });

            // Wait for sync
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify both documents have both nodes (CRDT merges them)
            const snapshot1 = doc1.getSnapshot();
            const snapshot2 = doc2.getSnapshot();

            expect(snapshot1.nodes[node1Id]).toBeDefined();
            expect(snapshot1.nodes[node2Id]).toBeDefined();
            expect(snapshot2.nodes[node1Id]).toBeDefined();
            expect(snapshot2.nodes[node2Id]).toBeDefined();

            // Cleanup
            await room1.leave();
            await room2.leave();
            client1.close();
            client2.close();
            doc1.dispose();
            doc2.dispose();
        } finally {
            await server.stop();
        }
    }, 30000);

    it("should sync value node text changes", async () => {
        const port = getPort();

        const server = new SimpleServer({
            port,
            host: "127.0.0.1",
            saveInterval: 1000,
        });
        await server.start();

        try {
            // Both clients start empty
            const doc1 = new DenicekDocument({ peerId: 1n });
            const doc2 = new DenicekDocument({ peerId: 2n });

            // Connect both clients
            const client1 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client1.waitConnected();
            const adaptor1 = new LoroAdaptor(doc1._internal.doc);
            const room1 = await client1.join({ roomId: "text-room", crdtAdaptor: adaptor1 });

            const client2 = new LoroWebsocketClient({ url: `ws://127.0.0.1:${port}` });
            await client2.waitConnected();
            const adaptor2 = new LoroAdaptor(doc2._internal.doc);
            const room2 = await client2.join({ roomId: "text-room", crdtAdaptor: adaptor2 });

            // Wait for initial sync
            await new Promise(resolve => setTimeout(resolve, 200));

            // Client1 initializes and creates a value node (text)
            let valueNodeId: string = "";
            doc1.change((model) => {
                model.initializeDocument();
            });
            doc1.change((model) => {
                const rootId = model.rootId;
                valueNodeId = model.addValueChildNode(rootId, "Hello ");
            });

            // Wait for sync
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify value synced to client2
            let snapshot2 = doc2.getSnapshot();
            expect(snapshot2.nodes[valueNodeId]).toBeDefined();
            let valueNode = snapshot2.nodes[valueNodeId];
            expect(valueNode.kind).toBe("value");
            if (valueNode.kind === "value") {
                expect(valueNode.value).toBe("Hello ");
            }

            // Client2 appends to the value
            doc2.change((model) => {
                // Get current length and insert at end
                const currentValue = doc2.getSnapshot().nodes[valueNodeId];
                if (currentValue.kind === "value") {
                    model.insertText(valueNodeId, currentValue.value.length, "World!");
                }
            });

            // Wait for sync back to client1
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify text update synced to client1
            const snapshot1 = doc1.getSnapshot();
            const finalValueNode = snapshot1.nodes[valueNodeId];
            expect(finalValueNode.kind).toBe("value");
            if (finalValueNode.kind === "value") {
                expect(finalValueNode.value).toBe("Hello World!");
            }

            // Cleanup
            await room1.leave();
            await room2.leave();
            client1.close();
            client2.close();
            doc1.dispose();
            doc2.dispose();
        } finally {
            await server.stop();
        }
    }, 30000);
});
