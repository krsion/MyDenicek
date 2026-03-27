import { isDeepStrictEqual } from "node:util";

function formatValue(value: unknown): string {
  return Deno.inspect(value, {
    depth: Infinity,
    iterableLimit: Infinity,
    sorted: true,
  });
}

function fail(message: string): never {
  throw new Error(message);
}

export function assert(expr: unknown, msg?: string): asserts expr {
  if (!expr) {
    fail(msg ?? "Assertion failed.");
  }
}

export function assertEquals(actual: unknown, expected: unknown, msg?: string): void {
  if (isDeepStrictEqual(actual, expected)) {
    return;
  }

  fail(
    msg ??
      `Values are not equal.\nActual: ${formatValue(actual)}\nExpected: ${formatValue(expected)}`,
  );
}

export function assertThrows(
  fn: () => unknown,
  ErrorClass?: new (...args: never[]) => Error,
  msgIncludes?: string | RegExp,
): Error {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof Error)) {
      fail(`Expected function to throw an Error, but threw ${formatValue(error)}.`);
    }

    if (ErrorClass !== undefined && !(error instanceof ErrorClass)) {
      fail(
        `Expected function to throw ${ErrorClass.name}, but threw ${error.constructor.name}.`,
      );
    }

    if (typeof msgIncludes === "string" && !error.message.includes(msgIncludes)) {
      fail(
        `Expected error message to include ${formatValue(msgIncludes)}, but got ${formatValue(error.message)}.`,
      );
    }

    if (msgIncludes instanceof RegExp && !msgIncludes.test(error.message)) {
      fail(
        `Expected error message to match ${String(msgIncludes)}, but got ${formatValue(error.message)}.`,
      );
    }

    return error;
  }

  fail("Expected function to throw.");
}
