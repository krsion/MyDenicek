import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// https://vite.dev/config/
export default defineConfig({
  // When deploying to GitHub Pages under a project site (username.github.io/mywebnicek)
  // set the base to the repository path so assets are referenced correctly.
  base: '/mywebnicek/',
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    wasm(),
    topLevelAwait(),
  ],
})
