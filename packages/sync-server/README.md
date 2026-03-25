# @mydenicek/sync-server

A small WebSocket sync server for `@mydenicek/core`.

The server stores Denicek events per room and forwards missing events to connected peers. Clients in the same room must start from the same initial document, just like direct peer-to-peer sync with `Denicek`.

## Run the server

```sh
deno run --allow-net --allow-read --allow-write --allow-env packages/sync-server/main.ts
```

Environment variables:

- `PORT` — WebSocket port (default `8787`)
- `HOSTNAME` — bind address (default `0.0.0.0`)
- `PERSISTENCE_PATH` — directory for JSON event logs (default `./data`)

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
