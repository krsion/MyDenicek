import type { PlainNode } from "@mydenicek/core";
import type { EncodedHelloMessage, EncodedSyncRequest } from "./protocol.ts";
import { SyncRoom } from "./room.ts";

/** Persisted room data format. */
interface PersistedRoom {
  initialDocument?: PlainNode;
  initialDocumentHash?: string;
  events: unknown[];
}

/** Options for {@linkcode createSyncServer}. */
export interface SyncServerOptions {
  /** Port to listen on (default `8787`). */
  port?: number;
  /** Bind address (default `0.0.0.0`). */
  hostname?: string;
  /** URL path for WebSocket upgrades (default `/sync`). */
  path?: string;
  /** Directory for JSON event persistence. Omit for in-memory only. */
  persistencePath?: string;
}

/** Handle returned by {@linkcode createSyncServer}. */
export interface SyncServerHandle {
  /** The underlying Deno HTTP server. */
  server: Deno.HttpServer<Deno.NetAddr>;
  /** Gracefully shut down, flushing any pending writes. */
  close(): Promise<void>;
}

type ClientState = {
  roomId: string;
  frontiers: string[];
  /** Whether this client has passed initial document hash validation. */
  hashValidated: boolean;
};

function buildRoomFilePath(persistencePath: string, roomId: string): string {
  const safeRoomId = encodeURIComponent(roomId);
  return `${persistencePath}/${safeRoomId}.json`;
}

