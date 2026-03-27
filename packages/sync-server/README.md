# @mydenicek/sync-server

A reusable sync package for `@mydenicek/core`.

It exports the protocol helpers, `SyncRoom`, `createSyncServer`, and `SyncClient`.

## Run the server app from this repository

```sh
deno run --allow-net --allow-read --allow-write --allow-env apps/sync-server/main.ts
```

See `../../apps/sync-server/README.md` for the runnable app, Docker image, and Azure deployment workflow.

## Use the client helper

```ts
import { Denicek } from "jsr:@mydenicek/core";
import { SyncClient } from "jsr:@mydenicek/sync-server";

const peer = new Denicek("alice", {
  $tag: "root",
  title: "Shared note",
});

const client = new SyncClient({
  url: "ws://127.0.0.1:8787/sync",
  roomId: "demo",
  document: peer,
});

await client.connect();
peer.set("title", "Updated title");
client.syncNow();
```
