import type { EncodedHelloMessage, EncodedSyncRequest } from './protocol.ts';
import { SyncRoom } from './room.ts';

export interface SyncServerOptions {
  port?: number;
  hostname?: string;
  path?: string;
  persistencePath?: string;
}

export interface SyncServerHandle {
  server: Deno.HttpServer<Deno.NetAddr>;
  close(): Promise<void>;
}

type ClientState = {
  roomId: string;
  frontiers: string[];
};

function buildRoomFilePath(persistencePath: string, roomId: string): string {
  const safeRoomId = encodeURIComponent(roomId);
  return `${persistencePath}/${safeRoomId}.json`;
}

async function loadRoomEvents(persistencePath: string, roomId: string): Promise<SyncRoom> {
  const room = new SyncRoom(roomId);
  const roomFilePath = buildRoomFilePath(persistencePath, roomId);
  try {
    const fileText = await Deno.readTextFile(roomFilePath);
    room.ingestEncodedEvents(JSON.parse(fileText));
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
  return room;
}

async function persistRoomEvents(persistencePath: string, room: SyncRoom): Promise<void> {
  await Deno.mkdir(persistencePath, { recursive: true });
  const roomFilePath = buildRoomFilePath(persistencePath, room.id);
  const temporaryRoomFilePath = `${roomFilePath}.${crypto.randomUUID()}.tmp`;
  await Deno.writeTextFile(temporaryRoomFilePath, JSON.stringify(room.listEncodedEvents(), null, 2));
  await Deno.rename(temporaryRoomFilePath, roomFilePath);
}

export function createSyncServer(options: SyncServerOptions = {}): SyncServerHandle {
  const port = options.port ?? 8787;
  const hostname = options.hostname ?? '0.0.0.0';
  const path = options.path ?? '/sync';
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

  async function broadcastRoomState(changedSocket: WebSocket, room: SyncRoom): Promise<void> {
    for (const [socket, state] of clients.entries()) {
      // The originating socket already receives its direct sync response in the
      // request handler below, so broadcasting only forwards the merged state
      // to the other sockets in the same room.
      if (socket === changedSocket || state.roomId !== room.id || socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      const response = room.computeSyncResponse({
        type: 'sync',
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

  const server = Deno.serve({ port, hostname }, async (request) => {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return new Response('ok');
    }
    if (request.method !== 'GET' || url.pathname !== path) {
      return new Response('Not found', { status: 404 });
    }

    const roomId = url.searchParams.get('room');
    if (roomId === null || roomId.trim() === '') {
      return new Response('Missing room query parameter.', { status: 400 });
    }
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade request.', { status: 400 });
    }

    const { socket, response } = Deno.upgradeWebSocket(request);

    socket.onopen = () => {
      clients.set(socket, { roomId, frontiers: [] });
      const helloMessage: EncodedHelloMessage = { type: 'hello', roomId };
      socket.send(JSON.stringify(helloMessage));
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(String(event.data)) as EncodedSyncRequest;
        if (message.type !== 'sync') {
          throw new Error(`Unsupported sync message type '${String((message as { type?: string }).type)}'.`);
        }
        const clientState = clients.get(socket);
        const clientRoomId = clientState?.roomId ?? roomId;
        if (message.roomId !== clientRoomId) {
          throw new Error(`Socket for room '${clientRoomId}' cannot sync room '${message.roomId}'.`);
        }
        const room = await ensureRoomLoaded(clientRoomId);
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
        await broadcastRoomState(socket, room);
      } catch (error) {
        socket.send(JSON.stringify({
          type: 'error',
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
    close: () => server.shutdown(),
  };
}
