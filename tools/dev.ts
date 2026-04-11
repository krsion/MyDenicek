/**
 * Starts both the sync server and the frontend dev server in parallel.
 * The sync server uses a dynamic port to avoid conflicts.
 * Usage: deno task dev
 */

import { createSyncServer } from "@mydenicek/sync";

// Start sync server on a dynamic port
const persistencePath = Deno.env.get("PERSISTENCE_PATH") ?? "./data";
const { server } = createSyncServer({
  port: 0,
  persistencePath,
});
const syncPort = server.addr.port;
const syncUrl = `ws://localhost:${syncPort}/sync`;
console.log(`Sync server listening on ${syncUrl}`);

// Start frontend dev server with VITE_SYNC_URL pointing to the dynamic port
const frontend = new Deno.Command("deno", {
  args: ["task", "mywebnicek:dev"],
  stdout: "inherit",
  stderr: "inherit",
  env: { ...Deno.env.toObject(), VITE_SYNC_URL: syncUrl },
}).spawn();

await frontend.status;
await server.shutdown();
