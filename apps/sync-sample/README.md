# sync-sample

A tiny terminal app that connects a `Denicek` peer to the sync server.

Run the server first:

```sh
deno run --allow-net --allow-read --allow-write --allow-env packages/sync-server/main.ts
```

Then start two peers in separate terminals:

```sh
deno run --allow-net apps/sync-sample/main.ts --peer alice
deno run --allow-net apps/sync-sample/main.ts --peer bob
```

Useful commands inside the app:

- `show`
- `set-title <text>`
- `add-item <text>`
- `toggle <index>`
- `sync`
- `frontiers`
- `help`
- `exit`
