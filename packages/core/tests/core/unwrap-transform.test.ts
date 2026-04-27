import { assertEquals } from "@std/assert";
import { UnwrapListEdit, UnwrapRecordEdit } from "../../core/edits.ts";
import { REMOVED_SELECTOR, Selector } from "../../core/selector.ts";

// ---------------------------------------------------------------------------
// UnwrapRecordEdit.transformSelector
// ---------------------------------------------------------------------------

Deno.test("UnwrapRecordEdit.transformSelector: matching field path is unwrapped", () => {
  // target = "a", field = "field"  →  selector "a/field/x" becomes "a/x"
  const edit = new UnwrapRecordEdit(Selector.parse("a"), "field");
  const result = edit.transformSelector(Selector.parse("a/field/x"));
  assertEquals(result, { kind: "mapped", selector: Selector.parse("a/x") });
});

Deno.test("UnwrapRecordEdit.transformSelector: non-matching field is removed", () => {
  // target = "a", field = "field"  →  selector "a/other" goes through the
  // removed wrapper so it becomes REMOVED_SELECTOR.
  const edit = new UnwrapRecordEdit(Selector.parse("a"), "field");
  const result = edit.transformSelector(Selector.parse("a/other"));
  assertEquals(result, REMOVED_SELECTOR);
});

Deno.test("UnwrapRecordEdit.transformSelector: no prefix match leaves selector unchanged", () => {
  // target = "a"  →  selector "b/field/x" doesn't overlap, returned as-is.
  const edit = new UnwrapRecordEdit(Selector.parse("a"), "field");
  const result = edit.transformSelector(Selector.parse("b/field/x"));
  assertEquals(result, {
    kind: "mapped",
    selector: Selector.parse("b/field/x"),
  });
});

// ---------------------------------------------------------------------------
// UnwrapListEdit.transformSelector
// ---------------------------------------------------------------------------

Deno.test("UnwrapListEdit.transformSelector: index 0 path is unwrapped", () => {
  // target = "a"  →  selector "a/0/x" becomes "a/x" (item 0 survives)
  const edit = new UnwrapListEdit(Selector.parse("a"));
  const result = edit.transformSelector(Selector.parse("a/0/x"));
  assertEquals(result, { kind: "mapped", selector: Selector.parse("a/x") });
});

Deno.test("UnwrapListEdit.transformSelector: non-zero index is removed", () => {
  // target = "a"  →  selector "a/1/x" is REMOVED (only item 0 survives)
  const edit = new UnwrapListEdit(Selector.parse("a"));
  const result = edit.transformSelector(Selector.parse("a/1/x"));
  assertEquals(result, REMOVED_SELECTOR);
});

Deno.test("UnwrapListEdit.transformSelector: no prefix match leaves selector unchanged", () => {
  // target = "a"  →  selector "b/0/x" doesn't overlap, returned as-is.
  const edit = new UnwrapListEdit(Selector.parse("a"));
  const result = edit.transformSelector(Selector.parse("b/0/x"));
  assertEquals(result, {
    kind: "mapped",
    selector: Selector.parse("b/0/x"),
  });
});
