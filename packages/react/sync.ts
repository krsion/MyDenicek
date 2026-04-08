/**
 * WebSocket sync for the Denicek CRDT.
 *
 * Uses the same protocol as `@mydenicek/sync-server`:
 * - Connect to `/sync?room=<roomId>`
 * - Server sends `{ type: "hello", roomId }` on open
 * - Client/server exchange `{ type: "sync", roomId, frontiers, events }`
 *
 * The client tracks the last-known server frontiers to send only
 * incremental diffs.
 */

import type { Denicek } from "@mydenicek/core";

/** Reactive sync status. */
export type SyncStatus = "idle" | "connecting" | "connected" | "disconnected";

/** Options for connecting to a sync server. */
export interface SyncConnectionOptions {
  /** WebSocket URL of the sync server (e.g. `wss://host/sync`). */
  url: string;
  /** Room identifier to join. */
  roomId: string;
}

/**
 * Manages a WebSocket connection for syncing a Denicek instance.
 * Call `connect()` to start, `disconnect()` to stop.
 * After every local mutation, call `flush()` to send pending events.
 */
export class SyncClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private opts: SyncConnectionOptions | null = null;
  private knownServerFrontiers: string[] = [];
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;

  status: SyncStatus = "idle";

  constructor(
    private denicek: Denicek,
    private onStatusChange: (s: SyncStatus) => void,
    private onRemoteChange: () => void,
  ) {}

  /** Connect (or reconnect) to a sync server. */
  connect(opts: SyncConnectionOptions): void {
    this.disconnect();
    this.opts = opts;
    this.knownServerFrontiers = [];
    this.setStatus("connecting");

    // Build URL with room query parameter
    const url = new URL(opts.url);
    url.searchParams.set("room", opts.roomId);
    const ws = new WebSocket(url.toString());
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.setStatus("connected");
      // Server will send "hello" first, then we start syncing
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "hello") {
          // Server greeted us — send initial sync request
          this.sendSyncRequest();
          this.startAutoSync();
        } else if (msg.type === "sync") {
          // Apply remote events
          if (Array.isArray(msg.events)) {
            for (const event of msg.events) {
              this.denicek.applyRemote(event);
            }
          }
          if (Array.isArray(msg.frontiers)) {
            this.knownServerFrontiers = msg.frontiers;
          }
          this.onRemoteChange();
        } else if (msg.type === "error") {
          console.error("[sync] Server error:", msg.message);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      this.stopAutoSync();
      if (this.opts) {
        this.setStatus("disconnected");
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  /** Disconnect from the sync server. */
  disconnect(): void {
    const opts = this.opts;
    this.opts = null;
    this.stopAutoSync();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (opts) {
      this.setStatus("idle");
    }
  }

  /** Send any pending local events to the server. */
  flush(): void {
    this.sendSyncRequest();
  }

  private sendSyncRequest(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.opts) return;

    const events = this.denicek.eventsSince(this.knownServerFrontiers);
    this.ws.send(JSON.stringify({
      type: "sync",
      roomId: this.opts.roomId,
      frontiers: this.denicek.frontiers,
      events,
    }));
  }

  private startAutoSync(): void {
    this.stopAutoSync();
    this.autoSyncTimer = setInterval(() => this.sendSyncRequest(), 1000);
  }

  private stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  private setStatus(s: SyncStatus): void {
    if (this.status !== s) {
      this.status = s;
      this.onStatusChange(s);
    }
  }

  private scheduleReconnect(): void {
    if (!this.opts) return;
    this.reconnectTimer = setTimeout(() => {
      if (this.opts) this.connect(this.opts);
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }
}

