
export type RecordedAction =
  | { type: "addChild"; parent: string; newIdVar: string; nodeType: "value" | "element"; content: string }
  | { type: "setValue"; target: string; value: string }
  | { type: "wrap"; target: string; wrapperTag: string }
  | { type: "rename"; target: string; newTag: string };

export class Recorder {
  private idMap: Record<string, string> = {}; // ID -> Var
  private varCounter = 0;
  private actions: RecordedAction[] = [];

  constructor(startNodeId: string) {
    this.idMap[startNodeId] = "$0";
    this.varCounter = 1;
  }

  getRef(id: string): string {
    if (this.idMap[id]) return this.idMap[id];
    
    // Handle wrappers: w-ID -> w-{Ref}
    // We assume standard wrapping naming convention w-{targetId}
    // This handles simple cases. Nested wrappers or collisions might need more complex logic
    // but for the demo this is likely sufficient if we assume deterministic behavior.
    if (id.startsWith("w-")) {
        const innerId = id.substring(2);
        const innerRef = this.getRef(innerId);
        if (innerRef !== innerId) {
            return "w-" + innerRef;
        }
    }

    // Handle collision suffixes: ID_w -> {Ref}_w
    if (id.endsWith("_w")) {
        const innerId = id.substring(0, id.length - 2);
        const innerRef = this.getRef(innerId);
        if (innerRef !== innerId) {
            return innerRef + "_w";
        }
    }
    
    return id;
  }

  recordAddChild(parentId: string, newId: string, nodeType: "value" | "element", content: string) {
    const parentRef = this.getRef(parentId);
    const newVar = "$" + this.varCounter++;
    this.idMap[newId] = newVar;
    this.actions.push({ type: "addChild", parent: parentRef, newIdVar: newVar, nodeType, content });
  }

  recordSetValue(targetId: string, value: string) {
    const targetRef = this.getRef(targetId);
    this.actions.push({ type: "setValue", target: targetRef, value });
  }

  recordWrap(targetId: string, wrapperTag: string) {
    const targetRef = this.getRef(targetId);
    this.actions.push({ type: "wrap", target: targetRef, wrapperTag });
  }

  recordRename(targetId: string, newTag: string) {
    const targetRef = this.getRef(targetId);
    this.actions.push({ type: "rename", target: targetRef, newTag });
  }

  getActions() {
    return this.actions;
  }
}
