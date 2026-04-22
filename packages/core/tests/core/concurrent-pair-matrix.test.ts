/**
 * Concurrent Pair Matrix — principled OT testing.
 *
 * For each non-trivial pair of edit types, exactly one test verifies that:
 * 1. Both edits apply correctly when concurrent
 * 2. Both peers converge to the same state
 * 3. The intention of each edit is preserved
 *
 * Pairs where both edits target disjoint paths are trivially correct
 * (transformSelector returns identity) and are not tested here.
 */
import {
  assertEquals,
  Denicek,
  materializedConflicts,
  sync,
} from "./test-helpers.ts";

// ═══════════════════════════════════════════════════════════════════════
// RENAME interactions
// ═══════════════════════════════════════════════════════════════════════

Deno.test("pair: rename + rename same field", () => {
  const doc = { $tag: "root", name: "Alice" };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.rename("", "name", "fullName");
  b.rename("", "name", "title");
  sync(a, b);
  // Second rename in replay order retargets through the first
  assertEquals(a.toPlain(), b.toPlain());
  const result = a.toPlain() as Record<string, unknown>;
  assertEquals(result["name"], undefined);
});

Deno.test("pair: rename + add to renamed field", () => {
  const doc = { $tag: "root", data: { $tag: "rec", x: 1 } };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.rename("", "data", "info");
  b.add("data", "y", 2);
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  const result = a.toPlain() as Record<string, unknown>;
  assertEquals(result["data"], undefined);
  const info = result["info"] as Record<string, unknown>;
  assertEquals(info["y"], 2);
});

Deno.test("pair: rename + delete renamed field", () => {
  const doc = { $tag: "root", data: { $tag: "rec", x: 1 } };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.rename("", "data", "info");
  b.delete("", "data");
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
});

Deno.test("pair: rename + set on child of renamed field", () => {
  const doc = { $tag: "root", data: { $tag: "rec", val: "old" } };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.rename("", "data", "info");
  b.set("data/val", "new");
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  const info = (a.toPlain() as Record<string, unknown>)["info"] as Record<
    string,
    unknown
  >;
  assertEquals(info["val"], "new");
});

Deno.test("pair: rename + insert with payload targeting renamed field", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: [{ $tag: "li", text: "a" }] },
  };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.rename("items/*", "text", "label");
  b.insert("items", -1, { $tag: "li", text: "b" });
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  // Bob's inserted item should have "label" not "text" (wildcard rename applies)
  const items = (a.toPlain() as Record<string, unknown>)["items"] as Record<
    string,
    unknown
  >;
  const list = items["$items"] as Record<string, unknown>[];
  for (const item of list) {
    assertEquals(item["text"], undefined);
    assertEquals(typeof item["label"], "string");
  }
});

// ═══════════════════════════════════════════════════════════════════════
// WRAP interactions
// ═══════════════════════════════════════════════════════════════════════

Deno.test("pair: wrapRecord + concurrent set on wrapped child", () => {
  const doc = { $tag: "root", val: "old" };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.wrapRecord("val", "inner", "wrapper");
  b.set("val", "new");
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  // Set should retarget into the wrapper
  const wrapper = (a.toPlain() as Record<string, unknown>)["val"] as Record<
    string,
    unknown
  >;
  assertEquals(wrapper["$tag"], "wrapper");
  assertEquals(wrapper["inner"], "new");
});

Deno.test("pair: wrapList + concurrent set on wrapped child", () => {
  const doc = { $tag: "root", val: "old" };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.wrapList("val", "list");
  b.set("val", "new");
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
});

Deno.test("pair: wrapRecord + concurrent insert with payload", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: [{ $tag: "li", name: "a" }] },
  };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.wrapRecord("items/*/name", "value", "cell");
  b.insert("items", -1, { $tag: "li", name: "b" });
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  // Bob's inserted item's name should also be wrapped
  const items = (a.toPlain() as Record<string, unknown>)["items"] as Record<
    string,
    unknown
  >;
  const list = items["$items"] as Record<string, unknown>[];
  for (const item of list) {
    const name = item["name"] as Record<string, unknown>;
    assertEquals(name["$tag"], "cell");
    assertEquals(typeof name["value"], "string");
  }
});

