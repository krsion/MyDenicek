import { Denicek } from '../core/mod.ts';
import {
  applySyncResponse,
  createSyncRequest,
  type EncodedHelloMessage,
  type EncodedSyncMessage,
  type EncodedSyncResponse,
} from './protocol.ts';

export interface SyncClientOptions {
  url: string;
  roomId: string;
  document: Denicek;
  autoSyncIntervalMs?: number;
  onRemoteChange?: (document: Denicek, response: EncodedSyncResponse) => void;
}

export class SyncClient {
  private readonly url: string;
  private readonly roomId: string;
  private readonly document: Denicek;
  private readonly autoSyncIntervalMs: number;
  private readonly onRemoteChange?: (document: Denicek, response: EncodedSyncResponse) => void;
  private socket: WebSocket | null = null;
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private knownServerFrontiers: string[] = [];

  constructor(options: SyncClientOptions) {
    this.url = this.computeSyncUrl(options.url, options.roomId);
    this.roomId = options.roomId;
    this.document = options.document;
    this.autoSyncIntervalMs = options.autoSyncIntervalMs ?? 1000;
    this.onRemoteChange = options.onRemoteChange;
  }

  private computeSyncUrl(baseUrl: string, roomId: string): string {
    const url = new URL(baseUrl);
    url.searchParams.set('room', roomId);
    return url.toString();
  }

  connect(): Promise<void> {
    if (this.socket !== null) {
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
      };
    });
  }

  async close(): Promise<void> {
    this.stopAutoSyncLoop();
    this.socket?.close();
    this.socket = null;
  }

  syncNow(): void {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const request = createSyncRequest(this.document, this.roomId, this.knownServerFrontiers);
    this.socket.send(JSON.stringify(request));
  }

  private startAutoSyncLoop(): void {
    if (this.autoSyncTimer !== null) {
      return;
    }
    this.autoSyncTimer = setInterval(() => this.syncNow(), this.autoSyncIntervalMs);
  }

  private stopAutoSyncLoop(): void {
    if (this.autoSyncTimer === null) {
      return;
    }
    clearInterval(this.autoSyncTimer);
    this.autoSyncTimer = null;
  }

  private handleSocketMessage(rawMessage: string): void {
    const message = JSON.parse(rawMessage) as EncodedSyncMessage;
    if (message.type === 'hello') {
      this.handleHelloMessage(message);
      return;
    }
    if (message.type === 'error') {
      console.error(message.message);
      return;
    }
    applySyncResponse(this.document, message);
    this.knownServerFrontiers = [...message.frontiers];
    this.onRemoteChange?.(this.document, message);
  }

  private handleHelloMessage(_message: EncodedHelloMessage): void {
    this.syncNow();
  }
}
