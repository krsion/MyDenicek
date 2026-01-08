import { DenicekModel } from "./DenicekModel";
import { Recorder } from "./Recorder";
import { replayScript } from "./replay";
import type { GeneralizedPatch, JsonDoc } from "./types";
import { UndoManager } from "./UndoManager";

/**
 * Interface for a document that supports changes with patch callbacks.
 * This abstracts away details of the underlying storage (like Automerge).
 */
export interface AnyDenicekDoc {
    change: (fn: (d: JsonDoc) => void, options?: { patchCallback?: (patches: any[], info: any) => void }) => void;
}

export interface StoreOptions {
    onVersionChange?: (v: number) => void;
}

/**
 * DenicekStore centralizes the logic for document mutations, undo/redo tracking,
 * and recording. It abstracts away the direct interaction with Automerge handles.
 */
export class DenicekStore {
    private recorder: Recorder | null = null;
    private undoRedoVersion = 0;
    public readonly undoManager: UndoManager<JsonDoc>;
    private options: StoreOptions;

    constructor(
        undoManager: UndoManager<JsonDoc>,
        options: StoreOptions = {}
    ) {
        this.undoManager = undoManager;
        this.options = options;
    }

    private notifyChange() {
        this.undoRedoVersion++;
        this.options.onVersionChange?.(this.undoRedoVersion);
    }

    startRecording(startNodeId: string) {
        this.recorder = new Recorder(startNodeId);
    }

    stopRecording() {
        const script = this.recorder?.getActions() || [];
        this.recorder = null;
        return script;
    }

    get isRecording() {
        return !!this.recorder;
    }

    /**
     * Executes a single change on the document.
     */
    modify(doc: AnyDenicekDoc | null | undefined, updater: (model: DenicekModel) => void) {
        if (!doc) return;
        doc.change((d: JsonDoc) => {
            const changeModel = new DenicekModel(d);
            updater(changeModel);
        }, {
            patchCallback: (patches: any, info: any) => {
                const undoEntry = this.undoManager.captureForUndo(info.before as JsonDoc, patches);
                if (undoEntry) {
                    this.notifyChange();
                }
                if (this.recorder) {
                    this.recorder.addPatches(patches);
                }
            }
        });
    }

    /**
     * Executes multiple changes grouped into a single undo step.
     */
    modifyTransaction(doc: AnyDenicekDoc | null | undefined, updater: (model: DenicekModel) => void) {
        if (!doc) return;
        this.undoManager.startTransaction();
        doc.change((d: JsonDoc) => {
            const changeModel = new DenicekModel(d);
            updater(changeModel);
        }, {
            patchCallback: (patches: any, info: any) => {
                this.undoManager.addToTransaction(info.before as JsonDoc, patches);
                if (this.recorder) {
                    this.recorder.addPatches(patches);
                }
            }
        });
        this.undoManager.endTransaction();
        this.notifyChange();
    }

    undo(doc: AnyDenicekDoc | null | undefined) {
        if (!doc) return;
        const entry = this.undoManager.popUndo();
        if (!entry) return;

        doc.change((d: JsonDoc) => {
            this.undoManager.applyPatches(d, entry.inversePatches);
        }, {
            patchCallback: (patches: any, info: any) => {
                this.undoManager.pushRedo(info.before as JsonDoc, patches);
            }
        });
        this.notifyChange();
    }

    redo(doc: AnyDenicekDoc | null | undefined) {
        if (!doc) return;
        const entry = this.undoManager.popRedo();
        if (!entry) return;

        doc.change((d: JsonDoc) => {
            this.undoManager.applyPatches(d, entry.inversePatches);
        }, {
            patchCallback: (patches: any, info: any) => {
                this.undoManager.pushUndo(info.before as JsonDoc, patches);
            }
        });
        this.notifyChange();
    }

    replay(doc: AnyDenicekDoc | null | undefined, script: GeneralizedPatch[], startNodeId: string) {
        if (!doc) return;
        doc.change((d: JsonDoc) => {
            replayScript(d, script, startNodeId);
        });
        this.notifyChange();
    }
}
