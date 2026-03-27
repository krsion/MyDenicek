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
  const directPeer = new Denicek("direct", initialDocument);
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

    const replayDocument = replayPeer.toPlain() as { messages: { $items: string[] } };
    for (const [messageIndex] of replayDocument.messages.$items.slice(1).entries()) {
      replayPeer.applyPrimitiveEdit(`messages/${messageIndex + 1}`, "capitalize");
    }
  }

  {
    const plainDocument = directPeer.toPlain() as { messages: { $items: string[] } };
    for (const [messageIndex, message] of plainDocument.messages.$items.entries()) {
      directPeer.set(`messages/${messageIndex}`, capitalizeMessageWords(message));
    }
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
  assertEquals(directPeer.toPlain(), expected);
});
