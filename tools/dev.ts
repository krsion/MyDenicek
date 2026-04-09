/**
 * Starts both the sync server and the frontend dev server in parallel.
 * Usage: deno task dev
 */

const syncServer = new Deno.Command("deno", {
  args: ["task", "sync-server"],
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

const frontend = new Deno.Command("deno", {
  args: ["task", "mywebnicek:dev"],
  stdout: "inherit",
  stderr: "inherit",
  env: { ...Deno.env.toObject(), VITE_SYNC_URL: "ws://localhost:8787/sync" },
}).spawn();

await Promise.race([syncServer.status, frontend.status]);

try {
  syncServer.kill();
} catch { /* already exited */ }
try {
  frontend.kill();
} catch { /* already exited */ }
