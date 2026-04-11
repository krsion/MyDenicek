# sync-server app

The runnable WebSocket sync server for `@mydenicek/core`.

The server stores Denicek events per room and forwards missing events to
connected peers. Clients in the same room must start from the same initial
document, just like direct peer-to-peer sync with `Denicek`.

## Run the server

```sh
deno run --allow-net --allow-read --allow-write --allow-env apps/sync-server/main.ts
```

Environment variables:

- `PORT` — WebSocket port (default `8787`)
- `HOSTNAME` — bind address (default `0.0.0.0`)
- `PERSISTENCE_PATH` — directory for JSON event logs (default `./data`)

## Run the container

Build from the repository root so the Docker build context includes both
`apps/sync-server`, `packages/sync`, and `packages/core`.

```sh
docker build -f apps/sync-server/Dockerfile -t mydenicek-sync-server .
docker run --rm -p 8787:8080 mydenicek-sync-server
```

Useful container environment variables:

- `PORT` — container port (defaults to `8080` in the Docker image)
- `HOSTNAME` — bind address (defaults to `0.0.0.0`)
- `PERSISTENCE_PATH` — persisted data path (defaults to `/home/site/data` in the
  Docker image)

## Deploy to Azure Container Apps

The CI/CD workflow `.github/workflows/deno.yml` builds the Docker image, pushes
it to Azure Container Registry, and deploys to Azure Container Apps on every
push to `main`.

See `../../infra/azure/sync-server/README.md` for the OIDC setup, GitHub
variables, and Bicep infrastructure details.
