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

  const insertItemEventId = peer.pushFront("items", {
    $tag: "li",
    $items: [""],
  });
  const copyInputEventId = peer.copy("items/!0/0", "composer/input/value");

  peer.pushBack("composer/addAction/steps", {
    $tag: "replay-step",
    eventId: insertItemEventId,
  });
  peer.pushBack("composer/addAction/steps", {
    $tag: "replay-step",
    eventId: copyInputEventId,
  });

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
