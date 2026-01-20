/**
 * MyDenicek Sync Server
 *
 * Library exports and entry point for running the Loro sync server
 */

// Re-export library functions
export { createSyncServer, type SyncServerOptions } from "./server.js";
export { SimpleServer } from "loro-websocket/server";

// Only start the server if this file is run directly
const isMainModule = process.argv[1]?.includes("index");

if (isMainModule) {
    const { createSyncServer } = await import("./server.js");

    const PORT = parseInt(process.env.PORT || "3001", 10);
    const PERSISTENCE_PATH = process.env.PERSISTENCE_PATH || "./data";

    await createSyncServer({
        port: PORT,
        persistencePath: PERSISTENCE_PATH,
        saveInterval: 5000,
    });

    // Handle graceful shutdown
    process.on("SIGINT", () => {
        console.log("\nShutting down sync server...");
        process.exit(0);
    });

    process.on("SIGTERM", () => {
        console.log("Shutting down sync server...");
        process.exit(0);
    });

    // Keep process alive
    setInterval(() => {}, 10000);
}
