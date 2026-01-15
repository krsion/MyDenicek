/**
 * DenicekStore - Transaction management and undo/redo
 * Uses Loro's UndoManager for undo/redo functionality
 */

import { UndoManager } from "loro-crdt";
import type { DenicekDocument } from "./DenicekDocument.js";
import { DenicekModel } from "./DenicekModel.js";
import type { GeneralizedPatch } from "./types.js";

/**
 * Options for creating a DenicekStore
 */
export interface StoreOptions {
    /** Callback when the document version changes */
    onVersionChange?: (version: number) => void;
    /** Maximum number of undo steps (default: 100) */
    maxUndoSteps?: number;
    /** Merge interval in ms for grouping changes (default: 1000) */
    mergeInterval?: number;
}

/**
 * DenicekStore - Manages document mutations with undo/redo support
 */
export class DenicekStore {
    private document: DenicekDocument;
    private undoManager: UndoManager;
    private version: number = 0;
    private onVersionChange?: (version: number) => void;
    private options: any;

    // History Log
    private history: GeneralizedPatch[] = [];

    private storeId: string;

    constructor(document: DenicekDocument, options: any = {}) {
        this.document = document;
        this.options = options;
        this.storeId = Math.random().toString(36).substring(7);

        // Subscribe to all patches from the document;
        this.onVersionChange = options?.onVersionChange;

        // Create Loro's UndoManager
        this.undoManager = new UndoManager(document._internal.doc, {
            maxUndoSteps: options?.maxUndoSteps ?? 100,
            mergeInterval: options?.mergeInterval ?? 1000,
        });

        // Subscribe to document changes to track version
        document.subscribe(() => {
            this.notifyChange();
        });

        // Subscribe to patches for history
        document.subscribePatches((patch) => {
            this.history.push(patch);
        });
    }

    private notifyChange(): void {
        this.version++;
        this.onVersionChange?.(this.version);
    }

    // === Document Access ===

    /**
     * Get the underlying document
     */
    get doc(): DenicekDocument {
        return this.document;
    }

    /**
     * Get the current version number (increments on each change)
     */
    get currentVersion(): number {
        return this.version;
    }

    // === Modifications ===

    /**
     * Make a single change to the document
     * Creates an undo entry for this change
     */
    modify(updater: (model: DenicekModel) => void): void {
        this.document.change(updater);
    }

    /**
     * Make multiple changes that will be grouped as a single undo entry
     * Changes within this transaction can be undone together
     */
    modifyTransaction(updater: (model: DenicekModel) => void): void {
        // For Loro, transactions are handled by the UndoManager's mergeInterval
        // We can also use explicit commit to group changes
        this.document.change(updater);
    }

    // === Undo/Redo ===

    /**
     * Undo the last change
     */
    undo(): boolean {
        const result = this.undoManager.undo();
        if (result) {
            this.notifyChange();
        }
        return result;
    }

    /**
     * Redo the last undone change
     */
    redo(): boolean {
        const result = this.undoManager.redo();
        if (result) {
            this.notifyChange();
        }
        return result;
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

    // === Recording ===

    // === History Log ===

    getHistory(): GeneralizedPatch[] {
        return [...this.history];
    }

    clearHistory(): void {
        this.history = [];
    }

    // === Replay ===

    /**
     * Replay a recorded script on a new starting node
     * @param script The recorded patches to replay
     * @param startNodeId The node ID to use as $0 for this replay
     */
    replay(script: GeneralizedPatch[], startNodeId: string): void {
        this.document.change(model => {
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
                    const val = patch.value as any;
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


}

/**
 * Internal class for recording changes
 * Records patches and generalizes node IDs to variables ($0, $1, etc.)
 */
class Recorder {
    private startNodeId: string;
    private idToVar: Map<string, string> = new Map();
    private varCounter: number = 0;
    private patches: GeneralizedPatch[] = [];

    constructor(startNodeId: string) {
        this.startNodeId = startNodeId;
        this.idToVar.set(startNodeId, "$0");
    }

    /**
     * Add patches to the recording
     */
    addPatches(patches: GeneralizedPatch[]): void {
        for (const patch of patches) {
            const generalizedPatch = this.generalizePatch(patch);
            this.patches.push(generalizedPatch);
        }
    }

    /**
     * Get all recorded patches
     */
    getPatches(): GeneralizedPatch[] {
        return this.patches;
    }

    private getOrCreateVar(id: string): string {
        let varName = this.idToVar.get(id);
        if (!varName) {
            this.varCounter++;
            varName = `$${this.varCounter}`;
            this.idToVar.set(id, varName);
        }
        return varName;
    }

    private generalizePatch(patch: GeneralizedPatch): GeneralizedPatch {
        const generalizedPath = patch.path.map((part) => {
            if (typeof part === "string" && this.looksLikeNodeId(part)) {
                return this.getOrCreateVar(part);
            }
            return part;
        });

        const generalized: GeneralizedPatch = {
            action: patch.action,
            path: generalizedPath,
        };

        if (patch.value !== undefined) {
            generalized.value = this.generalizeValue(patch.value);
        }
        if (patch.values !== undefined) {
            generalized.values = patch.values.map((v) => this.generalizeValue(v));
        }
        if (patch.length !== undefined) {
            generalized.length = patch.length;
        }
        if (patch._deleteLength !== undefined) {
            generalized._deleteLength = patch._deleteLength;
        }

        return generalized;
    }

    private generalizeValue(value: unknown): unknown {
        if (typeof value === "string" && this.looksLikeNodeId(value)) {
            return this.getOrCreateVar(value);
        }
        if (Array.isArray(value)) {
            return value.map((v) => this.generalizeValue(v));
        }
        if (value && typeof value === "object") {
            const result: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = this.generalizeValue(v);
            }
            return result;
        }
        return value;
    }

    private looksLikeNodeId(str: string): boolean {
        // Loro TreeIDs look like "counter@peer" e.g., "0@123456789"
        return /^\d+@\d+$/.test(str) || str.startsWith("wrap-");
    }
}
