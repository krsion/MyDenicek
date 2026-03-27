import { assertEquals } from "@std/assert";
import { Denicek } from "../../mod.ts";

Deno.test("Formative: Counter App", () => {
  const peer = new Denicek("alice", {
    $tag: "app",
    formula: { $tag: "ops", $items: [] as number[] },
    count: 0,
  });

  for (let index = 0; index < 2; index++) {
    peer.pushBack("formula", 1);
  }
  for (let index = 0; index < 1; index++) {
    peer.pushBack("formula", -1);
  }

  const plainDocument = peer.toPlain() as {
    formula: { $items: number[] };
  };
  const nextCount = plainDocument.formula.$items.reduce((sum, delta) => sum + delta, 0);
  peer.set("count", nextCount);

  assertEquals(peer.toPlain(), {
    $tag: "app",
    formula: { $tag: "ops", $items: [1, 1, -1] },
    count: 1,
  });
  assertEquals(peer.inspectEvents().map(({ editKind, target }) => ({ editKind, target })), [
    { editKind: "ListPushBack", target: "formula" },
    { editKind: "ListPushBack", target: "formula" },
    { editKind: "ListPushBack", target: "formula" },
    { editKind: "SetValue", target: "count" },
  ]);
});
