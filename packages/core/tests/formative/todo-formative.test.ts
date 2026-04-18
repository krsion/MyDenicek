import { assertEquals } from "@std/assert";
import { Denicek } from "../../mod.ts";

Deno.test("Formative: Todo App", () => {
  const peer = new Denicek("alice", {
    $tag: "app",
    composer: {
      $tag: "composer",
      input: {
        $tag: "input",
        value: "Review feedback",
      },
      addAction: {
        $tag: "button",
        steps: { $tag: "event-steps", $items: [] },
      },
    },
    items: {
      $tag: "ul",
      $items: [
        { $tag: "li", $items: ["Ship prototype"] },
        { $tag: "li", $items: ["Write paper"] },
      ],
    },
  });

  const insertItemEventId = peer.insert("items", 0, {
    $tag: "li",
    $items: [""],
  }, true);
  const copyInputEventId = peer.copy("items/!0/0", "composer/input/value");

  peer.insert("composer/addAction/steps", -1, {
    $tag: "replay-step",
    eventId: insertItemEventId,
  }, true);
  peer.insert("composer/addAction/steps", -1, {
    $tag: "replay-step",
    eventId: copyInputEventId,
  }, true);

  assertEquals(peer.toPlain(), {
    $tag: "app",
    composer: {
      $tag: "composer",
      input: {
        $tag: "input",
        value: "Review feedback",
      },
      addAction: {
        $tag: "button",
        steps: {
          $tag: "event-steps",
          $items: [
            { $tag: "replay-step", eventId: "alice:0" },
            { $tag: "replay-step", eventId: "alice:1" },
          ],
        },
      },
    },
    items: {
      $tag: "ul",
      $items: [
        { $tag: "li", $items: ["Review feedback"] },
        { $tag: "li", $items: ["Ship prototype"] },
        { $tag: "li", $items: ["Write paper"] },
      ],
    },
  });

  peer.set("composer/input/value", "Book venue");
  peer.repeatEditsFrom("composer/addAction/steps");

  assertEquals(peer.toPlain(), {
    $tag: "app",
    composer: {
      $tag: "composer",
      input: {
        $tag: "input",
        value: "Book venue",
      },
      addAction: {
        $tag: "button",
        steps: {
          $tag: "event-steps",
          $items: [
            { $tag: "replay-step", eventId: "alice:0" },
            { $tag: "replay-step", eventId: "alice:1" },
          ],
        },
      },
    },
    items: {
      $tag: "ul",
      $items: [
        { $tag: "li", $items: ["Book venue"] },
        { $tag: "li", $items: ["Review feedback"] },
        { $tag: "li", $items: ["Ship prototype"] },
        { $tag: "li", $items: ["Write paper"] },
      ],
    },
  });
});
