# @mydenicek/core

Core library for MyDenicek - a CRDT-based document editing substrate built on Automerge.

## Overview

This package provides:
- **DenicekModel** - Read/write operations on the document tree
- **DenicekStore** - Mutation management with undo/redo and recording support
- **UndoManager** - Undo/redo stack management for Automerge documents
- **Transformations** - Mass actions that propagate to new children after sync

## Installation

```bash
npm install @mydenicek/core
```

## Transformation System

Transformations are "mass actions" applied to all children of a parent node. The key innovation is that transformations are **stored and re-applied after sync**, ensuring that new children added by remote peers also receive the transformation.

### How it works

1. Each node has a `version` field (default: 0) tracking which transformations have been applied
2. Transformations are stored in a `Record<string, Transformation>` keyed by `"${parent}:${version}"` - this ensures no two transformations can have the same version for the same parent
3. When syncing, `applyAllPendingTransformations()` checks each child's version against pending transformations
4. Transformations with `version > child.version` are applied, and the child's version is updated
5. Conflicts are resolved via LWW (Last-Writer-Wins) - if two peers create a transformation with the same key concurrently, only one survives

### Transformation Types

- **rename** - Changes the tag of all element children
- **wrap** - Wraps each child in a new element with the specified tag

## Sync & Conflict Resolution

The library is designed for local-first collaborative editing. Below are the tested scenarios:

### Basic Value Conflicts (LWW)

| Scenario | Peer A | Peer B | Result |
|----------|--------|--------|--------|
| Concurrent value edits | Changes text to "Hello from A" | Changes text to "Hello from B" | LWW picks one value deterministically |
| Concurrent tag changes | Renames to `<div>` | Renames to `<span>` | LWW picks one tag |

### Structural Conflicts

| Scenario | Peer A | Peer B | Result |
|----------|--------|--------|--------|
| Concurrent child additions | Adds `childA` | Adds `childB` | Both children preserved |
| Delete vs Edit | Deletes node | Edits same node | Delete wins (node removed from children) |

### Transformation Sync

| Scenario | Peer A | Peer B | Result |
|----------|--------|--------|--------|
| Transformation to existing children | Adds rename transformation | (no changes) | After sync, B's children are renamed |
| **New child gets transformation** | Adds rename transformation | Adds new child `li4` | After sync, `li4` is renamed too |
| Version prevents re-transform | Has transformation v1 | Child already at v1 | Child not re-transformed |
| Concurrent transformations | Adds rename to `div` (v1) | Adds rename to `span` (v1) | Same key `parent:1` → LWW picks one, only one transformation survives |
| Wrap transformation | Adds wrap with `<article>` | Adds new child | New child gets wrapped |

### Complex Scenarios

| Scenario | Description | Verified Behavior |
|----------|-------------|-------------------|
| Three-way merge | A renames + adds transformation; B edits text + adds child | All changes merged, new child gets transformation |
| Rapid sequential syncs | A→B sync, then C adds child, then B→C sync | C's new child gets A's transformation |

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty transformations array | Handles gracefully, no errors |
| Transformation on non-existent parent | Ignored, no transformation added |
| Node with undefined version | Treated as version 0 |
| Multiple transformations on same parent | Applied in version order |

## Usage Example

```typescript
import { DenicekModel, DenicekStore, UndoManager } from "@mydenicek/core";
import { next as Automerge } from "@automerge/automerge";

// Create initial document
const doc = Automerge.from(DenicekModel.createInitialDocument());

// Make changes
const newDoc = Automerge.change(doc, (d) => {
  const model = new DenicekModel(d);
  
  // Add a transformation that renames all children of root to <div>
  model.addTransformation(model.rootId, "rename", "div");
});

// After receiving remote changes (sync), apply pending transformations
const syncedDoc = Automerge.change(mergedDoc, (d) => {
  const model = new DenicekModel(d);
  model.applyAllPendingTransformations();
});
```

## Testing

```bash
npm test
```

Test files:
- `lca.test.ts` - Lowest Common Ancestor algorithm tests
- `UndoManager.test.ts` - Undo/redo functionality tests
- `sync.test.ts` - Sync and conflict resolution tests
