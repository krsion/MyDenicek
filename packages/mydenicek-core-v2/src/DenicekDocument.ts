/**
 * DenicekDocument - Main document abstraction for mydenicek-core-v2
 * This class wraps the Loro document and provides a public API
 * Includes undo/redo, history tracking, sync, and replay functionality
 */

import { Frontiers, LoroDoc, UndoManager } from "loro-crdt";
import type { LoroWebsocketClient, LoroWebsocketClientRoom } from "loro-websocket/client";
import { DenicekModel } from "./DenicekModel.js";
import {
    areNodesConcurrent,
    buildDocumentIndex,
    type DocumentIndex,
    stringToTreeId,
    TREE_CONTAINER
} from "./loroHelpers.js";
import type { GeneralizedPatch, NodeData, Snapshot, SyncState, SyncStatus, Version } from "./types.js";

/**
 * Options for connecting to a sync server
 */
export interface SyncOptions {
    /** WebSocket server URL */
    url: string;
    /** Room ID to join */
    roomId: string;
    /** Ping interval in ms (optional) */
    pingIntervalMs?: number;
}

/**
 * Options for creating a DenicekDocument
 */
export interface DenicekDocumentOptions {
    /** Peer ID for CRDT operations (optional, generated if not provided) */
    peerId?: bigint;
    /** Callback for local updates (useful for sync) */
    onLocalUpdate?: (bytes: Uint8Array) => void;
    /** Callback when the document version changes */
    onVersionChange?: (version: number) => void;
    /** Maximum number of undo steps (default: 100) */
    maxUndoSteps?: number;
    /** Merge interval in ms for grouping changes (default: 1000) */
    mergeInterval?: number;
}

/**
 * DenicekDocument - Main document class
 *
 * This class provides:
 * - Document state access (snapshot, nodes)
 * - Mutation API via change() method
 * - Undo/redo functionality
 * - Export/import for sync
 * - Event subscriptions
 * - History tracking and replay
 */
export class DenicekDocument {
    private _doc: LoroDoc;
    private localUpdateUnsubscribe?: () => void;
    private patchListeners: Set<(patch: GeneralizedPatch) => void> = new Set();

    // Undo/redo
    private undoManager: UndoManager;

    // Version tracking
    private _version: number = 0;
    private onVersionChange?: (version: number) => void;

    // History log
    private history: GeneralizedPatch[] = [];

    // Sync state
    private syncClient: LoroWebsocketClient | null = null;
    private syncRoom: LoroWebsocketClientRoom | null = null;
    private _syncRoomId: string | null = null;

    // Sync status tracking
    private syncStatusListeners: Set<(state: SyncState) => void> = new Set();
    private _syncStatus: SyncStatus = "idle";
    private _syncLatency: number | undefined = undefined;
    private _syncError: string | null = null;
    private statusUnsubscribe?: () => void;
    private latencyUnsubscribe?: () => void;

    // Cached index for O(1) lookups
    private _cachedIndex: DocumentIndex | null = null;

    constructor(options?: DenicekDocumentOptions) {
        this._doc = new LoroDoc();
        if (options?.peerId !== undefined) {
            this._doc.setPeerId(options.peerId);
        }

        if (options?.onLocalUpdate) {
            this.localUpdateUnsubscribe = this._doc.subscribeLocalUpdates(options.onLocalUpdate);
        }

        this.onVersionChange = options?.onVersionChange;

        // Create Loro's UndoManager
        this.undoManager = new UndoManager(this._doc, {
            maxUndoSteps: options?.maxUndoSteps ?? 100,
            mergeInterval: options?.mergeInterval ?? 1000,
        });

        // Subscribe to document changes to track version and invalidate cache
        this._doc.subscribe(() => {
            this._cachedIndex = null;
            this._version++;
            this.onVersionChange?.(this._version);
        });
    }

    /**
     * Get the cached index, building it if necessary
     */
    private getIndex(): DocumentIndex {
        if (!this._cachedIndex) {
            this._cachedIndex = buildDocumentIndex(this._doc);
        }
        return this._cachedIndex;
    }

    // === Sync ===

