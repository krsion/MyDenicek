/**
 * `useDenicek` — React hook for the Denicek CRDT.
 *
 * Provides the materialized document tree, mutation operations, and
 * optional WebSocket sync. Every mutation automatically re-renders
 * the component.
 *
 * ```tsx
 * const dk = useDenicek({ sync: { url: "wss://...", roomId: "room1" } });
 * dk.add("root/items", "task", "Buy milk");
 * console.log(dk.doc); // materialized tree
 * dk.connectSync({ url: "wss://other", roomId: "room2" }); // switch server
 * ```
 */

import { Denicek, type PlainNode, type PrimitiveValue } from "@mydenicek/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SyncClient,
  type SyncConnectionOptions,
  type SyncStatus,
} from "./sync.ts";

/** Options for {@link useDenicek}. */
export interface SyncOptions {
  /** WebSocket server URL. */
  url: string;
  /** Room identifier to join. */
  roomId: string;
}

/** Options for {@link useDenicek}. */
export interface UseDenicekOptions {
  /** Stable peer identifier. Defaults to a random UUID. */
  peer?: string;
  /** Initial document tree. Applied only on first mount. */
  initialDocument?: PlainNode;
  /** Initial sync connection. Omit for local-only mode. */
  sync?: SyncOptions;
}

/** Return value of {@link useDenicek}. */
export interface UseDenicekReturn {
  /** The raw Denicek instance for advanced use. */
  denicek: Denicek;
  /** Current materialized document tree. */
  doc: PlainNode;
  /** Current conflict nodes from the last materialization. */
  conflicts: PlainNode[];
  /** Whether there is a local edit that can be undone. */
  canUndo: boolean;
  /** Whether a previously undone edit can be redone. */
  canRedo: boolean;
  /** Current sync status. */
  syncStatus: SyncStatus;

  // Mutations (all auto-trigger re-render + sync flush)
  /** Add a named field to every record matched by `target`. */
  add: (target: string, field: string, value: PlainNode) => void;
  /** Delete a named field from every record matched by `target`. */
  delete: (target: string, field: string) => void;
  /** Replace every primitive node matched by `target` with `value`. */
  set: (target: string, value: PrimitiveValue) => void;
  /** Rename a field on every record matched by `target`. */
  rename: (target: string, from: string, to: string) => void;
  /** Append `value` to every list matched by `target`. */
  pushBack: (target: string, value: PlainNode) => void;
  /** Prepend `value` to every list matched by `target`. */
  pushFront: (target: string, value: PlainNode) => void;
  /** Remove the last item from every list matched by `target`. */
  popBack: (target: string) => void;
  /** Remove the first item from every list matched by `target`. */
  popFront: (target: string) => void;
  /** Update the structural tag on every matched node. */
  updateTag: (target: string, tag: string) => void;
  /** Wrap every matched node in a record with the given field and tag. */
  wrapRecord: (target: string, field: string, tag: string) => void;
  /** Wrap every matched node in a single-item list with the given tag. */
  wrapList: (target: string, tag: string) => void;
  /** Copy nodes from `source` into `target`. */
  copy: (target: string, source: string) => void;
  /** Query nodes matching `target` selector (read-only, no re-render). */
  get: (target: string) => PlainNode[];
  /** Undo the last local edit. */
  undo: () => void;
  /** Redo the last undone edit. */
  redo: () => void;

  // Sync control
  /** Connect (or switch) to a sync server. */
  connectSync: (opts: SyncOptions) => void;
  /** Disconnect from the sync server. */
  disconnectSync: () => void;
  /** Pause syncing — closes WebSocket but keeps connection info for resume. */
  pauseSync: () => void;
  /** Resume syncing after a pause — reconnects and flushes pending edits. */
  resumeSync: () => void;

  /** Monotonic version counter — increments on every mutation. */
  version: number;
  /** Force a re-render (e.g. after mutating denicek directly). */
  forceUpdate: () => void;
}

