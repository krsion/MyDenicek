# @mydenicek/mywebnicek

A production-oriented browser UI for Mydenicek that syncs through the deployed
WebSocket sync server while still surfacing the event DAG, conflicts, and local
document state for debugging.

## Quick start

```sh
cd apps/mywebnicek
deno install
deno task dev
```

Then open <http://localhost:5173> and connect to a room.

From the workspace root you can also use:

```sh
deno task mywebnicek:install
deno task mywebnicek:dev
```

## Running tests

```sh
cd apps/mywebnicek
deno task test
```

## Notes

- The sync server URL is configurable in the UI.
- The default URL points at the deployed Azure sync server.
- You can override the initial sync server URL with `?syncServerUrl=wss://...` and the latest URL is remembered locally in the browser.
- The local document starts from the same initial shape as the playground so
  rooms can be explored with a consistent baseline.
