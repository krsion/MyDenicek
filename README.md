# MyDenicek: Local-first Software Implementation

- **Specification:** [View PDF](https://github.com/krsion/MyDenicek/blob/main/specification/specification.pdf)
- **Research Project Proposal:** [View PDF](https://github.com/krsion/MyDenicek/blob/main/proposal/proposal.pdf)
- **Live Demo:** [Launch App](https://krsion.github.io/MyDenicek/)
- **Sync Server:** `wss://mydenicek-sync-prod.azurewebsites.net` (Azure App Service)

## Project Overview

MyDenicek is a local-first collaborative document editor using **Loro CRDTs** for synchronization. It is a monorepo with npm workspaces containing a React web app, core libraries, and a sync server. The project builds upon the concepts from the original [Denicek](https://dl.acm.org/doi/10.1145/3746059.3747646) system, replacing Operational Transformation with CRDTs for more robust conflict resolution.

**Online collaboration is live!** Open the [demo](https://krsion.github.io/MyDenicek/) in multiple browser windows to collaborate in real-time. Changes sync automatically via WebSocket.

## Internal State Representation

The application is built on **Loro**, which synchronizes tree-structured state using Conflict-free Replicated Data Types (CRDTs).

### DenicekDocument Read API

The `DenicekDocument` class provides read-only access to the document tree:

```typescript
class DenicekDocument {
  // Read-only API
  getRootId(): string | null;
  getNode(id: string): NodeData | null;
  getChildIds(parentId: string): string[];
  getParentId(nodeId: string): string | null;
  getAllNodes(): Record<string, NodeData>;
  getSnapshot(): Snapshot;
}
```

### NodeData Types

Nodes returned by `getNode()` contain only the node's own data (no children array):

```typescript
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

To get children, use `doc.getChildIds(parentId)` instead of direct property access.

## Architecture

### Package Structure
```
apps/
  mywebnicek/                 # React 19 + Fluent UI web app
  mydenicek-sync-server/      # WebSocket sync server (Loro)
packages/
  mydenicek-core/          # Core CRDT logic (Loro wrapper)
  mydenicek-react/         # React hooks/context
  mydenicek-mcp/              # MCP integration
  mydenicek-integration-tests/ # Cross-package integration tests
```

### Core Architecture Layers

**DenicekDocument** (`packages/mydenicek-core/src/DenicekDocument.ts`)
- Entry point for all document operations
- Wraps Loro internals (no Loro types exposed publicly)
- Provides: mutations via `change()`, undo/redo, export/import, subscriptions, history, replay

**DenicekModel** (`packages/mydenicek-core/src/DenicekModel.ts`)
- Facade for read/write operations, created inside `change()` callbacks
- Delegates to: NodeReader, NodeWriter, NodeCreator, NodeWrapper, SelectionLogic

## Design Decisions & Considerations

### 1. Why are nodes indexed by ID instead of Path?

If we identified nodes by path (e.g., `doc.body.children[2]`), we would face the **"Shifting Index"** problem. For example, if Alice wraps a `<b>` tag in an `<article>` while Bob concurrently renames that same `<b>` to `<strong>`, a path-based approach often results in malformed nesting. The original [Denicek](https://dl.acm.org/doi/10.1145/3746059.3747646) relies on path-based Operational Transformation (OT), which we avoid by using CRDTs.

By using unique IDs, we address the object itself regardless of where it moves in the tree. This aligns with the approach taken in [Martin Kleppmann's JSON CRDT](https://ieeexplore.ieee.org/abstract/document/7909007).

### 2. Why is "Wrap" not supported as a single operation?

The "wrap" operation (create a new parent element and move an existing node into it) was intentionally removed from the system. **Wrap is a compound operation** (create + move), and compound operations cannot be made atomic in local-first software due to the CAP theorem.

**The Problem:**
When two users concurrently wrap the same node, both create wrapper elements and attempt to move the target. After sync:
- One wrapper "wins" the move (gets the child)
- The other wrapper becomes an orphaned empty element

The orphaned wrapper cannot be automatically cleaned up because it is **observationally indistinguishable** from an intentionally created empty element. Any cleanup algorithm would risk deleting legitimate user data.

**The Solution:**
Instead of wrap, users can:
1. **Create** a new parent element manually
2. **Move** the target node into it using Ctrl+X/Ctrl+V (cut/paste)

This decomposition ensures each operation is atomic and conflict-free. Move operations use Last-Writer-Wins (LWW) resolution, which is well-defined and predictable.

See `docs/design/compound-operation-decomposition.md` for the full theoretical analysis, including proofs based on the CAP theorem and CALM theorem.

### 3. Why are nodes stored in a Dictionary (Map) and not a List?

Storing nodes in a list of objects—e.g., `[{id: "A", ...}, {id: "B", ...}]`—allows for duplicate entries of the same ID during concurrent inserts, making updates computationally expensive (requiring O(N) searches).

A Dictionary (`Record<string, Node>`) enforces uniqueness by ID and allows O(1) access. However, because JSON dictionaries are unordered, we store the order of nodes separately in the `children[]` array of the parent element. Note that there could be duplicate IDs in the `children[]` array caused by concurrent adds of the same node.

### 4. Why does DenicekDocument provide a read-only API instead of exposing the Tree directly?

Internally, the document is stored as a `LoroTree`—Loro's native movable tree CRDT that handles concurrent structural edits, move operations, and conflict resolution automatically.

The `DenicekDocument` class provides a **read-only public API** that:
- **Hides CRDT internals**: No Loro types are exposed; applications work with plain TypeScript objects
- **Enables O(1) lookup**: Internal index maps allow efficient node, parent, and children lookups
- **Prevents direct mutation**: Users access data through methods (`getNode()`, `getChildIds()`) instead of property access
- **Simplifies rendering**: React components receive a stable view for efficient diffing
- **Encapsulates internal structure**: The nested tree representation can change without breaking consumers

### 5. Why is node ordering local (per parent) rather than global?

We only need to know the relative order of *siblings* when rendering or editing. A global ordering system would require maintaining a complex mapping of `Global Index <-> Local Index`. By storing order only within the `children` array of `ElementNode`, we simplify the implementation significantly without losing functionality.

### 6. Why Loro instead of Automerge?

The project initially explored Automerge but migrated to Loro for several reasons:
- **Native tree support:** Loro provides `LoroTree` with built-in move and parent-child operations
- **Better conflict resolution:** Native tree conflict resolution handles concurrent structural edits
- **Performance:** Loro's architecture provides efficient incremental updates
- **Active development:** Loro is actively maintained with good TypeScript support

See [README-legacy-automerge.md](./README-legacy-automerge.md) for the previous Automerge-based design.

## Behavior During Concurrent Edits

The following table outlines how the system resolves specific concurrent operations:

| Concurrent Operations | Resolution Behavior | Logic |
| :--- | :--- | :--- |
| **Move (A) vs Move (B)** | **One Move Wins** | Last-Writer-Wins (LWW) determines the final parent. See Loro's movable tree CRDT. |
| **Add Child vs Add Child** | **Both Added** | `addChild` generates a random unique ID. Both nodes appear in the parent's children list. |
| **Rename Tag vs Rename Tag** | **One Tag Wins** | Last-Writer-Wins (LWW) on the `tag` property. |
| **Edit Value vs Edit Value** | **One Value Wins** | LWW on the `value` property. |
| **Delete vs Delete** | **Node Deleted** | Idempotent operation. Node is removed regardless of which delete arrives first. |
| **Move vs Delete** | **Delete Wins** | If a node is deleted, any concurrent move operations are ignored. |
| **Add Child vs Rename Tag** | **Success** | The child is added to the element, which now has a new tag name. |
| **Add Child vs Edit** | **Unreachable** | `Add child` operation is allowed only for `ElementNodes`, while `Edit` operation is allowed only for `ValueNodes`. |
| **Rename Tag vs Edit** | **Unreachable** | `Rename Tag` operation is allowed only for `ElementNodes`, while `Edit` operation is allowed only for `ValueNodes`. |

## Recording/Replay (Programming by Demonstration)

Patches are recorded with generalized node IDs (`$0`, `$1`, etc.). During replay, `$0` is bound to a new starting node, enabling recorded actions to be applied elsewhere. See `DenicekDocument.replay()`.

## Development

### Commands
```bash
npm run dev                            # Start sync server + web app concurrently
npm run dev -w mywebnicek              # Web app only (Vite dev server at localhost:5174)
npm run dev -w @mydenicek/sync-server  # Sync server only (port 3001)

npm run build -w @mydenicek/core    # Build core library (must build before web app)
npm run build -w mywebnicek            # Build web app

npm run test --workspaces              # All tests (unit + E2E)
npm test -w @mydenicek/core         # Core unit tests (Vitest)
npm run test -w mywebnicek             # E2E tests (Playwright)
```

## TODO

### High Priority

| Task | Details |
|------|---------|
| Complete E2E test coverage | Missing: keyboard navigation, attribute editing, delete confirmation, cut/paste move |

### Medium Priority

| Task | Details |
|------|---------|
| Implement remote selection visualization | `useSelection.ts:36` has stubs for `remoteSelections`/`userId` |
| Add Snapshot View UI | `document.getSnapshot()` exists but not exposed in UI (FR-19) |
| Generate API documentation | No generated docs for public APIs (NFR-09) |

### Low Priority

| Task | Details |
|------|---------|
| Add stress tests for large documents | Performance under load untested |
| Consolidate generalization logic | Duplicated in `scriptAnalysis.ts` and `App.tsx` |
| Add deployment guide for sync server | Missing from docs |
### Implementation Status

```
Core Library (FR-01 to FR-13):     13/13 fully implemented
MyWebnicek UI (FR-14 to FR-24):    9/11 full, 2 partial
Non-functional (NFR-01 to NFR-09):  6/9 full, 3 partial

Overall: ~95% feature-complete
```