    /**
     * Connect to a sync server and join a room
     * @param options Sync connection options
     * @returns Promise that resolves when connected and initial sync is complete
     */
    async connectToSync(options: SyncOptions): Promise<void> {
        // Disconnect existing connection if any
        await this.disconnectSync();

        this.setSyncStatus("connecting");

        try {
            // Dynamic import to keep sync dependencies optional
            const { LoroWebsocketClient } = await import("loro-websocket/client");
            const { LoroAdaptor } = await import("loro-adaptors");

            const client = new LoroWebsocketClient({
                url: options.url,
                pingIntervalMs: options.pingIntervalMs,
            });

            // Subscribe to status changes BEFORE connecting
            this.statusUnsubscribe = client.onStatusChange((status) => {
                this.setSyncStatus(status);
            });

            this.latencyUnsubscribe = client.onLatency((ms) => {
                this._syncLatency = ms;
                this.notifySyncStateChange();
            });

            await client.connect();

            const room = await client.join({
                roomId: options.roomId,
                crdtAdaptor: new LoroAdaptor(this._doc),
            });

            await room.waitForReachingServerVersion();

            // Cleanup any redundant wrappers from concurrent operations
            this.cleanupRedundantWrappers();

            this.commit("sync-connect");

            this.syncClient = client;
            this.syncRoom = room;
            this._syncRoomId = options.roomId;
            // Status is already "connected" via onStatusChange callback
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Connection failed";
            this.setSyncStatus("disconnected", errorMessage);
            throw error;
        }
    }

    /**
     * Disconnect from the sync server
     */
    async disconnectSync(): Promise<void> {
        // Cleanup status subscriptions
        this.statusUnsubscribe?.();
        this.latencyUnsubscribe?.();
        this.statusUnsubscribe = undefined;
        this.latencyUnsubscribe = undefined;

        if (this.syncRoom) {
            await this.syncRoom.leave().catch(() => {});
            this.syncRoom = null;
        }
        if (this.syncClient) {
            this.syncClient.close();
            this.syncClient = null;
        }
        this._syncRoomId = null;
        this._syncLatency = undefined;
        this.setSyncStatus("idle");
    }

    /**
     * Check if connected to a sync server
     */
    get isSyncConnected(): boolean {
        return this.syncClient !== null && this.syncRoom !== null;
    }

    /**
     * Get the current room ID if connected
     */
    get syncRoomId(): string | null {
        return this._syncRoomId;
    }

    /**
     * Get the current sync state
     */
    getSyncState(): SyncState {
        return {
            status: this._syncStatus,
            latency: this._syncLatency,
            roomId: this._syncRoomId,
            error: this._syncError,
        };
    }

    /**
     * Subscribe to sync state changes
     * @returns Unsubscribe function
     */
    onSyncStateChange(listener: (state: SyncState) => void): () => void {
        this.syncStatusListeners.add(listener);
        // Immediately notify with current state
        listener(this.getSyncState());
        return () => {
            this.syncStatusListeners.delete(listener);
        };
    }

    private notifySyncStateChange(): void {
        const state = this.getSyncState();
        for (const listener of this.syncStatusListeners) {
            listener(state);
        }
    }

    private setSyncStatus(status: SyncStatus, error?: string): void {
        this._syncStatus = status;
        this._syncError = error ?? null;
        this.notifySyncStateChange();
    }

    // === Version ===

    /**
     * Get the current version number (increments on each change)
     */
    get currentVersion(): number {
        return this._version;
    }

    // === Node Access ===

    /**
     * Get node data by ID. Returns null if node doesn't exist.
     */
    getNode(id: string): NodeData | null {
        return this.getIndex().nodes.get(id) ?? null;
    }

    /**
     * Get the IDs of all children of a node.
     * Returns empty array if node doesn't exist or is a value node.
     */
    getChildIds(parentId: string): string[] {
        return this.getIndex().childIds.get(parentId) ?? [];
    }

    /**
     * Get the parent ID of a node.
     * Returns null if node is root or doesn't exist.
     */
    getParentId(nodeId: string): string | null {
        return this.getIndex().parents.get(nodeId) ?? null;
    }

    /**
     * Get the root node ID
     */
    getRootId(): string | null {
        return this.getIndex().rootId;
    }

    /**
     * Get all nodes as a record
     */
    getAllNodes(): Record<string, NodeData> {
        const index = this.getIndex();
        const result: Record<string, NodeData> = {};
        for (const [id, node] of index.nodes) {
            result[id] = node;
        }
        return result;
    }

    // === Snapshot ===

    /**
     * Get an immutable snapshot of the current document state.
     * Use for temporal comparisons (e.g., diff views).
     * For live access, use getNode/getChildIds/getParentId directly.
     */
    getSnapshot(): Snapshot {
        const index = this.getIndex();
        return {
            nodes: new Map(index.nodes),
            parents: new Map(index.parents),
            childIds: new Map(index.childIds.entries()),
            rootId: index.rootId,
        };
    }

