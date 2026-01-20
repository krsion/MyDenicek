# MyDenicek: Local-first Software Implementation

- **Research Project Proposal:** [View PDF](https://github.com/krsion/MyDenicek/blob/main/proposal/proposal.pdf)
- **Live Demo (WIP):** [Launch App](https://krsion.github.io/MyDenicek/)

## Project Overview

MyDenicek is a local-first collaborative document editor using **Loro CRDTs** for synchronization. It is a monorepo with npm workspaces containing a React web app, core libraries, and a sync server. The project builds upon the concepts from the original [Denicek](https://dl.acm.org/doi/10.1145/3746059.3747646) system, replacing Operational Transformation with CRDTs for more robust conflict resolution.

## Internal State Representation

The application is built on **Loro**, which synchronizes tree-structured state using Conflict-free Replicated Data Types (CRDTs).

### DocumentView Class

The document state is exposed via a `DocumentView` class that encapsulates the tree structure and provides read-only access through methods:

```typescript
class DocumentView {
  // Read-only API - internal tree structure is hidden
  getRootId(): string | null;
  getNode(id: string): NodeData | null;
  getChildIds(parentId: string): string[];
  getParentId(nodeId: string): string | null;
  getAllNodeIds(): string[];
  hasNode(id: string): boolean;
  getNodeCount(): number;

  // Iteration
  *walkDepthFirst(): Generator<{ node: NodeData; depth: number; parentId: string | null }>;
}
```

### NodeData Types

Nodes returned by `DocumentView.getNode()` contain only the node's own data (no children array):

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

To get children, use `view.getChildIds(parentId)` instead of direct property access.

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
- Wraps Loro internals via LoroDocWrapper (no Loro types exposed publicly)
- Provides: snapshots, mutations via `change()`, export/import, subscriptions, history/checkout

**DenicekStore** (`packages/mydenicek-core/src/DenicekStore.ts`)
- Transaction management with `modify()` and `modifyTransaction()`
- Undo/Redo via Loro's UndoManager
- Patch history recording for replay functionality

**DenicekModel** (`packages/mydenicek-core/src/DenicekModel.ts`)
- Facade for read/write operations, created inside `change()` callbacks
- Delegates to: NodeReader, NodeWriter, NodeCreator, NodeWrapper, SelectionLogic

## Design Decisions & Considerations

### 1. Why are nodes indexed by ID instead of Path?

If we identified nodes by path (e.g., `doc.body.children[2]`), we would face the **"Shifting Index"** problem. For example, if Alice wraps a `<b>` tag in an `<article>` while Bob concurrently renames that same `<b>` to `<strong>`, a path-based approach often results in malformed nesting. The original [Denicek](https://dl.acm.org/doi/10.1145/3746059.3747646) relies on path-based Operational Transformation (OT), which we avoid by using CRDTs.

By using unique IDs, we address the object itself regardless of where it moves in the tree. This aligns with the approach taken in [Martin Kleppmann's JSON CRDT](https://ieeexplore.ieee.org/abstract/document/7909007).

### 2. How should concurrent "Wrap" operations behave?

Consider a scenario where Alice wraps a list item `<li>` in a `<ul>` (unordered list), while Bob concurrently wraps the same `<li>` in an `<ol>` (ordered list).

**Possible Outcomes:**
1. **Winner-Takes-All (Preferred):** The result is either `<ul><li>...</li></ul>` OR `<ol><li>...</li></ol>`. The conflict is resolved by the system, but the user can switch the tag later via the UI.
2. **Double Wrapping:** `<ul><ol><li>...</li></ol></ul>`. This creates a nested list that neither user intended.
3. **Duplication:** `<ul><li>...</li></ul>` AND `<ol><li>...</li></ol>` (Two separate lists). This requires manual conflict resolution to delete the duplicate.

**Current Behavior (Implemented):**
We achieve **outcome #1 (Winner-Takes-All)** through post-merge cleanup:
1. After sync completes, we detect orphaned empty wrappers created concurrently with a sibling wrapper
2. Using Loro's lamport timestamps, we apply LWW to determine the winning tag
3. The orphaned wrapper is deleted, leaving a single wrapper with the winning tag

**Implementation Details:**
Since Loro's tree API (`LoroTree.createNode()`) doesn't support custom IDs, we can't prevent double-wrapping at creation time. Instead, the `cleanupRedundantWrappers()` method runs after sync to:
* Detect orphaned empty wrappers (one wrapper "won" the move conflict, leaving the other empty)
* Use `areNodesConcurrent()` to verify they were created concurrently (not intentional sequential nesting)
* Delete the orphaned wrapper while preserving intentional nested structures

See `packages/mydenicek-integration-tests/src/concurrent-wrap.test.ts` for tests verifying the behavior.

**Why not "Mass Actions"?**
An earlier approach considered propagating structural operations (like wrap) to causally concurrent additions—e.g., if user A wraps all list items while user B adds a new item, A's wrap would automatically apply to B's new item after sync. This "mass actions" approach was abandoned because:
* It required fragile synchronization between action metadata and document state
* LWW conflicts between concurrent transformations could desync replicas
* Undo-redo operations would themselves need syncing, compounding fragility
* Building this on top of Loro's existing CRDT semantics was fundamentally hacky

The current approach adopts **traditional CRDT semantics**: operations only affect causally preceding state (per [Shapiro et al.](https://hal.inria.fr/inria-00555588)). This is more predictable—concurrent operations don't unexpectedly affect each other. Users can explicitly replay actions on new nodes via the Recording/Replay feature if needed. See [Issue #6](https://github.com/krsion/MyDenicek/issues/6) for the full rationale.

### 3. Why are nodes stored in a Dictionary (Map) and not a List?

Storing nodes in a list of objects—e.g., `[{id: "A", ...}, {id: "B", ...}]`—allows for duplicate entries of the same ID during concurrent inserts, making updates computationally expensive (requiring O(N) searches).

A Dictionary (`Record<string, Node>`) enforces uniqueness by ID and allows O(1) access. However, because JSON dictionaries are unordered, we store the order of nodes separately in the `children[]` array of the parent element. Note that there could be duplicate IDs in the `children[]` array caused by concurrent adds of the same node.

### 4. Why use a DocumentView class instead of exposing the Tree directly?

Internally, the document is stored as a `LoroTree`—Loro's native movable tree CRDT that handles concurrent structural edits, move operations, and conflict resolution automatically.

The `DocumentView` class provides a **read-only public API** that:
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
| **Wrap (A) vs Wrap (B)** | **One Wrapper Wins** | Post-merge cleanup detects concurrent wrappers and deletes the orphaned one. LWW determines the winning tag. See Design Decisions #2. |
| **Add Child vs Add Child** | **Both Added** | `addChild` generates a random unique ID. Both nodes appear in the parent's children list. |
| **Rename Tag vs Rename Tag** | **One Tag Wins** | Last-Writer-Wins (LWW) on the `tag` property. |
| **Edit Value vs Edit Value** | **One Value Wins** | LWW on the `value` property. |
| **Wrap vs Add Child** | **Success** | The child is added to the intended parent (inner node), not the wrapper. |
| **Wrap vs Rename Tag** | **Success** | The correct node is wrapped, and the correct node is renamed. |
| **Wrap vs Edit Value** | **Success** | The correct node is wrapped, and its content is updated. |
| **Add Child vs Rename Tag** | **Success** | The child is added to the element, which now has a new tag name. |
| **Add Child vs Edit** | **Unreachable** | `Add child` operation is allowed only for `ElementNodes`, while `Edit` operation is allowed only for `ValueNodes`. |
| **Rename Tag vs Edit** | **Unreachable** | `Rename Tag` operation is allowed only for `ElementNodes`, while `Edit` operation is allowed only for `ValueNodes`. |

## Recording/Replay (Programming by Demonstration)

Patches are recorded with generalized node IDs (`$0`, `$1`, etc.). During replay, `$0` is bound to a new starting node, enabling recorded actions to be applied elsewhere. See `DenicekStore.replay()`.

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
| Complete E2E test coverage | Missing: keyboard navigation, attribute editing, wrap operations |

### Medium Priority

| Task | Details |
|------|---------|
| Implement remote selection visualization | `useSelection.ts:36` has stubs for `remoteSelections`/`userId` |
| Add Snapshot View UI | `document.getSnapshot()` exists but not exposed in UI (FR-19) |
| Make JSON View interactive | Currently read-only; implement JSON patch on edit (FR-18) |
| Generate API documentation | No generated docs for public APIs (NFR-09) |

### Low Priority

| Task | Details |
|------|---------|
| Add stress tests for large documents | Performance under load untested |
| Consolidate generalization logic | Duplicated in `scriptAnalysis.ts` and `App.tsx` |
| Add deployment guide for sync server | Missing from docs |
| Measure and document sync latency | Configurable but not measured (NFR-04) |

### Implementation Status

```
Core Library (FR-01 to FR-10):     10/10 fully implemented
MyWebnicek UI (FR-11 to FR-19):     7/9 full, 2 partial
Non-functional (NFR-01 to NFR-09):  5/9 full, 4 partial

Overall: ~92% feature-complete
```
