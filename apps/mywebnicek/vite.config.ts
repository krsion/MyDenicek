import react from '@vitejs/plugin-react'
import path from "path"
import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

// https://vite.dev/config/
export default defineConfig({
  base: '/MyDenicek/',
  resolve: {
    alias: {
      "@mydenicek/core": path.resolve(__dirname, "../../packages/mydenicek-core/src/index.ts"),
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    wasm(),
    topLevelAwait(),
  ],
  server: {
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
      },
      '/api/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openai/, ''),
      },
    },
  },
})