    /**
     * Convert the document to a JSON representation
     */
    toJSON(): object {
        const index = this.getIndex();
        const result: Record<string, unknown> = {};
        for (const [id, node] of index.nodes) {
            result[id] = node;
        }
        return { root: index.rootId, nodes: result };
    }

    // === Modifications ===

    /**
     * Make changes to the document
     * All modifications should be done inside the callback using the model
     * Changes are automatically committed after the callback
     */
    change(fn: (model: DenicekModel) => void): void {
        const model = new DenicekModel(
            this._doc,
            { getAllNodes: () => this.getAllNodes() },
            (p) => this._recordPatch(p)
        );
        fn(model);
        this._doc.commit();
    }

    /**
     * Commit pending changes
     */
    commit(origin?: string): void {
        if (origin) {
            this._doc.commit({ origin });
        } else {
            this._doc.commit();
        }
    }

    // === Undo/Redo ===

    /**
     * Undo the last change
     */
    undo(): boolean {
        return this.undoManager.undo();
    }

    /**
     * Redo the last undone change
     */
    redo(): boolean {
        return this.undoManager.redo();
    }

    /**
     * Check if undo is available
     */
    get canUndo(): boolean {
        return this.undoManager.canUndo();
    }

    /**
     * Check if redo is available
     */
    get canRedo(): boolean {
        return this.undoManager.canRedo();
    }

    // === Sync ===

    /**
     * Export document state or updates
     * @param mode "update" for incremental updates, "snapshot" for full state
     * @param from Optional version to export updates from (only for mode="update")
     */
    export(mode: "update" | "snapshot", from?: Version): Uint8Array {
        if (mode === "snapshot") {
            return this._doc.export({ mode: "snapshot" });
        } else {
            if (from && from.length > 0) {
                const vv = this._doc.frontiersToVV(from as Frontiers);
                return this._doc.export({ mode: "update", from: vv });
            }
            return this._doc.export({ mode: "update" });
        }
    }

    /**
     * Import updates or snapshot into the document
     */
    import(bytes: Uint8Array): void {
        this._doc.import(bytes);
    }

    /**
     * Get the current document version (frontiers)
     * Use this to track sync state
     */
    getVersion(): Version {
        return this._doc.frontiers() as Version;
    }

    // === Subscriptions ===

    /**
     * Subscribe to document changes
     * The listener is called whenever the document changes (local or remote)
     * @returns Unsubscribe function
     */
    subscribe(listener: () => void): () => void {
        return this._doc.subscribe(listener);
    }

    /**
     * Subscribe to local updates (useful for sync)
     * @returns Unsubscribe function
     */
    subscribeLocalUpdates(listener: (bytes: Uint8Array) => void): () => void {
        return this._doc.subscribeLocalUpdates(listener);
    }

    // === History ===

    /**
     * Checkout to a specific version
     * This allows time-travel to a previous state
     */
    checkout(version: Version): void {
        this._doc.checkout(version as Frontiers);
    }

    /**
     * Checkout to the latest version (head)
     */
    checkoutToHead(): void {
        this._doc.checkoutToLatest();
    }

    // === Patch History (for recording/replay) ===

    /**
     * Get all recorded patches
     */
    getHistory(): GeneralizedPatch[] {
        return [...this.history];
    }

    /**
     * Clear recorded patches
     */
    clearHistory(): void {
        this.history = [];
    }

    /**
     * Replay a recorded script on a new starting node
     * @param script The recorded patches to replay
     * @param startNodeId The node ID to use as $0 for this replay
     */
    replay(script: GeneralizedPatch[], startNodeId: string): void {
        this.change(model => {
            const vars = new Map<string, string>();
            vars.set("$0", startNodeId);

            for (const patch of script) {
                // Degeneralize path
                const concretePath = patch.path.map(p => {
                    if (typeof p === "string" && p.startsWith("$")) {
                        return vars.get(p) || p;
                    }
                    return p;
                });

                // Degeneralize value
                const concreteValue = this.degeneralizeValue(patch.value, vars);

                // Construct concrete patch
                const concretePatch: GeneralizedPatch = {
                    ...patch,
                    path: concretePath,
                    value: concreteValue
                };

                // Apply
                const result = model.applyPatch(concretePatch);

                // If inserted a node, map the ID
                if (patch.action === "insert" && patch.path.length >= 3 && patch.path[2] === "children") {
                    const val = patch.value as Record<string, unknown>;
                    if (val && val.id && typeof val.id === "string" && val.id.startsWith("$")) {
                        if (typeof result === "string") {
                            vars.set(val.id, result);
                        }
                    }
                }
            }
        });
    }

