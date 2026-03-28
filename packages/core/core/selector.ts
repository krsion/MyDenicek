// ── Primitives ──────────────────────────────────────────────────────

/** Scalar values that can appear as leaf nodes in the document tree. */
export type PrimitiveValue = string | number | boolean;

/**
 * A single segment in a selector path.
 * - `string` — record field name, `"*"` (all children), or `".."` (parent)
 * - `number` — list index position
 */
export type SelectorSegment = string | number;

// ── Selector ────────────────────────────────────────────────────────

type PrefixMatch = { kind: "matched"; specificPrefix: Selector; rest: Selector } | { kind: "no-match" };
export type SelectorTransform = { kind: "mapped"; selector: Selector } | { kind: "removed" };

const NO_PREFIX_MATCH: PrefixMatch = { kind: "no-match" };
export const REMOVED_SELECTOR: SelectorTransform = { kind: "removed" };

export function mapSelector(selector: Selector): SelectorTransform {
  return { kind: "mapped", selector };
}

export function validateFieldName(field: string): void {
  if (field.length === 0) {
    throw new Error("Field names cannot be empty.");
  }
  if (field.includes("/")) {
    throw new Error(`Field name '${field}' cannot contain '/'.`);
  }
  if (field === "*" || field === "..") {
    throw new Error(`Field name '${field}' is reserved by selector syntax.`);
  }
  const numericField = Number(field);
  if (numericField >= 0 && Number.isInteger(numericField) && String(numericField) === field) {
    throw new Error(`Field name '${field}' is reserved by selector syntax.`);
  }
}

/** An ordered path of segments addressing a node (or set of nodes) in the document tree. */
export class Selector {
  readonly segments: SelectorSegment[];

  constructor(segments: SelectorSegment[]) {
    this.segments = segments;
  }

  static parse(path: string): Selector {
    const trimmed = path.trim();
    if (trimmed === "" || trimmed === "/") return new Selector([]);
    const isAbs = trimmed.startsWith("/");
    const parts = trimmed
      .replace(/^\//, "")
      .split("/")
      .filter((p) => p.length > 0)
      .map((part): SelectorSegment => {
        if (part === "*" || part === "..") return part;
        const n = Number(part);
        return Number.isFinite(n) && String(n) === part ? n : part;
      });
    return new Selector(isAbs ? ["/", ...parts] : parts);
  }

  format(): string {
    if (this.segments.length === 0) return "/";
    if (this.segments[0] === "/") return `/${this.segments.slice(1).map(String).join("/")}`;
    return this.segments.map(String).join("/");
  }

  get isAbsolute(): boolean {
    return this.segments.length > 0 && this.segments[0] === "/";
  }

  get parent(): Selector {
    return new Selector(this.segments.slice(0, -1));
  }

  get lastSegment(): SelectorSegment {
    return this.segments[this.segments.length - 1]!;
  }

  get length(): number {
    return this.segments.length;
  }

  at(index: number): SelectorSegment | undefined {
    return this.segments.at(index);
  }

  slice(start: number, end?: number): Selector {
    return new Selector(this.segments.slice(start, end));
  }

  equals(other: Selector): boolean {
    return this.segments.length === other.segments.length &&
      this.segments.every((seg, i) => seg === other.segments[i]);
  }

  /***
   * If `this` is a prefix of `full` (e.g., `a/*` is a prefix of `a/1/b`),
   * returns the specific prefix segments and the remaining suffix.
   */
  matchPrefix(full: Selector): PrefixMatch {
    if (this.segments.length > full.segments.length) return NO_PREFIX_MATCH;
    const specificPrefix: SelectorSegment[] = [];
    for (let i = 0; i < this.segments.length; i++) {
      const prefixSeg = this.segments[i]!;
      const fullSeg = full.segments[i]!;
      if (prefixSeg === fullSeg) {
        specificPrefix.push(prefixSeg);
      } else if (prefixSeg === "*" && typeof fullSeg === "number") {
        specificPrefix.push(fullSeg);
      } else {
        return NO_PREFIX_MATCH;
      }
    }
    return { kind: "matched", specificPrefix: new Selector(specificPrefix), rest: full.slice(this.segments.length) };
  }

  /** Shifts numeric indices in `other` that traverse through this selector's list target. */
  shiftIndex(other: Selector, threshold: number, delta: number): SelectorTransform {
    const m = this.matchPrefix(other);
    if (m.kind === "no-match" || m.rest.length === 0) return mapSelector(other);
    const head = m.rest.segments[0]!;
    const tail = m.rest.slice(1);
    if (typeof head !== "number") return mapSelector(other);
    const shifted = head + (head >= threshold ? delta : 0);
    if (shifted < 0) return REMOVED_SELECTOR;
    return mapSelector(new Selector([...m.specificPrefix.segments, shifted, ...tail.segments]));
  }
}
