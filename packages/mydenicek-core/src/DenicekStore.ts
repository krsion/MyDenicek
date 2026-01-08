import { DenicekModel } from "./DenicekModel";
import { Recorder } from "./Recorder";
import { UndoManager } from "./UndoManager";
import { JsonDoc } from "./types";

/**
 * Interface for a document handle that supports changes with patch callbacks.
 * This abstracts away DocHandle from @automerge/automerge-repo.
 */
export interface AnyDocHandle {
    change: (fn: (d: any) => void, options?: { patchCallback?: (patches: any[], info: any) => void }) => void;
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

    constructor(
        public readonly undoManager: UndoManager<JsonDoc>,
        private options: StoreOptions = {}
    ) {}

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
    modify(handle: AnyDocHandle | null | undefined, updater: (model: DenicekModel) => void) {
        if (!handle) return;
        handle.change((d: JsonDoc) => {
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
    modifyTransaction(handle: AnyDocHandle | null | undefined, updater: (model: DenicekModel) => void) {
        if (!handle) return;
        this.undoManager.startTransaction();
        handle.change((d: JsonDoc) => {
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

    undo(handle: AnyDocHandle | null | undefined) {
        if (!handle) return;
        const entry = this.undoManager.popUndo();
        if (!entry) return;

        handle.change((d: JsonDoc) => {
            this.undoManager.applyPatches(d, entry.inversePatches);
        }, {
            patchCallback: (patches: any, info: any) => {
                this.undoManager.pushRedo(info.before as JsonDoc, patches);
            }
        });
        this.notifyChange();
    }

    redo(handle: AnyDocHandle | null | undefined) {
        if (!handle) return;
        const entry = this.undoManager.popRedo();
        if (!entry) return;

        handle.change((d: JsonDoc) => {
            this.undoManager.applyPatches(d, entry.inversePatches);
        }, {
            patchCallback: (patches: any, info: any) => {
                this.undoManager.pushUndo(info.before as JsonDoc, patches);
            }
        });
        this.notifyChange();
    }
}
