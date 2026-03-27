# mydenicek-core

TypeScript/Deno workspace for experimenting with the Denicek document model:

- `packages/core` — the OT-based Denicek CRDT implementation
- `packages/sync-server` — a WebSocket sync server and client helper
- `apps/ui` — a browser UI for exploring the event DAG and document state
- `apps/sync-sample` — a tiny terminal sample app

## Links

### Original Denicek paper

- [Denicek: Computational Substrate for Document-Oriented End-User Programming](https://doi.org/10.1145/3746059.3747646)
- [Project page and PDF mirror](https://tomasp.net/academic/papers/denicek/)

### Related repository

- [MyDenicek](https://github.com/krsion/MyDenicek) — the related local-first project built on Loro CRDTs

### Live deployment

The latest successful Azure deployment workflow published these public endpoints:

- [Deployed UI](https://happy-bay-0c7b2c903.4.azurestaticapps.net)
- [Deployed sync server](https://mydenicek-core-krsion-dev-sync--9mvjnr2.happyisland-d6dda219.westeurope.azurecontainerapps.io)
- [Sync server health check](https://mydenicek-core-krsion-dev-sync--9mvjnr2.happyisland-d6dda219.westeurope.azurecontainerapps.io/healthz)
- WebSocket endpoint: `wss://mydenicek-core-krsion-dev-sync--9mvjnr2.happyisland-d6dda219.westeurope.azurecontainerapps.io/sync`

## Local setup

### Prerequisites

- Deno 2.x

### Install UI dependencies

Most of the workspace uses standard Deno module resolution. The UI also needs its npm dependencies installed:

```sh
cd apps/ui
deno install
```

### Run the sync server locally

From the repository root:

```sh
deno task sync-server
```

The server listens on `http://127.0.0.1:8787` by default and exposes WebSocket sync at `ws://127.0.0.1:8787/sync`.

### Run the UI locally

In a second terminal:

```sh
cd apps/ui
deno task dev
```

Then open <http://localhost:5173>.

From the repository root you can also use:

```sh
deno task ui:dev
```

### Run the sample terminal app

With the sync server running, start peers in separate terminals:

```sh
deno run --allow-net apps/sync-sample/main.ts --peer alice
deno run --allow-net apps/sync-sample/main.ts --peer bob
```

### Useful validation commands

From the repository root:

```sh
deno lint packages/core packages/sync-server apps/sync-sample
deno task check
deno task test
cd apps/ui && deno install && deno task build && deno task test
```

## Workspace README files

- [Core package README](./packages/core/README.md)
- [Sync server README](./packages/sync-server/README.md)
- [UI README](./apps/ui/README.md)
- [Sync sample README](./apps/sync-sample/README.md)
- [Azure deployment README](./infra/azure/sync-server/README.md)
