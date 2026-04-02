import { assertEquals, Denicek, sync } from "../core/test-helpers.ts";

type ContactCell = {
  $tag: "td";
  contact: string;
};

type NameCell = {
  $tag: "td";
  name:
    | ""
    | {
      $tag: "split-first";
      source: { $ref: string };
      separator: ", ";
    };
};

type SpeakerRow = {
  $tag: "tr";
  $items: [ContactCell, NameCell];
};

type ReplayStep = {
  $tag: "replay-step";
  eventId: string;
};

type ConferenceDocument = {
  $tag: "app";
  controls: {
    $tag: "toolbar";
    input: {
      $tag: "input";
      value: string;
    };
    addSpeakerFromInput: {
      $tag: "button";
      steps: {
        $tag: "event-steps";
        $items: ReplayStep[];
      };
    };
  };
  speakers: {
    $tag: "table";
    $items: SpeakerRow[];
  };
};

Deno.test("Formative: Conference List", () => {
  const initialDocument = {
    $tag: "app",
    controls: {
      $tag: "toolbar",
      input: {
        $tag: "input",
        value: "Katherine Johnson, katherine@example.com",
      },
      addSpeakerFromInput: {
        $tag: "button",
        steps: { $tag: "event-steps", $items: [] },
      },
    },
    speakers: {
      $tag: "ul",
      $items: [
        { $tag: "li", contact: "Ada Lovelace, ada@example.com" },
        { $tag: "li", contact: "Grace Hopper, grace@example.com" },
      ],
    },
  };
  const alice = new Denicek("alice", initialDocument);
  const bob = new Denicek("bob", initialDocument);

  const insertListSpeakerEventId = alice.pushBack("speakers", {
    $tag: "li",
    contact: "",
  });
  const copyListInputEventId = alice.copy(
    "speakers/!2/contact",
    "controls/input/value",
  );
  alice.pushBack("controls/addSpeakerFromInput/steps", {
    $tag: "replay-step",
    eventId: insertListSpeakerEventId,
  });
  alice.pushBack("controls/addSpeakerFromInput/steps", {
    $tag: "replay-step",
    eventId: copyListInputEventId,
  });
  alice.popBack("speakers");

  sync(alice, bob);

  alice.updateTag("speakers", "table");
  alice.updateTag("speakers/*", "td");
  alice.wrapList("speakers/*", "tr");
  alice.pushBack("speakers/*", {
    $tag: "td",
    name: {
      $tag: "split-first",
      source: { $ref: "../../../0/contact" },
      separator: ", ",
    },
  });

  bob.set("controls/input/value", "Margaret Hamilton, margaret@example.com");
  bob.repeatEditsFrom("controls/addSpeakerFromInput/steps");

  sync(alice, bob);
  const mergedConference = alice.toPlain() as ConferenceDocument;
  assertEquals(
    mergedConference.speakers.$items.map((row) => ({
      tag: row.$tag,
      contact: row.$items[0].contact,
    })),
    [
      { tag: "tr", contact: "Ada Lovelace, ada@example.com" },
      { tag: "tr", contact: "Grace Hopper, grace@example.com" },
      { tag: "tr", contact: "Margaret Hamilton, margaret@example.com" },
    ],
  );

  const expected: ConferenceDocument = {
    $tag: "app",
    controls: {
      $tag: "toolbar",
      input: {
        $tag: "input",
        value: "Margaret Hamilton, margaret@example.com",
      },
      addSpeakerFromInput: {
        $tag: "button",
        steps: {
          $tag: "event-steps",
          $items: [
            { $tag: "replay-step", eventId: insertListSpeakerEventId },
            { $tag: "replay-step", eventId: copyListInputEventId },
          ],
        },
      },
    },
    speakers: {
      $tag: "table",
      $items: [
        {
          $tag: "tr",
          $items: [
            { $tag: "td", contact: "Ada Lovelace, ada@example.com" },
            {
              $tag: "td",
              name: {
                $tag: "split-first",
                source: { $ref: "../../../0/contact" },
                separator: ", ",
              },
            },
          ],
        },
        {
          $tag: "tr",
          $items: [
            { $tag: "td", contact: "Grace Hopper, grace@example.com" },
            {
              $tag: "td",
              name: {
                $tag: "split-first",
                source: { $ref: "../../../0/contact" },
                separator: ", ",
              },
            },
          ],
        },
        {
          $tag: "tr",
          $items: [
            { $tag: "td", contact: "Margaret Hamilton, margaret@example.com" },
            {
              $tag: "td",
              name: {
                $tag: "split-first",
                source: { $ref: "../../../0/contact" },
                separator: ", ",
              },
            },
          ],
        },
      ],
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});
