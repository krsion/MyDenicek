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
  mydenicek-core-v2/          # Core CRDT logic (Loro wrapper)
  mydenicek-react-v2/         # React hooks/context
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

**Our Solution:**
To achieve outcome #1, we generate a deterministic ID for the wrapper node, such as `w-${wrapped-element-id}`.
* Because both clients generate the *same ID* for the new parent, Loro treats this as a concurrent edit to the *same object*.
* Loro's built-in **Last-Writer-Wins (LWW)** logic resolves the conflict on the `tag` property (choosing either `ul` or `ol`), preventing the creation of two separate wrapper nodes.

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
| **Wrap (A) vs Wrap (B)** | **Single Wrapper** | Uses deterministic ID generation for the wrapper (`w-${nodeId}`). The tag (A or B) is decided by LWW. |
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

npm run build -w @mydenicek/core-v2    # Build core library (must build before web app)
npm run build -w mywebnicek            # Build web app

npm run test --workspaces              # All tests (unit + E2E)
npm test -w @mydenicek/core-v2         # Core unit tests (Vitest)
npm run test -w mywebnicek             # E2E tests (Playwright)
```
