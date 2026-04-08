# mywebnicek

Production web application for the mydenicek collaborative document editor.

Built with **Deno + Vite + React + Fluent UI**.

## Features

- **Real-time collaboration** — connect to a shared room via the sync server
- **Command bar** — terminal-style path input with tab completion for navigating
  and editing the document tree
- **Peer name prompt** — enter your name before joining a room
- **Auto-sync** — detects localhost for local development; connects to the
  deployed Azure sync server in production

## Quick Start

From the repository root:

```sh
cd apps/mywebnicek
deno install
deno task dev
```

Then open <http://localhost:5173>. A room ID is auto-generated in the URL hash —
share it to collaborate with others.

To connect to a local sync server instead of the deployed one:

```sh
# In another terminal, from the repo root:
deno task sync-server
```

The app auto-detects `localhost` and switches to `ws://localhost:8787/sync`.

## Build

```sh
deno task build
```

Output goes to `dist/` for static hosting (deployed to GitHub Pages via CI).

## Lint & Type-check

```sh
deno task lint
deno check src/main.tsx
```

## E2E Tests

End-to-end tests use Playwright (Node.js):

```sh
npx playwright install --with-deps chromium
npx playwright test
```

Set `BASE_URL` to test against a specific deployment:

```sh
BASE_URL=https://krsion.github.io/mydenicek npx playwright test
```

## Tech Stack

- [Deno](https://deno.land/) — runtime
- [Vite](https://vitejs.dev/) — bundler
- [React 19](https://react.dev/) — UI framework
- [Fluent UI React v9](https://react.fluentui.dev/) — component library
- [@mydenicek/react](https://jsr.io/@mydenicek/react) — reactive Denicek hook
  with sync
- [@mydenicek/core](https://jsr.io/@mydenicek/core) — OT-based CRDT engine
- [Playwright](https://playwright.dev/) — E2E testing
