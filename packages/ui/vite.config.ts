import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mydenicek/core': fileURLToPath(new URL('../core/mod.ts', import.meta.url)),
      '@std/data-structures/binary-heap': fileURLToPath(new URL('src/shims/binary-heap.ts', import.meta.url)),
    },
    // Allow importing .ts files from the core package
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
});
