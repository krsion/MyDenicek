import type { GeneralizedPatch } from "./Recorder";
import { type JsonDoc } from "./types";
import { applyPatches } from "./UndoManager";

export function replayScript(doc: JsonDoc, script: GeneralizedPatch[], startNodeId: string): void {
    const replayMap: Record<string, string> = { "$0": startNodeId };
    
    // Resolves property keys, generating new IDs for unknown variables (e.g., $1 -> n_newuuid)
    const resolveProp = (p: string | number): string | number => {
        if (typeof p === 'string' && p.startsWith("$")) {
             if (replayMap[p]) return replayMap[p];
             
             // Generate new ID for encountered variable definition
             replayMap[p] = `n_${getUUID()}`;
             return replayMap[p];
        }
        return p;
    };
    
    // Recursively resolves values replacing variables with actual IDs
    const resolveValue = (v: unknown): unknown => {
         if (typeof v === 'string' && v.startsWith("$")) {
             return replayMap[v] || v; 
         }
         if (Array.isArray(v)) return v.map(resolveValue);
         if (typeof v === 'object' && v !== null) {
              const newObj: any = {};
              for (const k in v) {
                  newObj[k] = resolveValue((v as any)[k]);
              }
              return newObj;
         }
         return v;
    };

    const resolvedPatches = script.map(patch => {
        const path = patch.path.map(p => resolveProp(p));
        
        let value = patch.value;
        let values = patch.values;
        
        if (patch.action === 'put' || patch.action === 'splice') {
             value = resolveValue(patch.value);
        }
        if (patch.action === 'insert') {
             values = patch.values?.map(v => resolveValue(v));
        }

        return { ...patch, path, value, values } as any; 
    });

    applyPatches(doc, resolvedPatches);
}

// Helper
const getUUID = () => {
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : Math.random().toString(36).slice(2);
};
