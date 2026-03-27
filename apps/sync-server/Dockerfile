FROM denoland/deno:2.7.5

WORKDIR /app

COPY deno.json deno.lock ./
COPY apps/sync-server ./apps/sync-server
COPY packages/core ./packages/core
COPY packages/sync-server ./packages/sync-server

RUN deno cache apps/sync-server/main.ts

ENV HOSTNAME=0.0.0.0
ENV PORT=8080
ENV PERSISTENCE_PATH=/home/site/data

EXPOSE 8080

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "apps/sync-server/main.ts"]
