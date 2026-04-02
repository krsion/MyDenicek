import { assertEquals, Denicek, sync } from "../core/test-helpers.ts";

type ContactCell = {
  $tag: "td";
  contact: string;
};

type NameCell = {
  $tag: "td";
  name: {
    $tag: "split-first";
    source: { $ref: "../../../0/contact" };
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

  const insertListSpeakerEventId = alice.pushFront("speakers", {
    $tag: "li",
    contact: "",
  });
  const copyListInputEventId = alice.copy(
    "speakers/!0/contact",
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

  sync(alice, bob);

  bob.set("controls/input/value", "Margaret Hamilton, margaret@example.com");
  bob.repeatEditsFrom("controls/addSpeakerFromInput/steps");

  const retagTableEventId = alice.updateTag("speakers", "table");
  const retagCellsEventId = alice.updateTag("speakers/*", "td");
  const wrapRowsEventId = alice.wrapList("speakers/*", "tr");
  const addNameCellsEventId = alice.pushBack("speakers/*", {
    $tag: "td",
    name: {
      $tag: "split-first",
      source: { $ref: "../../../0/contact" },
      separator: ", ",
    },
  });
  alice.pushBack("controls/addSpeakerFromInput/steps", {
    $tag: "replay-step",
    eventId: retagTableEventId,
  });
  alice.pushBack("controls/addSpeakerFromInput/steps", {
    $tag: "replay-step",
    eventId: retagCellsEventId,
  });
  alice.pushBack("controls/addSpeakerFromInput/steps", {
    $tag: "replay-step",
    eventId: wrapRowsEventId,
  });
  alice.pushBack("controls/addSpeakerFromInput/steps", {
    $tag: "replay-step",
    eventId: addNameCellsEventId,
  });

  sync(alice, bob);

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
            { $tag: "replay-step", eventId: retagTableEventId },
            { $tag: "replay-step", eventId: retagCellsEventId },
            { $tag: "replay-step", eventId: wrapRowsEventId },
            { $tag: "replay-step", eventId: addNameCellsEventId },
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
        {
          $tag: "tr",
          $items: [
            { $tag: "td", contact: "Katherine Johnson, katherine@example.com" },
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
      ],
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
  assertEquals(
    expected.speakers.$items.map((row) =>
      row.$items[0].contact.split(row.$items[1].name.separator)[0]!.trim()
    ),
    [
      "Margaret Hamilton",
      "Katherine Johnson",
      "Ada Lovelace",
      "Grace Hopper",
    ],
  );
});
