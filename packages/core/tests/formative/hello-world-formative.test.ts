import { assertEquals } from "@std/assert";
import { Denicek } from "../../mod.ts";

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
  const normalizeTwoWordMessage = (message: string): string =>
    message
      .toLowerCase()
      .split(" ")
      .filter((word) => word.length > 0)
      .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
      .join(" ");

  {
    const plainDocument = recordedPeer.toPlain() as { messages: { $items: string[] } };
    recordedPeer.set("messages/0", normalizeTwoWordMessage(plainDocument.messages.$items[0]!));
    for (const [messageIndex, message] of plainDocument.messages.$items.entries()) {
      if (messageIndex === 0) {
        continue;
      }
      recordedPeer.set(`messages/${messageIndex}`, normalizeTwoWordMessage(message));
    }
  }

  {
    const plainDocument = directPeer.toPlain() as { messages: { $items: string[] } };
    for (const [messageIndex, message] of plainDocument.messages.$items.entries()) {
      directPeer.set(`messages/${messageIndex}`, normalizeTwoWordMessage(message));
    }
  }

  const expected = {
    $tag: "app",
    messages: {
      $tag: "ul",
      $items: ["Hello World", "Good Morning", "Denicek Formative"],
    },
  };
  assertEquals(recordedPeer.toPlain(), expected);
  assertEquals(directPeer.toPlain(), expected);
});
