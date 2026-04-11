# Copilot Instructions for mydenicek

## Commands

```sh
deno task fmt        # Format the monorepo
deno task fmt:check  # Verify formatting across the monorepo
deno task lint       # Lint the monorepo (includes core doc lint)
deno task check      # Type-check the monorepo
deno task test       # Run monorepo tests
deno task build      # Build the runnable apps
deno test --filter "Converge" --no-check packages/core/tests/core-properties.test.ts  # Run a single property test by name
deno run packages/core/tools/core-random-fuzzer.ts               # Standalone long-running random fuzzer
```

## Validation

- **Before EVERY commit, run these checks from the repo root and verify they
  pass:**
  1. `deno lint src/` from `apps/mywebnicek` (catches JSX lint errors like
     missing `type` on buttons)
  2. `deno check src/main.tsx` from `apps/mywebnicek` (catches type errors in
     the web app)
  3. `deno check mod.ts` from `packages/core` and `packages/sync`
  4. `deno task build` from the repo root (catches Vite build issues)
- The root `deno task check` and `deno task lint` chains are too slow and hit
  ARG_MAX on Linux CI. Use the per-package commands above instead.
- When a change can affect behavior or tests, also run `deno task test`.
- **Do NOT commit without verifying lint and check pass.** CI failures from
  lint/check errors waste time.

## Architecture

This is a **CRDT (Conflict-free Replicated Data Type)** for collaborative
editing of a tagged document tree. The publishable package lives under
`packages/core`, with `packages/core/mod.ts` as the public entrypoint.

**Document model:** A tree of `Node` variants (record, list, primitive,
reference), addressed by `Selector` paths like `["items", 2, "name"]`. Wildcards
(`*`) target all children of a list.

**Event DAG:** Edits are recorded as `Event` objects in a causal DAG with vector
clocks. Each peer produces events independently. Convergence is achieved by
replaying all events in deterministic topological order, with **operational
transformation (OT)** resolving concurrent structural edits (rename, wrap,
delete) by transforming selectors.

## Conventions

- **Function names must contain a verb** (e.g., `computeClosure`,
  `formatEventKey`, `canApplyEdit`). Node constructors (`primitive`, `record`,
  `list`, `reference`) are the exception.
- **`private` keyword over `#` private fields** — readability over runtime
  enforcement.
- Follow John Ousterhout's principles from book _A Philosophy of Software
  Design_:
- You are a distributed systems expert, who deeply understands causality, vector
  clocks, and operational transformation. You have implemented several CRDTs and
  OT algorithms in production systems. You are familiar with the trade-offs
  between different approaches to achieving convergence in collaborative editing
  systems.
- You are a TypeScript expert, who writes clean, idiomatic code with proper
  typing and documentation. You follow best practices for code organization,
  naming conventions, and testing.
- You are working on a fresh new codebase, you don't need to worry about
  backwards compatibility.
