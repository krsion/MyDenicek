
import { next as Automerge, type Doc, type Heads, type Patch } from "@automerge/automerge";

/**
 * An entry in the undo/redo stack containing the inverse patches
 * needed to reverse a change.
 */
export interface UndoEntry {
  /** Inverse patches to apply */
  inversePatches: Patch[];
  /** Heads at the time of the original change (for conflict-aware undo) */
  heads: Heads;
}

/**
 * Gets a value at a given path in a document.
 */
function getValueAtPath(doc: unknown, path: (string | number)[]): unknown {
  let current: unknown = doc;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

/**
 * Sets a value at a given path in a mutable document.
 */
function setValueAtPath(doc: unknown, path: (string | number)[], value: unknown): void {
  if (path.length === 0) return;
  
  let current: unknown = doc;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    current = (current as Record<string | number, unknown>)[key];
    if (current === null || current === undefined) return;
  }
  
  const lastKey = path[path.length - 1]!;
  (current as Record<string | number, unknown>)[lastKey] = value;
}

/**
 * Deletes a value at a given path in a mutable document.
 */
function deleteAtPath(doc: unknown, path: (string | number)[]): void {
  if (path.length === 0) return;
  
  let current: unknown = doc;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    current = (current as Record<string | number, unknown>)[key];
    if (current === null || current === undefined) return;
  }
  
  const lastKey = path[path.length - 1]!;
  if (Array.isArray(current) && typeof lastKey === 'number') {
    current.splice(lastKey, 1);
  } else {
    delete (current as Record<string | number, unknown>)[lastKey];
  }
}

/**
 * Inserts values into an array at a given path.
 */
function insertAtPath(doc: unknown, path: (string | number)[], index: number, values: unknown[]): void {
  if (path.length === 0) return;
  
  let current: unknown = doc;
  for (const key of path) {
    current = (current as Record<string | number, unknown>)[key];
    if (current === null || current === undefined) return;
  }
  
  if (Array.isArray(current)) {
    current.splice(index, 0, ...values);
  }
}

/**
 * Computes inverse patches for undoing a set of patches.
 * This must be called with the document state BEFORE the patches were applied.
 */
function computeInversePatches(beforeDoc: unknown, patches: Patch[]): Patch[] {
  // We need to process patches in order, updating a copy of the doc
  // to get correct inverse patches for each step
  const inversePatches: Patch[] = [];
  let docCopy = JSON.parse(JSON.stringify(beforeDoc));

  for (const patch of patches) {
    const inversePatch = invertSinglePatch(docCopy, patch);
    if (inversePatch) {
      inversePatches.push(inversePatch);
    }
    // Apply the patch to our copy so subsequent inversions are correct
    applyPatchToCopy(docCopy, patch);
  }

  // Reverse order - undo needs to apply in reverse
  return inversePatches.reverse();
}

/**
 * Inverts a single patch given the document state before it was applied.
 */
