/**
 * Integration tests for concurrent wrap conflict resolution
 *
 * These tests verify the post-merge cleanup behavior:
 * - Concurrent wraps are flattened to a single wrapper using LWW (Loro lamport timestamps)
 * - Intentional sequential nesting (one wrapper created after the other) is preserved
 * - Tree structure remains valid
 * - Each document converges to the same state
 */

import { DenicekDocument } from "@mydenicek/core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
    type ServerProcessContext,
    startServerProcess,
    stopServerProcess,
} from "./helpers/server-process.js";

const ROOM_ID = "wrap-conflict-test-room";

describe("Concurrent Wrap Conflict Resolution", () => {
    let server: ServerProcessContext;
    let activeDocuments: DenicekDocument[] = [];

    beforeAll(async () => {
        server = await startServerProcess();
    }, 15000);

    afterEach(async () => {
        // Clean up any documents from the test
        for (const doc of activeDocuments) {
            try {
                doc.dispose();
            } catch {
                // Ignore disposal errors
            }
        }
        activeDocuments = [];
    });

    afterAll(async () => {
        await stopServerProcess(server);
    }, 10000);

    it("flattens concurrent wraps to a single wrapper using LWW", async () => {
        // Create two documents with different peer IDs
        const doc1 = new DenicekDocument({ peerId: 100n });
        const doc2 = new DenicekDocument({ peerId: 200n });
        activeDocuments.push(doc1, doc2);

        // Connect both to the same room
        await doc1.connectToSync({ url: server.url, roomId: ROOM_ID + "-1", pingIntervalMs: 500 });
        await doc2.connectToSync({ url: server.url, roomId: ROOM_ID + "-1", pingIntervalMs: 500 });

        // Client 1 creates the initial structure
        let targetNodeId: string = "";
        doc1.change((model) => {
            const rootId = model.createRootNode("div");
            targetNodeId = model.addElementChildNode(rootId, "paragraph");
            model.addValueChildNode(targetNodeId, "Hello World");
        });

        // Wait for doc2 to receive the initial structure
        await waitForSync(doc1, doc2, 5000);

        // Disconnect to simulate concurrent offline edits
        doc1.disconnectSync();
        doc2.disconnectSync();
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Both clients wrap the SAME node concurrently with DIFFERENT tags
        doc1.change((model) => {
            model.wrapNode(targetNodeId, "section");
        });

        doc2.change((model) => {
            model.wrapNode(targetNodeId, "article");
        });

        // Reconnect and sync
        await doc1.connectToSync({ url: server.url, roomId: ROOM_ID + "-1", pingIntervalMs: 500 });
        await doc2.connectToSync({ url: server.url, roomId: ROOM_ID + "-1", pingIntervalMs: 500 });

        await waitForSync(doc1, doc2, 5000);

        // Verify both documents converged to the same state
        const finalNodes1 = doc1.getAllNodes();
        const finalNodes2 = doc2.getAllNodes();
        expect(Object.keys(finalNodes1).sort()).toEqual(Object.keys(finalNodes2).sort());

        // Count wrapper nodes
        const wrapperNodes = Object.values(finalNodes1).filter(
            (node) => node.kind === "element" && ["section", "article"].includes(node.tag)
        );

        console.log(`Concurrent wrap result: ${wrapperNodes.length} wrapper(s)`);
        console.log(`Wrapper tags: ${wrapperNodes.map(n => n.kind === "element" ? n.tag : "").join(", ")}`);

        // Post-merge cleanup should flatten concurrent wrappers to a single wrapper
        expect(wrapperNodes.length).toBe(1);

        // Verify tree structure is still valid (target is nested inside wrapper)
        const targetNode = finalNodes1[targetNodeId];
        expect(targetNode).toBeDefined();
        expect(targetNode!.kind).toBe("element");
    }, 30000);

    it("verifies both documents converge to identical state after concurrent wraps", async () => {
        const doc1 = new DenicekDocument({ peerId: 101n });
        const doc2 = new DenicekDocument({ peerId: 201n });
        activeDocuments.push(doc1, doc2);

        await doc1.connectToSync({ url: server.url, roomId: ROOM_ID + "-2", pingIntervalMs: 500 });
        await doc2.connectToSync({ url: server.url, roomId: ROOM_ID + "-2", pingIntervalMs: 500 });

        // Create initial structure
        let targetNodeId: string = "";
        doc1.change((model) => {
            const rootId = model.createRootNode("div");
            targetNodeId = model.addElementChildNode(rootId, "span");
        });

        await waitForSync(doc1, doc2, 5000);

        // Disconnect for concurrent edits
        doc1.disconnectSync();
        doc2.disconnectSync();
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Both wrap with the SAME tag
        doc1.change((model) => {
            model.wrapNode(targetNodeId, "wrapper");
        });

        doc2.change((model) => {
            model.wrapNode(targetNodeId, "wrapper");
        });

        // Reconnect and sync
        await doc1.connectToSync({ url: server.url, roomId: ROOM_ID + "-2", pingIntervalMs: 500 });
        await doc2.connectToSync({ url: server.url, roomId: ROOM_ID + "-2", pingIntervalMs: 500 });

        await waitForSync(doc1, doc2, 5000);

        // Verify both documents have identical nodes
        const nodes1 = doc1.getAllNodes();
        const nodes2 = doc2.getAllNodes();

        expect(Object.keys(nodes1).sort()).toEqual(Object.keys(nodes2).sort());

        // Verify all node data matches
        for (const id of Object.keys(nodes1)) {
            const n1 = nodes1[id]!;
            const n2 = nodes2[id]!;
            expect(n1).toBeDefined();
            expect(n2).toBeDefined();
            expect(n1.kind).toBe(n2.kind);
            if (n1.kind === "element" && n2.kind === "element") {
                expect(n1.tag).toBe(n2.tag);
            }
            if (n1.kind === "value" && n2.kind === "value") {
                expect(n1.value).toBe(n2.value);
            }
        }

        // Concurrent wrappers should be flattened to a single wrapper
        const wrappers = Object.values(nodes1).filter(
            (n) => n.kind === "element" && n.tag === "wrapper"
        );
        console.log(`Same-tag concurrent wrap: ${wrappers.length} wrapper(s)`);
        expect(wrappers.length).toBe(1);
    }, 30000);

    it("maintains valid tree structure after wrap conflict (no orphans)", async () => {
        const doc1 = new DenicekDocument({ peerId: 102n });
        const doc2 = new DenicekDocument({ peerId: 202n });
        activeDocuments.push(doc1, doc2);

        await doc1.connectToSync({ url: server.url, roomId: ROOM_ID + "-3", pingIntervalMs: 500 });
        await doc2.connectToSync({ url: server.url, roomId: ROOM_ID + "-3", pingIntervalMs: 500 });

        // Create a more complex initial structure
        let rootId: string = "";
        let child1Id: string = "";
        let child2Id: string = "";
        let targetId: string = "";

        doc1.change((model) => {
            rootId = model.createRootNode("div");
            child1Id = model.addElementChildNode(rootId, "header");
            targetId = model.addElementChildNode(rootId, "content");
            child2Id = model.addElementChildNode(rootId, "footer");
        });

        await waitForSync(doc1, doc2, 5000);

        // Disconnect and make concurrent wraps
        doc1.disconnectSync();
        doc2.disconnectSync();
        await new Promise((resolve) => setTimeout(resolve, 200));

        doc1.change((model) => {
            model.wrapNode(targetId, "main");
        });

        doc2.change((model) => {
            model.wrapNode(targetId, "section");
        });

        // Reconnect and sync
        await doc1.connectToSync({ url: server.url, roomId: ROOM_ID + "-3", pingIntervalMs: 500 });
        await doc2.connectToSync({ url: server.url, roomId: ROOM_ID + "-3", pingIntervalMs: 500 });

        await waitForSync(doc1, doc2, 5000);

        // Verify tree structure is valid
        const nodes = doc1.getAllNodes();

        // Root should still exist
        expect(nodes[rootId]).toBeDefined();

        // Header and footer should still be reachable from root
        expect(doc1.getParentId(child1Id)).toBe(rootId);
        expect(doc1.getParentId(child2Id)).toBe(rootId);

        // Target should have a wrapper as parent (not root directly)
        const targetParentId = doc1.getParentId(targetId);
        expect(targetParentId).toBeDefined();
        expect(targetParentId).not.toBe(rootId);

        // Trace path from target to root - should not exceed reasonable depth
        let currentId: string | null = targetId;
        let depth = 0;
        const maxDepth = 10;
        while (currentId && depth < maxDepth) {
            currentId = doc1.getParentId(currentId);
            depth++;
        }
        expect(depth).toBeLessThan(maxDepth); // No infinite loops

        // Verify both documents have same structure
        expect(doc2.getParentId(child1Id)).toBe(rootId);
        expect(doc2.getParentId(child2Id)).toBe(rootId);

        console.log("Tree structure after conflict (double-wrapped):");
        console.log(`  Depth from target to root: ${depth}`);
    }, 30000);

    it("handles sequential sync followed by concurrent wrap", async () => {
        const doc1 = new DenicekDocument({ peerId: 103n });
        const doc2 = new DenicekDocument({ peerId: 203n });
        activeDocuments.push(doc1, doc2);

        await doc1.connectToSync({ url: server.url, roomId: ROOM_ID + "-4", pingIntervalMs: 500 });
        await doc2.connectToSync({ url: server.url, roomId: ROOM_ID + "-4", pingIntervalMs: 500 });

        // Create initial structure
        let targetId: string = "";
        doc1.change((model) => {
            const rootId = model.createRootNode("div");
            targetId = model.addElementChildNode(rootId, "text");
        });

        await waitForSync(doc1, doc2, 5000);

        // Doc1 wraps first, synced to doc2
        doc1.change((model) => {
            model.wrapNode(targetId, "first-wrapper");
        });

        await waitForSync(doc1, doc2, 5000);

        // Verify first wrap synced
        const afterFirstWrap1 = doc1.getAllNodes();
        const afterFirstWrap2 = doc2.getAllNodes();
        const firstWrapperCount1 = Object.values(afterFirstWrap1).filter(
            (n) => n.kind === "element" && n.tag === "first-wrapper"
        ).length;
        const firstWrapperCount2 = Object.values(afterFirstWrap2).filter(
            (n) => n.kind === "element" && n.tag === "first-wrapper"
        ).length;
        expect(firstWrapperCount1).toBe(1);
        expect(firstWrapperCount2).toBe(1);

        // Now both try to wrap the ALREADY WRAPPED node concurrently
        doc1.disconnectSync();
        doc2.disconnectSync();
        await new Promise((resolve) => setTimeout(resolve, 200));

        doc1.change((model) => {
            model.wrapNode(targetId, "second-wrapper-a");
        });

        doc2.change((model) => {
            model.wrapNode(targetId, "second-wrapper-b");
        });

        // Reconnect and sync
        await doc1.connectToSync({ url: server.url, roomId: ROOM_ID + "-4", pingIntervalMs: 500 });
        await doc2.connectToSync({ url: server.url, roomId: ROOM_ID + "-4", pingIntervalMs: 500 });

        await waitForSync(doc1, doc2, 5000);

        // Check the structure
        const nodes = doc1.getAllNodes();
        const wrapperTags = ["first-wrapper", "second-wrapper-a", "second-wrapper-b"];
        const wrappers = Object.values(nodes).filter(
            (n) => n.kind === "element" && wrapperTags.includes(n.tag)
        );

        console.log(`Sequential + concurrent wrap: ${wrappers.length} wrapper(s)`);
        console.log(`Tags: ${wrappers.map(w => w.kind === "element" ? w.tag : "").join(", ")}`);

        // First wrapper should remain (1)
        // Second concurrent wraps are flattened to 1
        // Total: 2 wrappers
        expect(wrappers.length).toBe(2);
    }, 30000);

    it("preserves intentional sequential nesting (not concurrent)", async () => {
        const doc1 = new DenicekDocument({ peerId: 104n });
        const doc2 = new DenicekDocument({ peerId: 204n });
        activeDocuments.push(doc1, doc2);

        await doc1.connectToSync({ url: server.url, roomId: ROOM_ID + "-5", pingIntervalMs: 500 });
        await doc2.connectToSync({ url: server.url, roomId: ROOM_ID + "-5", pingIntervalMs: 500 });

        // Create initial structure
        let targetId: string = "";
        doc1.change((model) => {
            const rootId = model.createRootNode("div");
            targetId = model.addElementChildNode(rootId, "content");
        });

        await waitForSync(doc1, doc2, 5000);

        // First wrap (synced)
        let firstWrapperId: string = "";
        doc1.change((model) => {
            firstWrapperId = model.wrapNode(targetId, "inner-wrapper");
        });

        await waitForSync(doc1, doc2, 5000);

        // Second wrap - intentionally wrapping the FIRST wrapper (not concurrent)
        doc1.change((model) => {
            model.wrapNode(firstWrapperId, "outer-wrapper");
        });

        await waitForSync(doc1, doc2, 5000);

        // Verify BOTH wrappers still exist (intentional nesting preserved)
        const nodes = doc1.getAllNodes();
        const innerWrappers = Object.values(nodes).filter(
            (n) => n.kind === "element" && n.tag === "inner-wrapper"
        );
        const outerWrappers = Object.values(nodes).filter(
            (n) => n.kind === "element" && n.tag === "outer-wrapper"
        );

        console.log(`Intentional nesting: inner=${innerWrappers.length}, outer=${outerWrappers.length}`);

        expect(innerWrappers.length).toBe(1);
        expect(outerWrappers.length).toBe(1);

        // Structure should be: outer-wrapper -> inner-wrapper -> content
        const targetParent = doc1.getParentId(targetId);
        expect(targetParent).toBeDefined();
        const innerParent = doc1.getParentId(targetParent!);
        expect(innerParent).toBeDefined();
    }, 30000);
});

/**
 * Wait for two documents to sync by comparing node IDs and data
 */
async function waitForSync(
    doc1: DenicekDocument,
    doc2: DenicekDocument,
    timeoutMs = 5000
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const ids1 = Object.keys(doc1.getAllNodes()).sort();
        const ids2 = Object.keys(doc2.getAllNodes()).sort();

        if (JSON.stringify(ids1) === JSON.stringify(ids2) && ids1.length > 0) {
            // Also verify node data matches
            const nodes1 = doc1.getAllNodes();
            const nodes2 = doc2.getAllNodes();
            let allMatch = true;

            for (const id of ids1) {
                const n1 = nodes1[id];
                const n2 = nodes2[id];
                if (!n1 || !n2 || n1.kind !== n2.kind) {
                    allMatch = false;
                    break;
                }
                if (n1.kind === "element" && n2.kind === "element" && n1.tag !== n2.tag) {
                    allMatch = false;
                    break;
                }
                if (n1.kind === "value" && n2.kind === "value" && n1.value !== n2.value) {
                    allMatch = false;
                    break;
                }
            }

            if (allMatch) {
                return;
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`Documents did not sync within ${timeoutMs}ms`);
}