async function loadRoomEvents(
  persistencePath: string,
  roomId: string,
): Promise<SyncRoom> {
  const roomFilePath = buildRoomFilePath(persistencePath, roomId);
  try {
    const fileText = await Deno.readTextFile(roomFilePath);
    const data = JSON.parse(fileText);
    // Support new format (object with initialDocument) and legacy (raw array)
    if (Array.isArray(data)) {
      const room = new SyncRoom(roomId);
      room.ingestEncodedEvents(data);
      return room;
    }
    const persisted = data as PersistedRoom;
    const room = new SyncRoom(roomId, persisted.initialDocument);
    if (persisted.initialDocumentHash) {
      room.validateAndBootstrap(persisted.initialDocumentHash, undefined);
    }
    room.ingestEncodedEvents(persisted.events);
    return room;
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
  return new SyncRoom(roomId);
}

async function persistRoomEvents(
  persistencePath: string,
  room: SyncRoom,
): Promise<void> {
  await Deno.mkdir(persistencePath, { recursive: true });
  const roomFilePath = buildRoomFilePath(persistencePath, room.id);
  const temporaryRoomFilePath = `${roomFilePath}.${crypto.randomUUID()}.tmp`;
  const data: PersistedRoom = {
    initialDocument: room.initialDocument,
    initialDocumentHash: room.initialDocumentHash,
    events: room.listEncodedEvents(),
  };
  await Deno.writeTextFile(
    temporaryRoomFilePath,
    JSON.stringify(data, null, 2),
  );
  await Deno.rename(temporaryRoomFilePath, roomFilePath);
}

/** Create a WebSocket sync server with optional file-based persistence. */
export function createSyncServer(
  options: SyncServerOptions = {},
): SyncServerHandle {
  const port = options.port ?? 8787;
  const hostname = options.hostname ?? "0.0.0.0";
  const path = options.path ?? "/sync";
  const rooms = new Map<string, SyncRoom>();
  const clients = new Map<WebSocket, ClientState>();
  const pendingRoomWrites = new Map<string, Promise<void>>();

  async function ensureRoomLoaded(roomId: string): Promise<SyncRoom> {
    const existingRoom = rooms.get(roomId);
    if (existingRoom !== undefined) {
      return existingRoom;
    }
    const room = options.persistencePath === undefined
      ? new SyncRoom(roomId)
      : await loadRoomEvents(options.persistencePath, roomId);
    rooms.set(roomId, room);
    return room;
  }

  function broadcastRoomState(changedSocket: WebSocket, room: SyncRoom): void {
    for (const [socket, state] of clients.entries()) {
      // The originating socket already receives its direct sync response in the
      // request handler below, so broadcasting only forwards the merged state
      // to the other sockets in the same room.
      if (
        socket === changedSocket || state.roomId !== room.id ||
        socket.readyState !== WebSocket.OPEN || !state.hashValidated
      ) {
        continue;
      }
      const response = room.computeSyncResponse({
        type: "sync",
        roomId: room.id,
        frontiers: state.frontiers,
        events: [],
      });
      if (response.events.length === 0) {
        continue;
      }
      socket.send(JSON.stringify(response));
      state.frontiers = response.frontiers;
    }
  }

  function enqueueRoomPersistence(room: SyncRoom): Promise<void> {
    const persistencePath = options.persistencePath;
    if (persistencePath === undefined) {
      return Promise.resolve();
    }
    const previousWrite = pendingRoomWrites.get(room.id) ?? Promise.resolve();
    const nextWrite = previousWrite
      .catch(() => undefined)
      .then(() => persistRoomEvents(persistencePath, room))
      .finally(() => {
        if (pendingRoomWrites.get(room.id) === nextWrite) {
          pendingRoomWrites.delete(room.id);
        }
      });
    pendingRoomWrites.set(room.id, nextWrite);
    return nextWrite;
  }

  const server = Deno.serve({ port, hostname }, (request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/healthz") {
      return new Response("ok");
    }
    if (request.method !== "GET" || url.pathname !== path) {
      return new Response("Not found", { status: 404 });
    }

    const roomId = url.searchParams.get("room");
    if (roomId === null || roomId.trim() === "") {
      return new Response("Missing room query parameter.", { status: 400 });
    }
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade request.", {
        status: 400,
      });
    }

    const { socket, response } = Deno.upgradeWebSocket(request);

    socket.onopen = () => {
      clients.set(socket, { roomId, frontiers: [], hashValidated: false });
      const helloMessage: EncodedHelloMessage = { type: "hello", roomId };
      socket.send(JSON.stringify(helloMessage));
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(String(event.data)) as EncodedSyncRequest;
        if (message.type !== "sync") {
          throw new Error(
            `Unsupported sync message type '${
              String((message as { type?: string }).type)
            }'.`,
          );
        }
        const clientState = clients.get(socket);
        const clientRoomId = clientState?.roomId ?? roomId;
        if (message.roomId !== clientRoomId) {
          throw new Error(
            `Socket for room '${clientRoomId}' cannot sync room '${message.roomId}'.`,
          );
        }
        const room = await ensureRoomLoaded(clientRoomId);
        const hashError = room.validateAndBootstrap(
          message.initialDocumentHash,
          message.initialDocument,
        );
        if (hashError) {
          socket.send(JSON.stringify({
            type: "error",
            roomId: clientRoomId,
            message: hashError,
          }));
          return;
        }
        if (clientState !== undefined) {
          clientState.hashValidated = true;
        }
        const responseMessage = room.computeSyncResponse({
          ...message,
          roomId: clientRoomId,
        });
        if (clientState !== undefined) {
          clientState.roomId = room.id;
          clientState.frontiers = responseMessage.frontiers;
        }
        socket.send(JSON.stringify(responseMessage));
        await enqueueRoomPersistence(room);
        broadcastRoomState(socket, room);
      } catch (error) {
        socket.send(JSON.stringify({
          type: "error",
          roomId,
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    };

    socket.onclose = () => {
      clients.delete(socket);
    };

    return response;
  });

  return {
    server,
    close: async () => {
      await server.shutdown();
      if (options.persistencePath !== undefined && pendingRoomWrites.size > 0) {
        const writes = Array.from(pendingRoomWrites.values());
        try {
          await Promise.all(writes);
        } catch (error) {
          console.error(
            "Error while flushing pending room writes during server close:",
            error,
          );
        }
      }
    },
  };
}