function invertSinglePatch(beforeDoc: unknown, patch: Patch): Patch | null {
  switch (patch.action) {
    case 'put': {
      const oldValue = getValueAtPath(beforeDoc, patch.path);
      if (oldValue !== undefined) {
        return { action: 'put', path: patch.path, value: oldValue };
      } else {
        return { action: 'del', path: patch.path };
      }
    }
    case 'insert': {
      // To undo an insert, we delete at the same index
      const index = patch.path[patch.path.length - 1];
      if (typeof index === 'number') {
        // Create a del patch for each inserted value
        return { action: 'del', path: patch.path, length: patch.values.length };
      }
      return null;
    }
    case 'splice': {
      // For string splices (insert only), the inverse is to delete the inserted text
      // We store the length to delete as a custom property

      const insertedLength = patch.value.length;
      // To undo: delete the inserted chars (length = insertedLength) and insert nothing
      return { 
        action: 'splice', 
        path: patch.path, 
        value: '',  // Insert nothing
        // Custom property to track how many chars to delete
        _deleteLength: insertedLength
      } as Patch;
    }
    case 'del': {
      // Check if this is a string deletion by looking at the parent path
      const parentPath = patch.path.slice(0, -1);
      const index = patch.path[patch.path.length - 1];
      const parentValue = getValueAtPath(beforeDoc, parentPath);
      
      if (typeof parentValue === 'string' && typeof index === 'number') {
        // String deletion - inverse is to insert the deleted text back
        // Length defaults to 1 for single-char deletions (no length property)
        const length = ('length' in patch && typeof patch.length === 'number') ? patch.length : 1;
        const deletedText = parentValue.slice(index, index + length);
        return { 
          action: 'splice', 
          path: patch.path, 
          value: deletedText,
          _deleteLength: 0  // Don't delete anything, just insert
        } as Patch;
      }
      // Object/array deletion
      const oldValue = getValueAtPath(beforeDoc, patch.path);
      if (oldValue !== undefined) {
        return { action: 'put', path: patch.path, value: oldValue };
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Applies a patch to a plain JS object copy (for tracking state during inversion).
 */
function applyPatchToCopy(doc: unknown, patch: Patch): void {
  switch (patch.action) {
    case 'put':
      setValueAtPath(doc, patch.path, patch.value);
      break;
    case 'del': {
      // Check if this is a string deletion by looking at the parent path
      const parentPath = patch.path.slice(0, -1);
      const index = patch.path[patch.path.length - 1];
      const parentValue = getValueAtPath(doc, parentPath);
      
      if (typeof parentValue === 'string' && typeof index === 'number') {
        // String deletion - splice out the characters
        // Length defaults to 1 for single-char deletions (no length property)
        const length = ('length' in patch && typeof (patch as unknown as {length: number}).length === 'number') 
          ? (patch as unknown as {length: number}).length : 1;
        const newStr = parentValue.slice(0, index) + parentValue.slice(index + length);
        setValueAtPath(doc, parentPath, newStr);
      } else {
        deleteAtPath(doc, patch.path);
      }
      break;
    }
    case 'insert': {
      const parentPath = patch.path.slice(0, -1);
      const index = patch.path[patch.path.length - 1] as number;
      insertAtPath(doc, parentPath, index, patch.values);
      break;
    }
    case 'splice': {
      const parentPath = patch.path.slice(0, -1);
      const index = patch.path[patch.path.length - 1] as number;
      const str = getValueAtPath(doc, parentPath) as string;
      if (typeof str === 'string') {
        const newStr = str.slice(0, index) + patch.value + str.slice(index);
        setValueAtPath(doc, parentPath, newStr);
      }
      break;
    }
  }
}

/**
 * Applies patches to an Automerge document.
 */
export function applyPatches<T>(doc: T, patches: Patch[]): void {
  for (const patch of patches) {
    switch (patch.action) {
      case 'put':
        setValueAtPath(doc, patch.path, patch.value);
        break;
      case 'del': {
        // Check if this is a string deletion by looking at the parent path
        const parentPath = patch.path.slice(0, -1);
        const index = patch.path[patch.path.length - 1];
        const parentValue = getValueAtPath(doc, parentPath);
        
        if (typeof parentValue === 'string' && typeof index === 'number') {
          // String deletion - use Automerge.splice
          // Length defaults to 1 for single-char deletions (no length property)
          const length = ('length' in patch && typeof (patch as unknown as {length: number}).length === 'number')
            ? (patch as unknown as {length: number}).length : 1;
          Automerge.splice(doc as Doc<T>, parentPath, index, length, '');
        } else {
          deleteAtPath(doc, patch.path);
        }
        break;
      }
      case 'insert': {
        const parentPath = patch.path.slice(0, -1);
        const index = patch.path[patch.path.length - 1] as number;
        insertAtPath(doc, parentPath, index, patch.values);
        break;
      }
      case 'splice': {
        // Use Automerge.splice for proper CRDT string operations
        const parentPath = patch.path.slice(0, -1);
        const index = patch.path[patch.path.length - 1] as number;
        const deleteLength = (patch as Patch & { _deleteLength?: number })._deleteLength ?? patch.value.length;
        Automerge.splice(doc as Doc<T>, parentPath, index, deleteLength, patch.value);
        break;
      }
    }
  }
}



/**
 * A framework-agnostic undo manager that tracks local changes
 * and allows undoing/redoing them without affecting remote changes.
 */
export class UndoManager<T> {
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private transactionPatches: Patch[] | null = null;
  private transactionHeads: Heads | null = null;

  /**
   * Returns true if there are changes that can be undone.
   */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Returns true if there are changes that can be redone.
   */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Wraps a change operation and tracks it for undo.
   * @param doc The Automerge document
   * @param changeFn The change function to apply
   * @returns The updated document
   */
  change(doc: Doc<T>, changeFn: (d: T) => void): Doc<T> {
    const headsBefore = Automerge.getHeads(doc);
    let inversePatches: Patch[] = [];

    const newDoc = Automerge.change(
      doc,
      {
        patchCallback: (patches, info) => {
          inversePatches = computeInversePatches(info.before, patches);
        },
      },
      changeFn
    );

    // If we're in a transaction, accumulate patches
    if (this.transactionPatches !== null) {
      this.transactionPatches.push(...inversePatches);
      if (this.transactionHeads === null) {
        this.transactionHeads = headsBefore;
      }
    } else {
      // Single change - push directly to undo stack
      if (inversePatches.length > 0) {
        this.undoStack.push({ inversePatches, heads: headsBefore });
        this.redoStack = []; // Clear redo stack on new change
      }
    }

    return newDoc;
  }

  /**
   * Groups multiple changes into a single undo step.
   * @param doc The Automerge document
   * @param fn Function that performs multiple changes
   * @returns The final document after all changes
   */
  transaction(_doc: Doc<T>, fn: (change: (d: Doc<T>, changeFn: (d: T) => void) => Doc<T>) => Doc<T>): Doc<T> {
    // Start transaction
    this.transactionPatches = [];
    this.transactionHeads = null;

    // Execute the transaction function
    const changeFn = (d: Doc<T>, updater: (d: T) => void): Doc<T> => {
      return this.change(d, updater);
    };
    const result = fn(changeFn);

    // End transaction - consolidate all patches into one entry
    if (this.transactionPatches.length > 0 && this.transactionHeads !== null) {
      this.undoStack.push({
        inversePatches: this.transactionPatches,
        heads: this.transactionHeads,
      });
      this.redoStack = []; // Clear redo stack on new change
    }

    this.transactionPatches = null;
    this.transactionHeads = null;

    return result;
  }

  /**
   * Undoes the last change or transaction.
   * @param doc The current Automerge document
   * @returns The document with the change undone, or null if nothing to undo
   */
  undo(doc: Doc<T>): Doc<T> | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    const headsBefore = Automerge.getHeads(doc);
    let redoPatches: Patch[] = [];

    const newDoc = Automerge.change(
      doc,
      {
        patchCallback: (patches, info) => {
          redoPatches = computeInversePatches(info.before, patches);
        },
      },
      (d) => {
        applyPatches(d, entry.inversePatches);
      }
    );

    // Push to redo stack
    if (redoPatches.length > 0) {
      this.redoStack.push({ inversePatches: redoPatches, heads: headsBefore });
    }

    return newDoc;
  }

  /**
   * Redoes the last undone change.
   * @param doc The current Automerge document
   * @returns The document with the change redone, or null if nothing to redo
   */
  redo(doc: Doc<T>): Doc<T> | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;

    const headsBefore = Automerge.getHeads(doc);
    let undoPatches: Patch[] = [];

    const newDoc = Automerge.change(
      doc,
      {
        patchCallback: (patches, info) => {
          undoPatches = computeInversePatches(info.before, patches);
        },
      },
      (d) => {
        applyPatches(d, entry.inversePatches);
      }
    );

    // Push back to undo stack
    if (undoPatches.length > 0) {
      this.undoStack.push({ inversePatches: undoPatches, heads: headsBefore });
    }

    return newDoc;
  }

  /**
   * Clears both undo and redo stacks.
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  // ==================== Callback-based API for DocHandle integration ====================
  // These methods allow using UndoManager with external change handlers (like DocHandle.change)

  /**
   * Captures patches from a patchCallback and adds them to the undo stack.
   * Use this when you're using external change handlers.
   * @param beforeDoc The document state before the change
   * @param patches The patches from the change
   * @returns The undo entry if patches were captured, or null
   */
  captureForUndo(beforeDoc: T, patches: Patch[]): UndoEntry | null {
    const inversePatches = computeInversePatches(beforeDoc, patches);
    if (inversePatches.length === 0) return null;

    // If in transaction, don't push directly
    if (this.transactionPatches !== null) {
      this.transactionPatches.push(...inversePatches);
      return null;
    }

    const entry: UndoEntry = {
      inversePatches,
      heads: [] // Heads not available in callback-based API
    };
    this.undoStack.push(entry);
    this.redoStack = []; // Clear redo on new change
    return entry;
  }

  /**
   * Start a transaction for grouping multiple changes.
   */
  startTransaction(): void {
    this.transactionPatches = [];
    this.transactionHeads = null;
  }

  /**
   * Add patches to the current transaction.
   * @param beforeDoc The document state before the change
   * @param patches The patches from the change
   */
  addToTransaction(beforeDoc: T, patches: Patch[]): void {
    if (this.transactionPatches === null) return;
    const inversePatches = computeInversePatches(beforeDoc, patches);
    this.transactionPatches.push(...inversePatches);
  }

  /**
   * End the current transaction and push all accumulated patches as one undo entry.
   */
  endTransaction(): void {
    if (this.transactionPatches !== null && this.transactionPatches.length > 0) {
      this.undoStack.push({
        inversePatches: this.transactionPatches,
        heads: this.transactionHeads ?? []
      });
      this.redoStack = [];
    }
    this.transactionPatches = null;
    this.transactionHeads = null;
  }

  /**
   * Pop the last entry from the undo stack.
   * @returns The entry or undefined if stack is empty
   */
  popUndo(): UndoEntry | undefined {
    return this.undoStack.pop();
  }

  /**
   * Pop the last entry from the redo stack.
   * @returns The entry or undefined if stack is empty
   */
  popRedo(): UndoEntry | undefined {
    return this.redoStack.pop();
  }

  /**
   * Push an entry to the undo stack (for redo operations).
   * @param beforeDoc The document state before the change  
   * @param patches The patches from applying the undo
   */
  pushUndo(beforeDoc: T, patches: Patch[]): void {
    const inversePatches = computeInversePatches(beforeDoc, patches);
    if (inversePatches.length > 0) {
      this.undoStack.push({ inversePatches, heads: [] });
    }
  }

  /**
   * Push an entry to the redo stack (for undo operations).
   * @param beforeDoc The document state before the change
   * @param patches The patches from applying the undo
   */
  pushRedo(beforeDoc: T, patches: Patch[]): void {
    const inversePatches = computeInversePatches(beforeDoc, patches);
    if (inversePatches.length > 0) {
      this.redoStack.push({ inversePatches, heads: [] });
    }
  }

  /**
   * Apply patches to a mutable document.
   * Use this within a change callback to apply undo/redo/replay patches.
   * @param doc The mutable document within a change callback
   * @param patches The patches to apply
   */
  applyPatches(doc: T, patches: Patch[]): void {
    applyPatches(doc, patches);
  }
}
