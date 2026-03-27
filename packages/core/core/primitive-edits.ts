import type { PrimitiveValue } from './selector.ts';

export type PrimitiveEditImplementation = (value: PrimitiveValue) => PrimitiveValue;

const registeredPrimitiveEdits = new Map<string, PrimitiveEditImplementation>();

/**
 * Registers a named primitive edit for the current runtime.
 *
 * Every peer that replays events using this edit name must register the same
 * implementation in its own runtime before materializing those events.
 */
export function registerPrimitiveEdit(name: string, implementation: PrimitiveEditImplementation): void {
  if (name.trim().length === 0) {
    throw new Error("Primitive edit name must not be empty.");
  }

  const existingImplementation = registeredPrimitiveEdits.get(name);
  if (existingImplementation === implementation) {
    return;
  }
  if (existingImplementation !== undefined) {
    throw new Error(`Primitive edit '${name}' is already registered.`);
  }

  registeredPrimitiveEdits.set(name, implementation);
}

export function applyRegisteredPrimitiveEdit(name: string, value: PrimitiveValue): PrimitiveValue {
  const implementation = registeredPrimitiveEdits.get(name);
  if (implementation === undefined) {
    throw new Error(`Unknown primitive edit '${name}'. Register it before replaying events that use it.`);
  }
  return implementation(value);
}
