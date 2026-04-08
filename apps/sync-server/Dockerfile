FROM denoland/deno:2.7.5

WORKDIR /app

COPY deno.json deno.lock ./
COPY apps/sync-server ./apps/sync-server
COPY packages/core ./packages/core
COPY packages/react ./packages/react
COPY packages/sync-server ./packages/sync-server

# Create stub workspace members that the sync server doesn't need
RUN mkdir -p apps/playground apps/mywebnicek && \
    echo '{}' > apps/playground/deno.json && \
    echo '{}' > apps/mywebnicek/deno.json

RUN deno cache apps/sync-server/main.ts

ENV HOSTNAME=0.0.0.0
ENV PORT=8080
ENV PERSISTENCE_PATH=/home/site/data

EXPOSE 8080

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "apps/sync-server/main.ts"]
