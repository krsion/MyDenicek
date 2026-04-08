# mydenicek-core

**Local-first collaborative document editor built on a custom OT-based CRDT.**\
Published on JSR as [`@mydenicek/core`](https://jsr.io/@mydenicek/core) and [`@mydenicek/react`](https://jsr.io/@mydenicek/react).

**Author**: Bc. Ondřej Krsička\
**Supervisor**: Mgr. Tomáš Petříček, Ph.D.\
**Course**: NPRG070 — Research Project, Charles University, Faculty of
Mathematics and Physics

## About

This repository contains the complete mywebnicek project — a local-first
collaborative document editor for tagged document trees. It extends the original
[Denicek](https://tomasp.net/academic/papers/denicek/) system by Tomáš Petříček
with real-time multi-peer collaboration via a custom OT-based CRDT.

The core uses an **event DAG with vector clocks** and **operational
transformation of selector paths** to achieve strong eventual consistency.
Documents are modeled as tagged trees of records, lists, primitives, and
references — addressed by filesystem-style selectors like `/header/title/text`.

## Live Demo

https://krsion.github.io/mydenicek-core/

## Documentation

- [Technical Documentation](docs/tech-docs.md) — architecture, CRDT design, implementation details
- [User Manual](docs/user-manual.md) — getting started, features, keyboard shortcuts
- [Formative Examples](docs/formative-examples.md) — worked examples demonstrating the CRDT core
- [Design Decisions](docs/design-decisions.md) — rationale for key architectural choices
- [Specification](specification/specification.pdf) — project specification
- [Proposal](proposal/proposal.pdf) — project proposal

## Workspace Structure

Deno workspace for the Denicek document model, sync infrastructure, and browser
clients:

- `packages/core` — the OT-based Denicek CRDT implementation ([`@mydenicek/core`](https://jsr.io/@mydenicek/core))
- `packages/react` — React hook for reactive Denicek usage ([`@mydenicek/react`](https://jsr.io/@mydenicek/react))
- `packages/sync-server` — sync protocol, sync room, and server/client helpers
- `apps/sync-server` — the runnable WebSocket sync server
- `apps/playground` — experimental playground for multi-peer DAG exploration
- `apps/mywebnicek` — production web app (Deno + Vite + React + Fluent UI)

## References

- Petříček, T. "Denicek: Computational Substrate for Document-Oriented End-User
  Programming." UIST 2025.
  - DOI: https://doi.org/10.1145/3746059.3747646
  - [Project page](https://tomasp.net/academic/papers/denicek/)

## Live Deployment

The Azure deployment workflows publish these public endpoints:

- **Sync Server**: `wss://mydenicek-sync-prod.azurewebsites.net`
- **Sync Server Health Check**:
  `https://mydenicek-sync-prod.azurewebsites.net/health`
- **Web Application**: https://krsion.github.io/mydenicek-core/

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
