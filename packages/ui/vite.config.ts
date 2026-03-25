import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../core/core.ts'),
      '@std/data-structures/binary-heap': path.resolve(__dirname, 'src/shims/binary-heap.ts'),
    },
    // Allow importing .ts files from the core package
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
