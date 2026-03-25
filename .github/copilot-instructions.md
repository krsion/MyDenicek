# Copilot Instructions for mydenicek-core

## Commands

```sh
deno check core.ts                    # Type-check
deno test --allow-all                 # Run all tests (unit + fuzz)
deno test tests/core.test.ts --no-check              # Unit tests only
deno test tests/core-properties.test.ts --no-check   # Property-based tests (fast-check)
deno run tools/core-random-fuzzer.ts                 # Standalone long-running random fuzzer
deno test --filter "Converge" --no-check tests/core-properties.test.ts  # Run a single property test by name
```

## Architecture

This is a **CRDT (Conflict-free Replicated Data Type)** for collaborative editing of a tagged document tree. Everything lives in `core.ts`.

**Document model:** A tree of `Node` variants (record, list, primitive, reference), addressed by `Selector` paths like `["items", 2, "name"]`. Wildcards (`*`) target all children of a list.

**Event DAG:** Edits are recorded as `Event` objects in a causal DAG with vector clocks. Each peer produces events independently. Convergence is achieved by replaying all events in deterministic topological order, with **operational transformation (OT)** resolving concurrent structural edits (rename, wrap, delete) by transforming selectors.

## Conventions

- **Function names must contain a verb** (e.g., `computeClosure`, `formatEventKey`, `canApplyEdit`). Node constructors (`primitive`, `record`, `list`, `reference`) are the exception.
- **`private` keyword over `#` private fields** — readability over runtime enforcement.
- Follow John Ousterhout's principles from book *A Philosophy of Software Design*:
- You are a distributed systems expert, who deeply understands causality, vector clocks, and operational transformation. You have implemented several CRDTs and OT algorithms in production systems. You are familiar with the trade-offs between different approaches to achieving convergence in collaborative editing systems.
- You are a TypeScript expert, who writes clean, idiomatic code with proper typing and documentation. You follow best practices for code organization, naming conventions, and testing.
- You are working on a fresh new codebase, you don't need to worry about backwards compatibility.
