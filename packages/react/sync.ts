/**
 * WebSocket sync for the Denicek CRDT.
 *
 * Sends local events via `drain()` and ingests remote events via
 * `applyRemote()` over a plain WebSocket. The protocol is intentionally
 * minimal — JSON messages with `type` + `payload`.
 */

import type { Denicek } from "@mydenicek/core";

/** Reactive sync status. */
export type SyncStatus = "idle" | "connecting" | "connected" | "disconnected";

/** Options for connecting to a sync server. */
export interface SyncConnectionOptions {
  url: string;
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
    this.setStatus("connecting");

    const ws = new WebSocket(opts.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.setStatus("connected");
      // Send join + catch-up request
      ws.send(JSON.stringify({
        type: "join",
        roomId: opts.roomId,
        frontiers: this.denicek.frontiers,
      }));
      // Flush any pending local events
      this.flush();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "events" && Array.isArray(msg.events)) {
          for (const event of msg.events) {
            this.denicek.applyRemote(event);
          }
          this.onRemoteChange();
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
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
    this.opts = null; // prevent reconnect
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const events = this.denicek.drain();
    if (events.length > 0) {
      this.ws.send(JSON.stringify({ type: "events", events }));
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
