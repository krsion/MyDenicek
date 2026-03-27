# @mydenicek/playground

An experimental browser playground for the Mydenicek CRDT. It visualizes the
multi-peer event DAG, materialized document tree, detected conflicts, and gives
you precise control over which peers sync and when.

## Tech stack

- React 18
- D3 v7 (event graph visualization)
- Vite (build / dev server)
- Deno (runtime, task runner, package manager)

## Quick start

```sh
cd apps/playground
deno install
deno task dev
```

Then open <http://localhost:5173>.

From the workspace root you can also use:

```sh
deno task playground:install
deno task playground:dev
```

## Running tests

```sh
cd apps/playground
deno task test
```

## Architecture

```
PeerSession          – wraps one Denicek instance; snapshot() returns plain state
SyncService          – interface for transferring events between peers
InMemorySyncService  – in-process implementation for fine-grained sync experiments

MultiPeerSimulatorApp  – root: hosts N PeerSessions + detailed sync controls
PeerWorkspace          – single-peer view: event graph, tree, conflicts, edit form
EventGraphView         – D3-rendered event DAG (zoom/pan, click-to-select)
MaterializedTree       – recursive tagged-tree renderer
ConflictsPanel         – lists no-op conflicts from the last materialization
EditComposer           – operation picker + form inputs for all Denicek ops
```

## Scope

This app stays intentionally experimental. It is the place for creating sync
patterns and conflict scenarios that would be unusual in the production app.
