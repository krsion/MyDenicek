# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyDenicek is a local-first collaborative document editor using Loro CRDTs for synchronization. It's a monorepo with npm workspaces containing a React web app, core libraries, and a sync server.

## Commands

### Development
```bash
npm run dev                            # Start sync server + web app concurrently
npm run dev -w mywebnicek              # Web app only (Vite dev server at localhost:5174)
npm run dev -w @mydenicek/sync-server  # Sync server only (port 3001)
```

### Building
```bash
npm run build -w @mydenicek/core-v2    # Build core library (must build before web app)
npm run build -w mywebnicek            # Build web app
```

### Testing
```bash
npm run test --workspaces              # All tests (unit + E2E)
npm test -w @mydenicek/core-v2         # Core unit tests (Vitest)
npm test -w @mydenicek/integration-tests  # Integration tests (Vitest)
npm run test -w mywebnicek             # E2E tests (Playwright)
npm run test:ui -w mywebnicek          # Playwright interactive UI
```

### Linting
```bash
npm run lint -w mywebnicek
```

## Architecture

### Package Structure
```
apps/
  mywebnicek/                 # React 19 + Fluent UI web app
  mydenicek-sync-server/      # WebSocket sync server (Loro)
packages/
  mydenicek-core-v2/          # Core CRDT logic (Loro wrapper)
  mydenicek-react-v2/         # React hooks/context
  mydenicek-sync-client/      # WebSocket sync client (loro-websocket)
  mydenicek-mcp/              # MCP integration
  mydenicek-integration-tests/ # Cross-package integration tests
```

### Core Architecture Layers

**DenicekDocument** (`packages/mydenicek-core-v2/src/DenicekDocument.ts`)
- Entry point for all document operations
- Wraps Loro internals via LoroDocWrapper (no Loro types exposed publicly)
- Provides: snapshots, mutations via `change()`, export/import, subscriptions, history/checkout

**DenicekStore** (`packages/mydenicek-core-v2/src/DenicekStore.ts`)
- Transaction management with `modify()` and `modifyTransaction()`
- Undo/Redo via Loro's UndoManager
- Patch history recording for replay functionality

**DenicekModel** (`packages/mydenicek-core-v2/src/DenicekModel.ts`)
- Facade for read/write operations, created inside `change()` callbacks
- Delegates to: NodeReader, NodeWriter, NodeCreator, NodeWrapper, SelectionLogic

### Document Data Structure

Document state is exposed via a `DocumentView` class with O(1) lookups:

```typescript
class DocumentView {
  getRootId(): string | null;
  getNode(id: string): NodeData | null;
  getChildIds(parentId: string): string[];
  getParentId(nodeId: string): string | null;
  getAllNodeIds(): string[];
  *walkDepthFirst(): Generator<{ node: NodeData; depth: number; parentId: string | null }>;
}

// Node data returned by getNode() - no children array (use getChildIds instead)
interface ElementNodeData {
  id: string;
  kind: "element";
  tag: string;
  attrs: Record<string, unknown>;
}

interface ValueNodeData {
  id: string;
  kind: "value";
  value: string;
}

type NodeData = ElementNodeData | ValueNodeData;
```

**Why DocumentView class:** Encapsulates internal nested tree structure. Users access data through methods (`getNode()`, `getChildIds()`) preventing direct mutation. Internal structure can change without breaking consumers.

### React Integration

**DenicekProvider** - Context providing document, store, snapshot, syncManager

**Key hooks** (in `packages/mydenicek-react-v2/src/useDenicekDocument.ts`):
- `useDocumentState()` - access document, store, snapshot
- `useDocumentActions()` - bulk actions (undo, redo, update, wrap, add, delete)
- `useRecording()` - record/replay functionality (programming by demonstration)
- `useSelection()` - node selection management

### Conflict Resolution

| Concurrent Operations | Resolution |
|----------------------|------------|
| Wrap vs Wrap (same node) | Single wrapper, LWW on tag (uses deterministic ID `wrap-${nodeId}`) |
| Add Child vs Add Child | Both added (random unique IDs) |
| Rename Tag vs Rename Tag | LWW |
| Edit Value vs Edit Value | LWW |

### Recording/Replay (Programming by Demonstration)

Patches are recorded with generalized node IDs (`$0`, `$1`, etc.). During replay, `$0` is bound to a new starting node, enabling recorded actions to be applied elsewhere. See `DenicekStore.replay()`.

## Code Style

- TypeScript strict mode
- Use `unknown` instead of `any`
- Prefix unused variables with `_`
- Import sorting enforced (eslint-plugin-simple-import-sort)
- No unused imports (error level)
- UI components: React 19 + Fluent UI (`@fluentui/react-components`)
- Icons: `@fluentui/react-icons`
