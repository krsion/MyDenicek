import type { PrimitiveValue } from "./selector.ts";

/** Function signature for a named primitive edit replayed against a primitive value. */
export type PrimitiveEditImplementation = (
  value: PrimitiveValue,
  ...args: PrimitiveValue[]
) => PrimitiveValue;

const registeredPrimitiveEdits = new Map<string, PrimitiveEditImplementation>();

/**
 * Registers a named primitive edit for the current runtime.
 *
 * Every peer that replays events using this edit name must register the same
 * implementation in its own runtime before materializing those events. Any
 * primitive arguments carried by the event are passed to the implementation
 * after the current primitive value.
 */
export function registerPrimitiveEdit(
  name: string,
  implementation: PrimitiveEditImplementation,
): void {
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

/** Applies a previously registered primitive edit by name to a primitive value. */
export function applyRegisteredPrimitiveEdit(
  name: string,
  value: PrimitiveValue,
  args: PrimitiveValue[] = [],
): PrimitiveValue {
  const implementation = registeredPrimitiveEdits.get(name);
  if (implementation === undefined) {
    throw new Error(
      `Unknown primitive edit '${name}'. Register it before replaying events that use it.`,
    );
  }
  return implementation(value, ...args);
}

registerPrimitiveEdit("set", (_value, ...args) => {
  if (args.length !== 1) {
    throw new Error("Primitive edit 'set' expects exactly 1 argument.");
  }
  return args[0]!;
});
