import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vite.dev/config/
export default defineConfig({
  base: '/MyDenicek/',
  resolve: {
    alias: {
      '@mydenicek/core-v2': path.resolve(__dirname, '../../packages/mydenicek-core-v2/src/index.ts'),
      '@mydenicek/react-v2': path.resolve(__dirname, '../../packages/mydenicek-react-v2/src/index.ts'),
      '@mydenicek/sync-client': path.resolve(__dirname, '../../packages/mydenicek-sync-client/src/index.ts'),
    },
  },
  optimizeDeps: {
    include: ['loro-adaptors', 'loro-websocket/client'],
  },
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tsconfigPaths(),
    wasm(),
    topLevelAwait(),
  ],
  server: {
  },
})
