import type { Denicek, PlainNode } from "@mydenicek/core";
import {
  applySyncResponse,
  createSyncRequest,
  type EncodedHelloMessage,
  type EncodedSyncMessage,
  type EncodedSyncResponse,
} from "./protocol.ts";

/**
 * Compute a short hash of a PlainNode for initial document validation.
 * Call this on your initial document BEFORE any edits and pass the result
 * to `SyncClientOptions.initialDocumentHash`.
 */
export function computeDocumentHash(doc: PlainNode): string {
  const json = JSON.stringify(doc);
  let h = 0;
  for (let i = 0; i < json.length; i++) {
    h = ((h << 5) - h + json.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Options for creating a {@linkcode SyncClient}. */
export interface SyncClientOptions {
  /** WebSocket URL of the sync server endpoint. */
  url: string;
  /** Room identifier to join. */
  roomId: string;
  /** The local Denicek document to synchronize. */
  document: Denicek;
  /** Interval in ms between automatic sync requests (default `1000`). */
  autoSyncIntervalMs?: number;
  /**
   * Hash of the initial document (before any events). Used to verify all
   * peers in a room share the same starting state. Omit to skip validation.
   */
  initialDocumentHash?: string;
  /** Called when remote events are applied to the document. */
  onRemoteChange?: (document: Denicek, response: EncodedSyncResponse) => void;
  /** Called when the WebSocket connection closes (both explicit and unexpected). */
  onDisconnect?: () => void;
}

/**
 * WebSocket client that synchronizes a local Denicek document
 * with a remote sync server. Connects, exchanges frontiers, and
 * auto-syncs on a configurable interval.
 */
export class SyncClient {
  private readonly url: string;
  private readonly roomId: string;
  private readonly document: Denicek;
  private readonly autoSyncIntervalMs: number;
  private readonly initialDocumentHash: string;
  private readonly initialDocument: PlainNode;
  private readonly onRemoteChange?: (
    document: Denicek,
    response: EncodedSyncResponse,
  ) => void;
  private readonly onDisconnect?: () => void;
  private socket: WebSocket | null = null;
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private knownServerFrontiers: string[] = [];
  private serverBootstrapped = false;
  private _paused = false;

  /** Create a sync client with the given options. */
  constructor(options: SyncClientOptions) {
    this.url = this.buildSyncUrl(options.url, options.roomId);
    this.roomId = options.roomId;
    this.document = options.document;
    this.autoSyncIntervalMs = options.autoSyncIntervalMs ?? 1000;
    this.initialDocument = options.document.materialize();
    this.initialDocumentHash = options.initialDocumentHash ??
      computeDocumentHash(this.initialDocument);
    this.onRemoteChange = options.onRemoteChange;
    this.onDisconnect = options.onDisconnect;
  }

  /** Whether sync is currently paused. */
  get paused(): boolean {
    return this._paused;
  }

  /**
   * Pause syncing: close the WebSocket, stop auto-sync, suppress reconnect.
   * Local edits continue to accumulate; call `resume()` to sync them later.
   */
  pause(): void {
    this._paused = true;
    this.stopAutoSyncLoop();
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * Resume syncing after a `pause()`. Reconnects and flushes pending edits.
   */
  resume(): void {
    if (!this._paused) return;
    this._paused = false;
    this.connect();
  }

  /** Build the full WebSocket URL with room query parameter. */
  private buildSyncUrl(baseUrl: string, roomId: string): string {
    const url = new URL(baseUrl);
    url.searchParams.set("room", roomId);
    return url.toString();
  }

  /** Open a WebSocket connection to the sync server. */
  connect(): Promise<void> {
    if (this._paused || this.socket !== null) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      socket.onopen = () => {
        this.socket = socket;
        this.startAutoSyncLoop();
        resolve();
      };
      socket.onerror = () => {
        reject(new Error(`Could not connect to sync server '${this.url}'.`));
      };
      socket.onmessage = (event) => this.handleSocketMessage(event.data);
      socket.onclose = () => {
        this.socket = null;
        this.stopAutoSyncLoop();
        this.onDisconnect?.();
      };
    });
  }

  /** Close the WebSocket connection and stop auto-sync. */
  close(): void {
    this.stopAutoSyncLoop();
    this.socket?.close();
    this.socket = null;
  }

  /** Immediately send a sync request with any pending local events. */
  syncNow(): void {
    if (
      this._paused || this.socket === null ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    const request = createSyncRequest(
      this.document,
      this.roomId,
      this.knownServerFrontiers,
      this.initialDocumentHash,
      this.serverBootstrapped ? undefined : this.initialDocument,
    );
    this.socket.send(JSON.stringify(request));
  }

  /** Start the periodic auto-sync timer. */
  private startAutoSyncLoop(): void {
    if (this.autoSyncTimer !== null) {
      return;
    }
    this.autoSyncTimer = setInterval(
      () => this.syncNow(),
      this.autoSyncIntervalMs,
    );
  }

  /** Stop the periodic auto-sync timer. */
  private stopAutoSyncLoop(): void {
    if (this.autoSyncTimer === null) {
      return;
    }
    clearInterval(this.autoSyncTimer);
    this.autoSyncTimer = null;
  }

  /** Dispatch an incoming WebSocket message to the appropriate handler. */
  private handleSocketMessage(rawMessage: string): void {
    if (this._paused) return;
    let message: EncodedSyncMessage;
    try {
      message = JSON.parse(rawMessage) as EncodedSyncMessage;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(
        `Could not parse sync message (${reason}): ${rawMessage.slice(0, 200)}`,
      );
      return;
    }
    if (message.type === "hello") {
      this.handleHelloMessage(message);
      return;
    }
    if (message.type === "error") {
      console.error(message.message);
      return;
    }
    applySyncResponse(this.document, message);
    this.knownServerFrontiers = message.frontiers;
    this.serverBootstrapped = true;
    this.onRemoteChange?.(this.document, message);
  }

  /** Handle the server hello message by triggering an initial sync. */
  private handleHelloMessage(_message: EncodedHelloMessage): void {
    this.syncNow();
  }
}
