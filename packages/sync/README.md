# @mydenicek/sync

A reusable sync package for `@mydenicek/core`.

It exports the protocol helpers, `SyncRoom`, `createSyncServer`, and
`SyncClient`.

## Run the server app from this repository

```sh
deno run --allow-net --allow-read --allow-write --allow-env apps/sync-server/main.ts
```

See `../../apps/sync-server/README.md` for the runnable app, Docker image, and
Azure deployment workflow.

## Use the client helper

```ts
import { Denicek } from "jsr:@mydenicek/core";
import { computeDocumentHash, SyncClient } from "jsr:@mydenicek/sync";

const initialDoc = { $tag: "root", title: "Shared note" };
const peer = new Denicek("alice", initialDoc);

const client = new SyncClient({
  url: "ws://127.0.0.1:8787/sync",
  roomId: "demo",
  document: peer,
  initialDocumentHash: computeDocumentHash(initialDoc),
});

await client.connect();
peer.add("", "count", 0);
client.syncNow();
```

## Initial document validation

All peers in a room must start from the same initial document. The sync server
enforces this by comparing document hashes:

1. The first client to sync sets the room's expected hash.
2. Subsequent clients with a different hash receive an error response.
3. Clients that omit the hash are accepted (backward compatibility).

Use `computeDocumentHash()` to compute the hash from your initial document
**before any edits**, and pass it as `initialDocumentHash` when creating a
`SyncClient`. This prevents silent corruption when peers accidentally use
different starting documents.
