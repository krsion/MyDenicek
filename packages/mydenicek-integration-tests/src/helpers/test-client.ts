/**
 * Test client helper for integration tests
 */

import { DenicekDocument } from "@mydenicek/core-v2";
import { LoroAdaptor } from "loro-adaptors";
import { LoroWebsocketClient, type LoroWebsocketClientRoom } from "loro-websocket/client";

export interface TestClientContext {
    document: DenicekDocument;
    client: LoroWebsocketClient;
    room: LoroWebsocketClientRoom;
}

/**
 * Create a test client connected to a room
 */
export async function createTestClient(
    serverUrl: string,
    roomId: string,
    options?: {
        peerId?: bigint;
        /** If true, create an empty document (don't initialize with default content) */
        empty?: boolean;
    }
): Promise<TestClientContext> {
    // Create document - either empty or with default content
    const document = options?.empty
        ? new DenicekDocument({ peerId: options?.peerId })
        : DenicekDocument.create({ peerId: options?.peerId });

    const client = new LoroWebsocketClient({
        url: serverUrl,
        pingIntervalMs: 1000,
    });

    await client.waitConnected();

    const adaptor = new LoroAdaptor(document._internal.doc);

    const room = await client.join({
        roomId,
        crdtAdaptor: adaptor,
    });

    return {
        document,
        client,
        room,
    };
}

/**
 * Close a test client and clean up
 */
export async function closeTestClient(context: TestClientContext): Promise<void> {
    await context.room.leave();
    context.client.close();
    context.document.dispose();
    await new Promise(resolve => setTimeout(resolve, 50));
}

/**
 * Wait for documents to sync by comparing snapshots
 */
export async function waitForSync(
    doc1: DenicekDocument,
    doc2: DenicekDocument,
    timeoutMs = 5000
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const snapshot1 = doc1.getSnapshot();
        const snapshot2 = doc2.getSnapshot();

        if (JSON.stringify(snapshot1) === JSON.stringify(snapshot2)) {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error(`Documents did not sync within ${timeoutMs}ms`);
}