/** React hook for working with a Denicek CRDT document. */
export function useDenicek(options?: UseDenicekOptions): UseDenicekReturn {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Stable Denicek instance
  const dkRef = useRef<Denicek>(null!);
  if (!dkRef.current) {
    dkRef.current = new Denicek(
      options?.peer ?? crypto.randomUUID(),
      options?.initialDocument,
    );
  }
  const dk = dkRef.current;

  // Stable SyncClient instance
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const syncRef = useRef<SyncClient>(null!);
  if (!syncRef.current) {
    syncRef.current = new SyncClient(dk, setSyncStatus, bump);
  }
  const sync = syncRef.current;

  // Auto-connect on mount if sync options provided
  useEffect(() => {
    if (options?.sync) {
      sync.connect(options.sync);
    }
    return () => sync.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrap a CRDT mutation: call it, recompute formulas, bump version, flush sync
  const mutate = useCallback(
    (fn: () => void) => {
      fn();
      try {
        dk.recomputeFormulas();
      } catch {
        // Formula errors are non-fatal
      }
      bump();
      sync.flush();
    },
    [dk, bump, sync],
  );

  // Keep version in scope so doc/conflicts/canUndo/canRedo are fresh
  void version;

  return {
    denicek: dk,
    doc: dk.materialize(),
    conflicts: dk.conflicts,
    canUndo: dk.canUndo,
    canRedo: dk.canRedo,
    syncStatus,

    add: useCallback(
      (t: string, f: string, v: PlainNode) => mutate(() => dk.add(t, f, v)),
      [dk, mutate],
    ),
    delete: useCallback(
      (t: string, f: string) => mutate(() => dk.delete(t, f)),
      [dk, mutate],
    ),
    set: useCallback(
      (t: string, v: PrimitiveValue) => mutate(() => dk.set(t, v)),
      [dk, mutate],
    ),
    rename: useCallback(
      (t: string, from: string, to: string) =>
        mutate(() => dk.rename(t, from, to)),
      [dk, mutate],
    ),
    pushBack: useCallback(
      (t: string, v: PlainNode) => mutate(() => dk.pushBack(t, v)),
      [dk, mutate],
    ),
    pushFront: useCallback(
      (t: string, v: PlainNode) => mutate(() => dk.pushFront(t, v)),
      [dk, mutate],
    ),
    popBack: useCallback(
      (t: string) => mutate(() => dk.popBack(t)),
      [dk, mutate],
    ),
    popFront: useCallback(
      (t: string) => mutate(() => dk.popFront(t)),
      [dk, mutate],
    ),
    updateTag: useCallback(
      (t: string, tag: string) => mutate(() => dk.updateTag(t, tag)),
      [dk, mutate],
    ),
    wrapRecord: useCallback(
      (t: string, f: string, tag: string) =>
        mutate(() => dk.wrapRecord(t, f, tag)),
      [dk, mutate],
    ),
    wrapList: useCallback(
      (t: string, tag: string) => mutate(() => dk.wrapList(t, tag)),
      [dk, mutate],
    ),
    copy: useCallback(
      (t: string, s: string) => mutate(() => dk.copy(t, s)),
      [dk, mutate],
    ),
    get: useCallback((t: string) => dk.get(t), [dk]),
    undo: useCallback(() => mutate(() => dk.undo()), [dk, mutate]),
    redo: useCallback(() => mutate(() => dk.redo()), [dk, mutate]),

    connectSync: useCallback(
      (opts: SyncConnectionOptions) => sync.connect(opts),
      [sync],
    ),
    disconnectSync: useCallback(() => sync.disconnect(), [sync]),
    pauseSync: useCallback(() => sync.pause(), [sync]),
    resumeSync: useCallback(() => sync.resume(), [sync]),

    version,
    forceUpdate: bump,
  };
}
