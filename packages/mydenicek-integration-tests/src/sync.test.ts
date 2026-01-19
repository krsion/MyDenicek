/**
 * Integration tests for sync server and clients
 *
 * These tests:
 * 1. Spawn the actual sync server as a subprocess
 * 2. Connect two clients using document.connectToSync()
 * 3. Verify changes sync between clients
 * 4. Verify server logs show expected activity
 */

import { DenicekDocument } from "@mydenicek/core-v2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    startServerProcess,
    stopServerProcess,
    type ServerProcessContext,
} from "./helpers/server-process.js";

const ROOM_ID = "test-room";

describe("Sync Integration", () => {
    let server: ServerProcessContext;
    let doc1: DenicekDocument;
    let doc2: DenicekDocument;

    beforeAll(async () => {
        // Start the server process
        server = await startServerProcess();
    }, 15000);

    afterAll(async () => {
        // Clean up - dispose handles sync disconnection
        if (doc1) doc1.dispose();
        if (doc2) doc2.dispose();

        // Stop the server
        await stopServerProcess(server);
    }, 10000);

    it("should start server and show listening log", () => {
        const logs = server.getLogs();
        const listeningLog = logs.find((log) => log.includes("listening on"));
        expect(listeningLog).toBeDefined();
        expect(listeningLog).toContain(`0.0.0.0:${server.port}`);
    });

    it("should connect two clients and sync changes", async () => {
        // Create DenicekDocuments (empty, no initial content)
        doc1 = new DenicekDocument({ peerId: 1n });
        doc2 = new DenicekDocument({ peerId: 2n });

        // Connect both documents to the same room using built-in sync
        await doc1.connectToSync({ url: server.url, roomId: ROOM_ID, pingIntervalMs: 1000 });
        await doc2.connectToSync({ url: server.url, roomId: ROOM_ID, pingIntervalMs: 1000 });

        // Initialize and make changes
        doc1.change((model) => {
            const rootId = model.createRootNode("section");
            const nodeId = model.addElementChildNode(rootId, "test-element");
            model.updateAttribute(nodeId, "testAttr", "fromClient1");
        });

        // Wait for sync
        await waitForSync(doc1, doc2, 5000);

        // Verify client 2 sees the changes from client 1
        const view2 = doc2.getSnapshot();
        let testNode;
        for (const { node } of view2.walkDepthFirst()) {
            if (node.kind === "element" && node.tag === "test-element") {
                testNode = node;
                break;
            }
        }
        expect(testNode).toBeDefined();
        if (testNode?.kind === "element") {
            expect(testNode.attrs.testAttr).toBe("fromClient1");
        }

        // Client 2 makes changes
        doc2.change((model) => {
            const rootId = model.rootId;
            const nodeId = model.addElementChildNode(rootId, "test-element-2");
            model.updateAttribute(nodeId, "testAttr", "fromClient2");
        });

        // Wait for sync
        await waitForSync(doc1, doc2, 5000);

        // Verify client 1 sees the changes from client 2
        const view1 = doc1.getSnapshot();
        let testNode2;
        for (const { node } of view1.walkDepthFirst()) {
            if (node.kind === "element" && node.tag === "test-element-2") {
                testNode2 = node;
                break;
            }
        }
        expect(testNode2).toBeDefined();
        if (testNode2?.kind === "element") {
            expect(testNode2.attrs.testAttr).toBe("fromClient2");
        }
    }, 30000);

    it("should log document load events", async () => {
        // Wait a bit for logs to be captured
        await new Promise((resolve) => setTimeout(resolve, 500));

        const logs = server.getLogs();
        // Room ID is hex-encoded in logs, so just check for LOAD with room=
        const loadLog = logs.find(
            (log) => log.includes("LOAD") && log.includes('room="')
        );
        expect(loadLog).toBeDefined();
    });

    it("should log new room creation", async () => {
        const logs = server.getLogs();
        // Room ID is hex-encoded in logs
        const newRoomLog = logs.find(
            (log) => log.includes("NEW") && log.includes('room="')
        );
        expect(newRoomLog).toBeDefined();
        expect(newRoomLog).toContain("no existing data");
    });

    it("should log sync events", async () => {
        // Wait for save interval to trigger (server has 5s interval)
        await new Promise((resolve) => setTimeout(resolve, 6000));

        const logs = server.getLogs();
        const syncLog = logs.find(
            (log) => log.includes("SYNC") && log.includes('room="')
        );
        expect(syncLog).toBeDefined();
        // Check it includes size info
        expect(syncLog).toMatch(/size=\d/);
    }, 10000);

    it("should log save events", async () => {
        const logs = server.getLogs();
        const saveLog = logs.find(
            (log) => log.includes("SAVED") && log.includes('room="')
        );
        expect(saveLog).toBeDefined();
    });
});

/**
 * Wait for two documents to sync by comparing node counts and IDs
 * Note: We don't compare root IDs because when two independently created documents
 * sync, they can have multiple roots with different ordering.
 */
async function waitForSync(
    doc1: DenicekDocument,
    doc2: DenicekDocument,
    timeoutMs = 5000
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const view1 = doc1.getSnapshot();
        const view2 = doc2.getSnapshot();

        // Compare all node IDs (sorted) - this is the definitive sync check
        const ids1 = view1.getAllNodeIds().sort();
        const ids2 = view2.getAllNodeIds().sort();
        const sameIds = JSON.stringify(ids1) === JSON.stringify(ids2);

        // Also check node count as a sanity check
        const sameCount = view1.getNodeCount() === view2.getNodeCount();

        if (sameCount && sameIds && ids1.length > 0) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`Documents did not sync within ${timeoutMs}ms`);
}
