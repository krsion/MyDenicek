# @mydenicek/ui

A development and debugging UI for the Mydenicek CRDT. Visualizes the event
DAG, the materialized document tree, detected conflicts, and lets you compose
edits and simulate multi-peer collaboration.

## Tech stack

- React 18
- D3 v7 (event graph visualization)
- Vite (build / dev server)
- Vitest (tests)

## Prerequisites

- Node.js ≥ 20.19 (npm ≥ 9)

## Quick start

```sh
cd packages/ui
npm install
npm run dev
```

Then open <http://localhost:5173> in your browser.

## Running tests

```sh
cd packages/ui
npm test
```

## Architecture

```
PeerSession          – wraps one Denicek instance; snapshot() returns plain state
SyncService          – interface for transferring events between peers
InMemorySyncService  – in-process implementation; swap for a server version later

MultiPeerSimulatorApp  – root: hosts N PeerSessions + sync controls
PeerWorkspace          – single-peer view: event graph, tree, conflicts, edit form
EventGraphView         – D3-rendered event DAG (zoom/pan, click-to-select)
MaterializedTree       – recursive tagged-tree renderer
ConflictsPanel         – lists no-op conflicts from the last materialization
EditComposer           – operation picker + form inputs for all Denicek ops
```

## Design notes

- Each peer's state is fully captured by `PeerSnapshot` (plain, React-safe)
- Mutations happen on `PeerSession` objects; a revision counter forces React re-renders
- D3 is confined to `EventGraphView` and the layout helpers inside it
- `SyncService` is a narrow interface designed for easy swap to server-backed sync

## Non-goals for this version

- Replay of selected events
- Save-to-button replay actions
- Server-backed sync
- One-peer-per-tab runtime mode
