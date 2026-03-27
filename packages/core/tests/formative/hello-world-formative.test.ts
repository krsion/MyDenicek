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
    const capitalizeEvent = recordedPeer.inspectEvents().find((event) =>
      event.editKind === "ApplyPrimitiveEdit" && event.target === "messages/0"
    );
    for (const event of recordedPeer.drain()) {
      replayPeer.applyRemote(event);
    }
    if (capitalizeEvent === undefined) {
      throw new Error("Expected the recorded peer to produce a capitalize event.");
    }

    replayPeer.replayEditFromEvent(capitalizeEvent.id, "messages/1");
    replayPeer.replayEditFromEvent(capitalizeEvent.id, "messages/2");
  }

  {
    for (const [index, message] of directPeer.get("messages/*").entries()) {
      directPeer.set(`messages/${index}`, capitalizeMessageWords(message as string));
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