    private degeneralizeValue(value: unknown, vars: Map<string, string>): unknown {
        if (typeof value === "string" && value.startsWith("$")) {
            return vars.get(value) || value;
        }
        if (Array.isArray(value)) {
            return value.map((v) => this.degeneralizeValue(v, vars));
        }
        if (value && typeof value === "object") {
            const result: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = this.degeneralizeValue(v, vars);
            }
            return result;
        }
        return value;
    }

    // === Patch Recording ===

    subscribePatches(listener: (patch: GeneralizedPatch) => void): () => void {
        this.patchListeners.add(listener);
        return () => {
            this.patchListeners.delete(listener);
        };
    }

    private _recordPatch(patch: GeneralizedPatch): void {
        this.history.push(patch);
        this.patchListeners.forEach(listener => listener(patch));
    }

    // === Static Factory Methods ===

    /**
     * Create a new document, optionally with an initial structure
     * @param options Document options
     * @param initializer Optional callback to set up initial document structure
     */
    static create(
        options?: DenicekDocumentOptions,
        initializer?: (model: DenicekModel) => void
    ): DenicekDocument {
        const doc = new DenicekDocument(options);
        if (initializer) {
            doc.change(initializer);
        }
        return doc;
    }

    /**
     * Create a document from exported bytes
     */
    static fromBytes(bytes: Uint8Array, options?: DenicekDocumentOptions): DenicekDocument {
        const doc = new DenicekDocument(options);
        doc.import(bytes);
        return doc;
    }

    // === Concurrent Wrap Cleanup ===

    /**
     * Cleanup redundant wrappers created by concurrent wrap operations.
     * When two clients wrap the same node concurrently, both create wrappers.
     * This method flattens nested wrappers using LWW based on Loro's lamport timestamps.
     *
     * IMPORTANT: Only flattens CONCURRENT wrappers (neither knew about the other).
     * Intentional sequential nesting (outer was created after inner) is preserved.
     */
    cleanupRedundantWrappers(): void {
        const tree = this._doc.getTree(TREE_CONTAINER);

        this.change((model) => {
            const allNodes = this.getAllNodes();
            const nodesToDelete: string[] = [];

            // Find orphaned empty wrappers created concurrently with a sibling.
            // After Loro merges concurrent wraps of the same node, one wrapper "wins"
            // the move conflict (gets the target), and the other becomes empty.
            // These empty wrappers are siblings, not nested.
            for (const [nodeId, node] of Object.entries(allNodes)) {
                if (node.kind !== "element") continue;

                const childIds = this.getChildIds(nodeId);
                // Only check empty elements (potential orphaned wrappers)
                if (childIds.length !== 0) continue;

                const parentId = this.getParentId(nodeId);
                if (!parentId) continue;

                // Get siblings
                const siblingIds = this.getChildIds(parentId);
                if (siblingIds.length < 2) continue;

                // Check if any sibling is a non-empty element created concurrently
                const currentTreeNode = tree.getNodeByID(stringToTreeId(nodeId));
                if (!currentTreeNode) continue;

                for (const siblingId of siblingIds) {
                    if (siblingId === nodeId) continue;

                    const siblingNode = allNodes[siblingId];
                    if (siblingNode?.kind !== "element") continue;

                    const siblingChildIds = this.getChildIds(siblingId);
                    if (siblingChildIds.length === 0) continue; // Both empty, skip

                    const siblingTreeNode = tree.getNodeByID(stringToTreeId(siblingId));
                    if (!siblingTreeNode) continue;

                    // Check if they were created concurrently
                    const concurrent = areNodesConcurrent(this._doc, currentTreeNode, siblingTreeNode);

                    if (concurrent) {
                        // This empty node is an orphaned wrapper from concurrent wrap
                        nodesToDelete.push(nodeId);
                        break;
                    }
                }
            }

            // Delete all orphaned wrappers
            for (const id of nodesToDelete) {
                model.deleteNode(id);
            }
        });
    }

    // === Cleanup ===

    /**
     * Dispose of the document and clean up subscriptions
     */
    dispose(): void {
        // Cleanup status subscriptions
        this.statusUnsubscribe?.();
        this.latencyUnsubscribe?.();
        // Fire-and-forget sync disconnect to keep dispose() synchronous
        this.disconnectSync().catch(() => {});
        if (this.localUpdateUnsubscribe) {
            this.localUpdateUnsubscribe();
        }
        this.syncStatusListeners.clear();
    }
}
