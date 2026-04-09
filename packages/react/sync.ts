/**
 * WebSocket sync for the Denicek CRDT.
 *
 * Wraps the {@linkcode SyncClient} from `@mydenicek/sync-server` with
 * React-specific features: reactive status tracking and automatic
 * reconnection with exponential backoff.
 */

import type { Denicek } from "@mydenicek/core";
import {
  computeDocumentHash,
  SyncClient as BaseSyncClient,
} from "@mydenicek/sync-server";

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
 *
 * Internally delegates sync protocol handling to the
 * `SyncClient` from `@mydenicek/sync-server`, adding reactive
 * status tracking and auto-reconnect on top.
 */
export class SyncClient {
  private inner: BaseSyncClient | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private opts: SyncConnectionOptions | null = null;
  private readonly initialDocumentHash: string;

  status: SyncStatus = "idle";

  constructor(
    private denicek: Denicek,
    private onStatusChange: (s: SyncStatus) => void,
    private onRemoteChange: () => void,
  ) {
    this.initialDocumentHash = computeDocumentHash(denicek.materialize());
  }

  /** Connect (or reconnect) to a sync server. */
  connect(opts: SyncConnectionOptions): void {
    this.disconnect();
    this.opts = opts;
    this.setStatus("connecting");

    const inner = new BaseSyncClient({
      url: opts.url,
      roomId: opts.roomId,
      document: this.denicek,
      initialDocumentHash: this.initialDocumentHash,
      onRemoteChange: () => this.onRemoteChange(),
      onDisconnect: () => {
        if (this.inner === inner && this.opts) {
          this.inner = null;
          this.setStatus("disconnected");
          this.scheduleReconnect();
        }
      },
    });
    this.inner = inner;

    inner.connect().then(
      () => {
        if (this.inner === inner) {
          this.reconnectDelay = 1000;
          this.setStatus("connected");
        }
      },
      () => {
        if (this.inner === inner) {
          this.inner = null;
          this.setStatus("disconnected");
          this.scheduleReconnect();
        }
      },
    );
  }

  /** Disconnect from the sync server. */
  disconnect(): void {
    const opts = this.opts;
    this.opts = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.inner) {
      this.inner.close();
      this.inner = null;
    }
    if (opts) {
      this.setStatus("idle");
    }
  }

  /** Send any pending local events to the server. */
  flush(): void {
    if (this.status !== "connected" || !this.inner) return;
    this.inner.syncNow();
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
