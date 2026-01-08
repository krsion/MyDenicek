import type { Patch, Prop } from "@automerge/automerge";
import type { GeneralizedPatch } from "./types";

export class Recorder {
  private idMap: Record<string, string> = {}; // ID -> Var ($0, $1...)
  private varCounter = 0;
  private actions: GeneralizedPatch[] = [];

  constructor(startNodeId: string) {
    this.idMap[startNodeId] = "$0";
    this.varCounter = 1;
  }

  private generalizeProp(prop: Prop): Prop {
    if (typeof prop === 'string' && this.idMap[prop]) {
        return this.idMap[prop];
    }
    // Check if prop is a "new" ID that marks a creation or reference
    // Valid IDs in our system start with 'n_' or 'w-'
    if (typeof prop === 'string' && (prop.startsWith("n_") || prop.startsWith("w-"))) {
         if (!this.idMap[prop]) {
             this.idMap[prop] = "$" + this.varCounter++;
         }
         return this.idMap[prop];
    }
    return prop;
  }

  private generalizePath(path: Prop[]): Prop[] {
    return path.map(p => this.generalizeProp(p));
  }
  
  private generalizeValue(value: unknown): unknown {
      if (typeof value === 'string') {
          // If value is a stored ID (e.g. from idMap), return the variable
          if (this.idMap[value]) return this.idMap[value];
          // Otherwise keep value as is (identifiers in values will be generalized if they were defined before)
          return value;
      }
      if (Array.isArray(value)) {
          return value.map(v => this.generalizeValue(v));
      }
      if (typeof value === 'object' && value !== null) {
          const newObj: Record<string, unknown> = {};
          for (const k in value) {
              newObj[k] = this.generalizeValue((value as Record<string, unknown>)[k]);
          }
           return newObj;
      }
      return value;
  }
  
  
  addPatches(patches: Patch[]) {
      for (const patch of patches) {
          const newPatch: GeneralizedPatch = { ...patch, path: this.generalizePath(patch.path) };
          
          if (patch.action === 'put' || patch.action === 'splice') {
              newPatch.value = this.generalizeValue(patch.value);
          }
          if (patch.action === 'insert') {
              newPatch.values = patch.values.map(v => this.generalizeValue(v));
          }
          
          this.actions.push(newPatch);
      }
  }

  getActions() {
    return this.actions;
  }
}
