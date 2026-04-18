# @mydenicek/react

React hook for the [Denicek](https://jsr.io/@mydenicek/core) collaborative CRDT.
Wraps a `Denicek` instance with React state management — every mutation
automatically re-renders and optionally syncs over WebSocket.

## Installation

```sh
deno add jsr:@mydenicek/react
```

## Usage

```tsx
import { useDenicek } from "@mydenicek/react";

function App() {
  const dk = useDenicek();
  dk.add("", "root", { $tag: "section" });
  return <pre>{JSON.stringify(dk.doc, null, 2)}</pre>;
}
```

### With WebSocket sync

```tsx
import { useDenicek } from "@mydenicek/react";

function Editor() {
  const dk = useDenicek({ sync: { url: "wss://...", roomId: "room1" } });
  dk.add("root/items", "task", "Buy milk");
  return <pre>{JSON.stringify(dk.doc, null, 2)}</pre>;
}
```

## API

### `useDenicek(options?: UseDenicekOptions): UseDenicekReturn`

Returns an object with:

| Property     | Description                                          |
| ------------ | ---------------------------------------------------- |
| `denicek`    | The raw `Denicek` instance for advanced use.         |
| `doc`        | Current materialized document tree (`PlainNode`).    |
| `conflicts`  | Conflict nodes from the last materialization.        |
| `canUndo`    | Whether there is a local edit that can be undone.    |
| `canRedo`    | Whether a previously undone edit can be redone.      |
| `syncStatus` | Current sync status (`"idle"`, `"connected"`, etc.). |
| `version`    | Monotonic counter — increments on every mutation.    |

**Mutations** — all auto-trigger re-render and sync flush:

`add`, `delete`, `set`, `rename`, `insert`, `remove`, `updateTag`, `wrapRecord`,
`wrapList`, `copy`, `get`, `undo`, `redo`.

**Sync control:** `connectSync(opts)`, `disconnectSync()`.

### `UseDenicekOptions`

| Field  | Type          | Description                                        |
| ------ | ------------- | -------------------------------------------------- |
| `peer` | `string?`     | Stable peer identifier. Defaults to a random UUID. |
| `sync` | `SyncOptions` | Initial sync connection. Omit for local-only mode. |

## License

MIT
