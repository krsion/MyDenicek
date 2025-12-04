# MyDenicek Copilot Instructions

## Project Overview
MyDenicek is a local-first software implementation for editing DOM-like structures using **Automerge** (CRDTs). The repository contains:
- `dom-navigator/`: Main React application (Vite + TypeScript).
- `grove-demo.py`: Python implementation of "Grove Calculus" for HTML representation.
- `proposal/`: LaTeX research proposal.

## `dom-navigator` (React App)

### Architecture & Data Model
- **State Management:** Uses `@automerge/react` (`useDocument`) for CRDT-based state.
- **Data Structure (`src/Document.ts`):**
  - **Flat Node Map:** Nodes are stored in a dictionary `Record<string, Node>` indexed by unique IDs, NOT by path. This avoids "Shifting Index" conflicts.
  - **Node Types:** `ElementNode` (tag, attrs, children IDs) and `ValueNode` (text content).
  - **Transformations:** `wrap` and `rename` operations are tracked in a `transformations` array to handle concurrent edits deterministically.
- **Conflict Resolution:**
  - **Wrapping:** Uses deterministic IDs (e.g., `wrapper-${wrapped-element-id}`) to ensure concurrent wraps merge into a single wrapper (Winner-Takes-All) rather than nesting or duplicating.

### UI & Components
- **Framework:** React 19 with **Fluent UI** components (`@fluentui/react-components`).
- **Navigation:** `DomNavigator.tsx` handles the tree traversal and selection logic.
- **Icons:** Uses `@fluentui/react-icons`.

### Development Workflow
- **Package Manager:** `npm`
- **Dev Server:** `npm run dev` (Vite)
- **Build:** `npm run build` (TSC + Vite)
- **Lint:** `npm run lint` (ESLint)
  - **Rules:**
    - **Imports:** Sorted automatically via `eslint-plugin-simple-import-sort`.
    - **Unused Code:** `unused-imports/no-unused-imports` is an error. Unused variables must be prefixed with `_`.
- **Testing:**
  - **E2E/Integration:** `npm run test` (Playwright).
  - **UI Mode:** `npm run test:ui`
  - Tests are located in `tests/` and configured in `playwright.config.ts`.

### Coding Conventions
- **React:** Functional components with Hooks.
- **TypeScript:** Strict typing. Use `Node`, `ElementNode`, `ValueNode`, `JsonDoc` types from `Document.ts`.
- **Automerge:** When modifying state, use the mutable proxy provided by `changeDoc` (e.g., `doc.nodes[id].tag = "newTag"`).

## `grove-demo.py`
- **Purpose:** Demonstrates the "Grove Calculus" graph representation of HTML.
- **Structure:** Represents the DOM as a set of edges (tuples).
- **Key Function:** `render(edges, root_id, root_type)` converts the graph back to HTML string.

## `proposal/` (LaTeX)
- Standard LaTeX project structure.
- Main file: `proposal.tex`.
