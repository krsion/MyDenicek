# mydenicek

**Local-first collaborative document editor built on a custom OT-based CRDT.**

Published on JSR as [`@mydenicek/core`](https://jsr.io/@mydenicek/core),
[`@mydenicek/react`](https://jsr.io/@mydenicek/react), and
[`@mydenicek/sync`](https://jsr.io/@mydenicek/sync).

**Author**: Bc. Ondřej Krsička\
**Supervisor**: Mgr. Tomáš Petříček, Ph.D.\
**Master thesis**: Charles University, Faculty of Mathematics and Physics

## About

This repository contains the complete mydenicek project — a local-first
collaborative document editor for tagged document trees. It extends the original
[Denicek](https://tomasp.net/academic/papers/denicek/) system by Tomáš Petříček
with real-time multi-peer collaboration via a custom OT-based CRDT.

The core uses an **event DAG with vector clocks** and **operational
transformation of selector paths** to achieve strong eventual consistency.
Documents are modeled as tagged trees of records, lists, primitives, and
references — addressed by filesystem-style selectors like `/header/title/text`.

## Live Demo

- **Web application**: <https://krsion.github.io/mydenicek/>
- **Presentation**:
  [📊 View Presentation](https://krsion.github.io/mydenicek/presentation.html)

## Documentation

- [Technical Documentation](docs/tech-docs.md) — architecture, CRDT design,
  implementation details
- [User Manual](docs/user-manual.md) — getting started, features, keyboard
  shortcuts
- [Formative Examples](docs/formative-examples.md) — worked examples
  demonstrating the CRDT core
- [Design Decisions](docs/design-decisions.md) — rationale for key architectural
  choices
- [Specification Divergence](docs/specification-divergence.md) — why the
  implementation diverged from the original specification
- [Compound Operation Decomposition](docs/design/compound-operation-decomposition.md)
  — why transactions are impossible in local-first software
- [Specification](documents/specification/specification.pdf) — project
  specification
- [Proposal](documents/proposal/proposal.pdf) — project proposal

## Repository Structure

Deno monorepo for the Denicek document model, sync infrastructure, and web
client:

- `packages/core` — the OT-based Denicek CRDT implementation
  ([`@mydenicek/core`](https://jsr.io/@mydenicek/core))
- `packages/react` — React hook for reactive Denicek usage
  ([`@mydenicek/react`](https://jsr.io/@mydenicek/react))
- `packages/sync` — sync protocol, sync room, and server/client helpers
  ([`@mydenicek/sync`](https://jsr.io/@mydenicek/sync))
- `apps/sync-server` — WebSocket sync server (deployed on Azure Container Apps)
- `apps/mywebnicek` — production web app (Deno + Vite + React + Fluent UI)
- `docs/` — project documentation
- `documents/` — thesis proposal and specification (LaTeX + PDF)
- `infra/` — Azure Bicep deployment templates

## References

- Petříček, T. "Denicek: Computational Substrate for Document-Oriented End-User
  Programming." UIST 2025.
  - DOI: <https://doi.org/10.1145/3746059.3747646>
  - [Project page](https://tomasp.net/academic/papers/denicek/)

## Local Setup

### Prerequisites

- [Deno](https://deno.com/) 2.x

### Install dependencies

```sh
cd apps/mywebnicek && deno install
```

### Run locally

Start both the sync server and the web app together:

```sh
deno task dev
```

Then open <http://localhost:5173>.

Alternatively, run the sync server and web app separately:

```sh
deno task sync-server          # WebSocket sync at ws://127.0.0.1:8787/sync
deno task mywebnicek:dev       # Vite dev server at http://localhost:5173
```

### Validation

```sh
deno task fmt:check            # Verify formatting
deno task check                # Type-check all packages
deno task lint                 # Lint all packages
deno task test                 # Run all tests
deno task build                # Build production web app
```
