/**
 * Test server helper for integration tests
 */

import { SimpleServer } from "loro-websocket/server";

export interface TestServerContext {
    server: SimpleServer;
    port: number;
    url: string;
}

let portCounter = 13000;

/**
 * Get a unique port for each test to avoid conflicts
 */
export function getNextPort(): number {
    return portCounter++;
}

/**
 * Start a test server on a unique port
 */
export async function startTestServer(): Promise<TestServerContext> {
    const port = getNextPort();
    console.log(`Starting test server on port ${port}...`);

    const server = new SimpleServer({
        port,
        host: "127.0.0.1",
        // In-memory only for tests (no persistence callbacks)
        saveInterval: 1000,
    });

    await server.start();
    console.log(`Test server started on port ${port}`);

    // Wait for server to fully start
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
        server,
        port,
        url: `ws://127.0.0.1:${port}`,
    };
}

/**
 * Stop the test server
 */
export async function stopTestServer(context: TestServerContext): Promise<void> {
    await context.server.stop();
    // Allow time for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
}
