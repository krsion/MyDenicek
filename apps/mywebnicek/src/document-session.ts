import { Denicek } from "@mydenicek/core";
import type {
  EventSnapshot,
  FormulaResult,
  PlainNode,
  PrimitiveValue,
} from "@mydenicek/core";

export type DocumentSnapshot = {
  readonly peerId: string;
  readonly doc: PlainNode;
  readonly events: EventSnapshot[];
  readonly conflicts: PlainNode[];
  readonly frontiers: string[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly formulaResults: Map<string, FormulaResult>;
};

export class DocumentSession {
  private readonly denicekDocument: Denicek;

  constructor(peerId: string, initial?: PlainNode) {
    this.denicekDocument = new Denicek(peerId, initial);
  }

  get peerId(): string {
    return this.denicekDocument.peer;
  }

  getDocument(): Denicek {
    return this.denicekDocument;
  }

  createSnapshot(): DocumentSnapshot {
    return {
      peerId: this.denicekDocument.peer,
      doc: this.denicekDocument.materialize(),
      events: this.denicekDocument.inspectEvents(),
      conflicts: this.denicekDocument.conflicts,
      frontiers: this.denicekDocument.frontiers,
      canUndo: this.denicekDocument.canUndo,
      canRedo: this.denicekDocument.canRedo,
      formulaResults: this.denicekDocument.evaluateFormulas(),
    };
  }

  add(target: string, field: string, value: PlainNode): void {
    this.denicekDocument.add(target, field, value);
  }

  delete(target: string, field: string): void {
    this.denicekDocument.delete(target, field);
  }

  rename(target: string, from: string, to: string): void {
    this.denicekDocument.rename(target, from, to);
  }

  set(target: string, value: PrimitiveValue): void {
    this.denicekDocument.set(target, value);
  }

  pushBack(target: string, value: PlainNode): void {
    this.denicekDocument.pushBack(target, value);
  }

  pushFront(target: string, value: PlainNode): void {
    this.denicekDocument.pushFront(target, value);
  }

  popBack(target: string): void {
    this.denicekDocument.popBack(target);
  }

  popFront(target: string): void {
    this.denicekDocument.popFront(target);
  }

  updateTag(target: string, tag: string): void {
    this.denicekDocument.updateTag(target, tag);
  }

  wrapRecord(target: string, field: string, tag: string): void {
    this.denicekDocument.wrapRecord(target, field, tag);
  }

  wrapList(target: string, tag: string): void {
    this.denicekDocument.wrapList(target, tag);
  }

  copy(target: string, source: string): void {
    this.denicekDocument.copy(target, source);
  }

  undo(): void {
    this.denicekDocument.undo();
  }

  redo(): void {
    this.denicekDocument.redo();
  }

  recomputeFormulas(): void {
    this.denicekDocument.recomputeFormulas();
  }
}
