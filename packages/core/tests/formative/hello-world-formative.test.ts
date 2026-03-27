import { assertEquals } from "@std/assert";
import { Denicek, registerPrimitiveEdit } from "../../mod.ts";

Deno.test("Formative: Hello World", () => {
  const initialDocument = {
    $tag: "app",
    messages: {
      $tag: "ul",
      $items: ["heLLo woRLD", "gOOD mORning", "denICEk FORmative"],
    },
  };
  const recordedPeer = new Denicek("recorded", initialDocument);
  const replayPeer = new Denicek("replay", initialDocument);
  const capitalizeMessageWords = (message: string): string =>
    message
      .toLowerCase()
      .split(" ")
      .filter((word) => word.length > 0)
      .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
      .join(" ");

  registerPrimitiveEdit("capitalize", (value) => {
    if (typeof value !== "string") {
      throw new Error("capitalize expects a string.");
    }
    return capitalizeMessageWords(value);
  });

  {
    recordedPeer.applyPrimitiveEdit("messages/0", "capitalize");
    for (const event of recordedPeer.drain()) {
      replayPeer.applyRemote(event);
    }
    const capitalizeEvent = replayPeer.inspectEvents().find((event) =>
      event.editKind === "ApplyPrimitiveEdit" && event.target === "messages/0"
    );
    if (capitalizeEvent === undefined) {
      throw new Error("Expected the replay peer to contain a capitalize event.");
    }

    replayPeer.replayEditFromEvent(capitalizeEvent.id, "messages/1");
    replayPeer.replayEditFromEvent(capitalizeEvent.id, "messages/2");
  }

  const expected = {
    $tag: "app",
    messages: {
      $tag: "ul",
      $items: ["Hello World", "Good Morning", "Denicek Formative"],
    },
  };
  assertEquals(recordedPeer.toPlain(), {
    $tag: "app",
    messages: {
      $tag: "ul",
      $items: ["Hello World", "gOOD mORning", "denICEk FORmative"],
    },
  });
  assertEquals(replayPeer.toPlain(), expected);
});
