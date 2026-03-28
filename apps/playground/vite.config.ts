import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@mydenicek/core/internal": fileURLToPath(
        new URL("../../packages/core/internal.ts", import.meta.url),
      ),
      "@mydenicek/core": fileURLToPath(
        new URL("../../packages/core/mod.ts", import.meta.url),
      ),
      "@mydenicek/sync-server": fileURLToPath(
        new URL("../../packages/sync-server/mod.ts", import.meta.url),
      ),
      "@std/data-structures/binary-heap": fileURLToPath(
        new URL("src/shims/binary-heap.ts", import.meta.url),
      ),
    },
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
});
