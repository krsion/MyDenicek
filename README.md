# mydenicek-core

**Core CRDT engine for the MyDenicek collaborative document editor.**\
Published on JSR as [`@mydenicek/core`](https://jsr.io/@mydenicek/core).

**Author**: Bc. Ondřej Krsička\
**Supervisor**: Mgr. Tomáš Petříček, Ph.D.\
**Course**: NPRG070 — Research Project, Charles University, Faculty of
Mathematics and Physics

## About

This repository contains the OT-based CRDT implementation for the MyDenicek
local-first collaborative document editor. The core uses an **event DAG with
vector clocks** and **operational transformation of selector paths** to achieve
strong eventual consistency across peers. Edits are recorded as events in a
causal DAG, and convergence is achieved by replaying all events in deterministic
topological order, with OT resolving concurrent structural edits (rename, wrap,
delete).

The engine models a tree of `Node` variants (record, list, primitive,
reference), addressed by `Selector` paths like `["items", 2, "name"]`. It is
designed as a self-contained library with no framework dependencies.

## Related Repository

- **[MyDenicek](https://github.com/krsion/MyDenicek)** — Web application (React
  19 + Fluent UI), sync server, documentation, and
  [live demo](https://krsion.github.io/MyDenicek/)

## References

- Petříček, T. "Denicek: Computational Substrate for Document-Oriented End-User
  Programming." UIST 2025.
  - DOI: https://doi.org/10.1145/3746059.3747646
  - [Project page](https://tomasp.net/academic/papers/denicek/)

## Workspace Structure

TypeScript/Deno workspace for experimenting with the Denicek document model and
building browser clients around it:

- `packages/core` — the OT-based Denicek CRDT implementation
- `packages/sync-server` — sync protocol, sync room, and server/client helpers
- `apps/sync-server` — the runnable WebSocket sync server
- `apps/playground` — the experimental playground for multi-peer DAG and sync
  exploration
- `apps/mywebnicek` — the production-oriented browser UI that syncs through the
  deployed sync server

## Live Deployment

The Azure deployment workflows publish these public endpoints:

- **Sync Server**: `wss://mydenicek-sync-prod.azurewebsites.net`
- **Sync Server Health Check**:
  `https://mydenicek-sync-prod.azurewebsites.net/health`
- **Web Application**: https://krsion.github.io/MyDenicek/

The exact deployment values are configured in
`.github/workflows/infra-setup.yml` and `.github/workflows/deploy-app.yml`.

## Local setup

### Prerequisites

- Deno 2.x

### Install browser app dependencies

Most of the workspace uses standard Deno module resolution. The browser apps
also need their npm dependencies installed:

```sh
cd apps/playground
deno install
```

Repeat the same command in `apps/mywebnicek` when working on that app.

### Run the sync server locally

From the repository root:

```sh
deno task sync-server
```

The server listens on `http://127.0.0.1:8787` by default and exposes WebSocket
sync at `ws://127.0.0.1:8787/sync`.

Environment variables:

- `PORT` — WebSocket port (default `8787`)
- `HOSTNAME` — bind address (default `0.0.0.0`)
- `PERSISTENCE_PATH` — directory for JSON event logs (default `./data`)

### Run the playground locally

In a second terminal:

```sh
cd apps/playground
deno task dev
```

Then open <http://localhost:5173>.

From the repository root you can also use:

```sh
deno task playground:dev
```

### Run mywebnicek locally

In another terminal:

```sh
cd apps/mywebnicek
deno task dev
```

Then open <http://localhost:5173> and connect to the default deployed sync
server or change the URL in the app.

From the repository root you can also use:

```sh
deno task mywebnicek:dev
```

### Useful validation commands

From the repository root:

```sh
deno lint packages/core packages/sync-server apps/sync-server
deno task check
deno task test
cd apps/playground && deno install && deno task build && deno task test
cd apps/mywebnicek && deno install && deno task build && deno task test
```

## Workspace README files

- [Core package README](./packages/core/README.md)
- [Sync server README](./packages/sync-server/README.md)
- [Sync server app README](./apps/sync-server/README.md)
- [Playground README](./apps/playground/README.md)
- [MyWebnicek README](./apps/mywebnicek/README.md)
- [Azure deployment README](./infra/azure/sync-server/README.md)
