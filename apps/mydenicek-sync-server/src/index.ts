/**
 * MyDenicek Sync Server
 * 
 * Entry point for running the Loro sync server
 */

import { createSyncServer } from "./server.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const PERSISTENCE_PATH = process.env.PERSISTENCE_PATH || "./data";

const server = createSyncServer({
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
