# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyDenicek is a local-first collaborative document editor using Loro CRDTs for synchronization. It's a monorepo with npm workspaces containing a React web app, core libraries, and a sync server.

## Commands

### Development
```bash
npm run dev                          # Start sync server + web app concurrently
npm run dev -w mywebnicek            # Web app only (Vite dev server at localhost:5174)
npm run dev -w @mydenicek/sync-server # Sync server only (port 3001)
```

### Building
```bash
npm run build -w @mydenicek/core-v2   # Build core library
npm run build -w mywebnicek           # Build web app
```

### Testing
```bash
npm run test --workspaces             # All tests (unit + E2E)
npm test -w @mydenicek/core-v2        # Core unit tests (Vitest)
npm run test -w mywebnicek            # E2E tests (Playwright)
npm run test:ui -w mywebnicek         # Playwright interactive UI
```

### Linting
```bash
npm run lint -w mywebnicek
```

## Architecture

### Package Structure
```
apps/
  mywebnicek/              # React 19 + Fluent UI web app
  mydenicek-sync-server/   # WebSocket sync server (Loro)
packages/
  mydenicek-core-v2/       # Core CRDT logic (Loro wrapper)
  mydenicek-react-v2/      # React hooks/context
  mydenicek-sync-client/   # Sync client wrapper
```

### Core Architecture Layers

**DenicekDocument** (`packages/mydenicek-core-v2/src/DenicekDocument.ts`)
- Entry point for all document operations
- Wraps Loro internals via LoroDocWrapper
- Provides: snapshots, mutations via `change()`, export/import, subscriptions, history/checkout

**DenicekStore** (`packages/mydenicek-core-v2/src/DenicekStore.ts`)
- Transaction management with `modify()` and `modifyTransaction()`
- Undo/Redo via Loro's UndoManager
- Patch history recording

**DenicekModel** (`packages/mydenicek-core-v2/src/DenicekModel.ts`)
- Facade for read/write operations, created inside `change()` callbacks
- Delegates to: NodeReader, NodeWriter, NodeCreator, NodeWrapper, SelectionLogic

### Document Data Structure

Tree of nodes stored in a flat map:
```typescript
interface DocumentSnapshot {
  root: string;                    // Root node ID
  nodes: Record<string, Node>;     // All nodes by ID
}

type Node = ElementNode | ValueNode;

interface ElementNode {
  kind: "element";
  tag: string;
  attrs: Record<string, unknown>;
  children: string[];              // Child node IDs (ordered)
}

interface ValueNode {
  kind: "value";
  value: string;
}
```

### React Integration

**DenicekProvider** - Context providing document, store, snapshot, syncManager

**Key hooks** (in `useDenicekDocument.ts`):
- `useDocumentState()` - access document, store, snapshot
- `useDocumentActions()` - bulk actions (undo, redo, update, wrap, add, delete)
- `useRecording()` - record/replay functionality
- `useSelection()` - node selection management

### Conflict Resolution

Wrap operations use deterministic IDs (`wrapper-${nodeId}`) for idempotent conflict resolution. Concurrent wraps of the same node result in a single wrapper with LWW on tag. Other concurrent edits (add child, text edits) use Loro's native resolution.

## Code Style

- TypeScript strict mode
- Use `unknown` instead of `any`
- Prefix unused variables with `_`
- Import sorting enforced (eslint-plugin-simple-import-sort)
- No unused imports (error level)