Deno.test("pair: wrapRecord + wrapRecord same target", () => {
  const doc = { $tag: "root", val: "x" };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.wrapRecord("val", "inner", "wrapA");
  b.wrapRecord("val", "inner", "wrapB");
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  // Both wraps succeed — double nesting. Verify structure:
  const val = (a.toPlain() as Record<string, unknown>)["val"] as Record<
    string,
    unknown
  >;
  const outerTag = val["$tag"] as string;
  const inner = val["inner"] as Record<string, unknown>;
  const innerTag = inner["$tag"] as string;
  // One wrap is outer, one is inner — both tags present
  assertEquals(
    [outerTag, innerTag].sort(),
    ["wrapA", "wrapB"],
  );
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE interactions
// ═══════════════════════════════════════════════════════════════════════

Deno.test("pair: delete + set on deleted field", () => {
  const doc = { $tag: "root", x: "val" };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.delete("", "x");
  b.set("x", "updated");
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  assertEquals(materializedConflicts(a).length, 1);
});

Deno.test("pair: delete + add to deleted parent", () => {
  const doc = { $tag: "root", data: { $tag: "rec", x: 1 } };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.delete("", "data");
  b.add("data", "y", 2);
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  assertEquals(materializedConflicts(a).length, 1);
});

// ═══════════════════════════════════════════════════════════════════════
// INSERT + REMOVE interactions
// ═══════════════════════════════════════════════════════════════════════

Deno.test("pair: insert + remove at same index", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: ["a", "b", "c"] },
  };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.insert("items", 0, "NEW");
  b.remove("items", 0);
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  // Insert at 0 shifts remove to 1 — removes "a" (now at 1)
  const items = (a.toPlain() as Record<string, unknown>)["items"] as Record<
    string,
    unknown
  >;
  const list = items["$items"] as string[];
  assertEquals(list.includes("NEW"), true);
  assertEquals(list.includes("a"), false);
});

Deno.test("pair: remove + remove same index (double remove)", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: ["a", "b"] },
  };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.remove("items", 0);
  b.remove("items", 0);
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  // One succeeds, one becomes no-op
});

// ═══════════════════════════════════════════════════════════════════════
// COPY interactions
// ═══════════════════════════════════════════════════════════════════════

Deno.test("pair: copy + concurrent edit on source (mirroring)", () => {
  const doc = { $tag: "root", src: "hello", dst: "old" };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.copy("dst", "src");
  b.set("src", "world");
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  // Copy mirrors: dst should also get "world"
  const result = a.toPlain() as Record<string, unknown>;
  assertEquals(result["src"], "world");
  assertEquals(result["dst"], "world");
});

Deno.test("pair: copy + concurrent delete of source", () => {
  const doc = { $tag: "root", src: "hello", dst: "old" };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.copy("dst", "src");
  b.delete("", "src");
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  // Depending on replay order: copy may succeed (src existed when copy applied)
  // then delete removes src; OR delete first, then copy becomes no-op.
  // Either way, both peers converge.
  const result = a.toPlain() as Record<string, unknown>;
  assertEquals(result["src"], undefined, "src should be deleted");
});

Deno.test("pair: copy + concurrent insert in list", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: [{ $tag: "li", text: "a" }] },
    input: "new value",
  };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.insert("items", 0, { $tag: "li", text: "" });
  a.copy("items/!0/text", "input");
  b.insert("items", -1, { $tag: "li", text: "b" });
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  // Both inserts should be present
  const items = (a.toPlain() as Record<string, unknown>)["items"] as Record<
    string,
    unknown
  >;
  const list = items["$items"] as Record<string, unknown>[];
  assertEquals(list.length, 3);
});

// ═══════════════════════════════════════════════════════════════════════
// REORDER interactions
// ═══════════════════════════════════════════════════════════════════════

Deno.test("pair: reorder + concurrent insert", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: ["a", "b", "c"] },
  };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.reorder("items", 0, 2);
  b.insert("items", -1, "d");
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
});

Deno.test("pair: reorder + concurrent remove", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: ["a", "b", "c"] },
  };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.reorder("items", 0, 2);
  b.remove("items", 1);
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
});

// ═══════════════════════════════════════════════════════════════════════
// UPDATETAG interactions
// ═══════════════════════════════════════════════════════════════════════

Deno.test("pair: updateTag wildcard + concurrent insert", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [{ $tag: "li", text: "a" }, { $tag: "li", text: "b" }],
    },
  };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.updateTag("items/*", "tr");
  b.insert("items", -1, { $tag: "li", text: "c" });
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  // Concurrent insert should also get tag "tr"
  const items = (a.toPlain() as Record<string, unknown>)["items"] as Record<
    string,
    unknown
  >;
  const list = items["$items"] as Record<string, unknown>[];
  for (const item of list) {
    assertEquals(item["$tag"], "tr");
  }
});

Deno.test("pair: updateTag + concurrent rename of tagged node", () => {
  const doc = { $tag: "root", data: { $tag: "old", val: 1 } };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  a.updateTag("data", "new");
  b.rename("", "data", "info");
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  const result = a.toPlain() as Record<string, unknown>;
  const info = result["info"] as Record<string, unknown>;
  assertEquals(info["$tag"], "new");
});

// ═══════════════════════════════════════════════════════════════════════
// FORMULA + concurrent delete (gap test)
// ═══════════════════════════════════════════════════════════════════════

Deno.test("pair: add formula ref + concurrent delete of referenced node", () => {
  const doc = {
    $tag: "root",
    data: { $tag: "rec", source: "hello" },
    output: "placeholder",
  };
  const a = new Denicek("a", doc);
  const b = new Denicek("b", doc);
  // Bob deletes the data field
  b.delete("", "data");
  // Alice adds a reference to data/source
  a.add("", "formula", { $ref: "../data/source" });
  sync(a, b);
  assertEquals(a.toPlain(), b.toPlain());
  // Alice's add should conflict (target deleted)
  assertEquals(materializedConflicts(a).length > 0, true);
});
