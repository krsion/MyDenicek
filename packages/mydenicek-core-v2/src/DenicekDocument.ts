/**
 * DenicekDocument - Main document abstraction for mydenicek-core-v2
 * This class wraps the Loro document and provides a public API
 * Includes undo/redo, history tracking, and replay functionality
 */

import { Frontiers, LoroDoc, UndoManager } from "loro-crdt";
import { DenicekModel } from "./DenicekModel.js";
import { DocumentView } from "./DocumentView.js";
import { createDocumentView } from "./loroHelpers.js";
import type { GeneralizedPatch, HistoryEntry, NodeData, Version } from "./types.js";

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

        // Subscribe to document changes to track version
        this._doc.subscribe(() => {
            this._version++;
            this.onVersionChange?.(this._version);
        });
    }

    /**
     * Get access to the underlying LoroDoc (for internal use)
     * @internal
     */
    get _internal(): { doc: LoroDoc } {
        return { doc: this._doc };
    }

    // === Version ===

    /**
     * Get the current version number (increments on each change)
     */
    get currentVersion(): number {
        return this._version;
    }

    // === Snapshot ===

    /**
     * Get a DocumentView of the current document state
     * The view provides read-only access to the document tree
     */
    getSnapshot(): DocumentView {
        return createDocumentView(this._doc);
    }

    /**
     * Convert the document to a JSON representation
     */
    toJSON(): object {
        const view = this.getSnapshot();
        const result: Record<string, unknown> = {};
        for (const { node } of view.walkDepthFirst()) {
            result[node.id] = node;
        }
        return { root: view.getRootId(), nodes: result };
    }

    // === Node Access ===

    /**
     * Get the root node ID
     */
    getRootId(): string | undefined {
        return this.getSnapshot().getRootId() ?? undefined;
    }

    /**
     * Get all nodes as a record
     */
    getAllNodes(): Record<string, NodeData> {
        const view = this.getSnapshot();
        const result: Record<string, NodeData> = {};
        for (const { node } of view.walkDepthFirst()) {
            result[node.id] = node;
        }
        return result;
    }

    // === Modifications ===

    /**
     * Make changes to the document
     * All modifications should be done inside the callback using the model
     * Changes are automatically committed after the callback
     */
    change(fn: (model: DenicekModel) => void): void {
        const model = new DenicekModel(this, (p) => this._recordPatch(p));
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
    subscribe(listener: (view: DocumentView) => void): () => void {
        const subscription = this._doc.subscribe(() => {
            listener(this.getSnapshot());
        });
        return subscription;
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
     * Get the document history
     * Each entry contains a version (frontiers) that can be used for checkout
     */
    getHistoryVersions(): HistoryEntry[] {
        return [{
            version: this.getVersion(),
            timestamp: Date.now(),
        }];
    }

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

    // === Cleanup ===

    /**
     * Dispose of the document and clean up subscriptions
     */
    dispose(): void {
        if (this.localUpdateUnsubscribe) {
            this.localUpdateUnsubscribe();
        }
    }
}
