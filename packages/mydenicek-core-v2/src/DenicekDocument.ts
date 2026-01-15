/**
 * DenicekDocument - Main document abstraction for mydenicek-core-v2
 * This class wraps the Loro document and provides a public API without exposing Loro types
 */

import { DenicekModel } from "./DenicekModel.js";
import { LoroDocWrapper } from "./internal/LoroDocWrapper.js";
import type { DocumentSnapshot, GeneralizedPatch, HistoryEntry, Version } from "./types.js";

/**
 * Options for creating a DenicekDocument
 */
export interface DenicekDocumentOptions {
    /** Peer ID for CRDT operations (optional, generated if not provided) */
    peerId?: bigint;
    /** Callback for local updates (useful for sync) */
    onLocalUpdate?: (bytes: Uint8Array) => void;
}

/**
 * DenicekDocument - Main document class
 *
 * This class provides:
 * - Document state access (snapshot, nodes)
 * - Mutation API via change() method
 * - Export/import for sync
 * - Event subscriptions
 * - History/versioning
 */
export class DenicekDocument {
    private wrapper: LoroDocWrapper;
    private localUpdateUnsubscribe?: () => void;
    private patchListeners: Set<(patch: GeneralizedPatch) => void> = new Set();
    private docId = Math.random().toString(36).substring(7);

    constructor(options?: DenicekDocumentOptions) {
        this.wrapper = new LoroDocWrapper(options?.peerId);

        if (options?.onLocalUpdate) {
            this.localUpdateUnsubscribe = this.wrapper.subscribeLocalUpdates(options.onLocalUpdate);
        }
    }

    /**
     * Get access to the internal wrapper (for internal use by DenicekModel)
     * @internal
     */
    get _internal(): LoroDocWrapper {
        return this.wrapper;
    }

    // === Snapshot ===

    /**
     * Get a snapshot of the current document state
     * Returns a plain JSON object with all nodes and transformations
     */
    getSnapshot(): DocumentSnapshot {
        return this.wrapper.getSnapshot();
    }

    /**
     * Convert the document to a JSON representation
     */
    toJSON(): object {
        return this.getSnapshot();
    }

    // === Node Access ===

    /**
     * Get the root node ID
     */
    getRootId(): string | undefined {
        const snapshot = this.getSnapshot();
        return snapshot.root || undefined;
    }

    /**
     * Get all nodes as a record
     */
    getAllNodes(): Record<string, import("./types.js").Node> {
        return this.getSnapshot().nodes;
    }

    // === Modifications ===

    /**
     * Make changes to the document
     * All modifications should be done inside the callback using the model
     * Changes are automatically committed after the callback
     */
    change(fn: (model: DenicekModel) => void): void {
        const model = new DenicekModel(this, (p) => this._emitPatch(p));
        fn(model);
        this.wrapper.commit();
    }

    /**
     * Start a transaction - changes won't be committed until commit() is called
     * Use this when you need to make multiple changes that should be undone together
     */
    transaction(fn: (model: DenicekModel) => void): void {
        const model = new DenicekModel(this, (p) => this._emitPatch(p));
        fn(model);
        // Don't auto-commit - caller must call commit()
    }

    /**
     * Commit pending changes
     */
    commit(origin?: string): void {
        this.wrapper.commit(origin);
    }

    // === Sync ===

    /**
     * Export document state or updates
     * @param mode "update" for incremental updates, "snapshot" for full state
     * @param from Optional version to export updates from (only for mode="update")
     */
    export(mode: "update" | "snapshot", from?: Version): Uint8Array {
        return this.wrapper.export(mode, from as any);
    }

    /**
     * Import updates or snapshot into the document
     */
    import(bytes: Uint8Array): void {
        this.wrapper.import(bytes);
    }

    /**
     * Get the current document version (frontiers)
     * Use this to track sync state
     */
    getVersion(): Version {
        return this.wrapper.getVersion() as Version;
    }

    // === Subscriptions ===

    /**
     * Subscribe to document changes
     * The listener is called whenever the document changes (local or remote)
     * @returns Unsubscribe function
     */
    subscribe(listener: (snapshot: DocumentSnapshot) => void): () => void {
        return this.wrapper.subscribe(() => {
            listener(this.getSnapshot());
        });
    }

    /**
     * Subscribe to local updates (useful for sync)
     * @returns Unsubscribe function
     */
    subscribeLocalUpdates(listener: (bytes: Uint8Array) => void): () => void {
        return this.wrapper.subscribeLocalUpdates(listener);
    }

    // === History ===

    /**
     * Get the document history
     * Each entry contains a version (frontiers) that can be used for checkout
     */
    getHistory(): HistoryEntry[] {
        // For now, return just the current version
        // Full history requires tracking commits
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
        this.wrapper.doc.checkout(version as any);
    }

    /**
     * Checkout to the latest version (head)
     */
    checkoutToHead(): void {
        this.wrapper.doc.checkoutToLatest();
    }

    // === Static Factory Methods ===

    /**
     * Create a new document with an initial structure
     */
    static create(options?: DenicekDocumentOptions): DenicekDocument {
        const doc = new DenicekDocument(options);
        doc.change((model) => {
            model.initializeDocument();
        });
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

    // === Patch Subscription ===

    subscribePatches(listener: (patch: GeneralizedPatch) => void): () => void {
        this.patchListeners.add(listener);
        return () => {
            this.patchListeners.delete(listener);
        };
    }

    private _emitPatch(patch: GeneralizedPatch): void {
        this.patchListeners.forEach(listener => listener(patch));
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
