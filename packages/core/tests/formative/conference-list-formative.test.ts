import { assertEquals, Denicek, sync } from "../core/test-helpers.ts";

// ── Types shared by both tests ─────────────────────────────────────

type ReplayStep = {
  $tag: "replay-step";
  eventId: string;
};

// ── Conference List (before) ─────────────────────────────────────────
// A flat <ul> where each item stores "Name, email" as a single string.
// Two peers concurrently add speakers and converge.
// This is the natural starting point before structured columns exist.

Deno.test("Formative: Conference List", () => {
  const initialDocument = {
    $tag: "app",
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

  // Alice and Bob concurrently add speakers
  alice.pushBack("speakers", {
    $tag: "li",
    contact: "Katherine Johnson, katherine@example.com",
  });
  bob.pushBack("speakers", {
    $tag: "li",
    contact: "Margaret Hamilton, margaret@example.com",
  });

  sync(alice, bob);

  // Both peers converge — all four speakers present
  const speakers = (alice.toPlain() as {
    $tag: string;
    speakers: { $tag: string; $items: { contact: string }[] };
  }).speakers.$items.map((s) => s.contact);
  assertEquals(speakers.length, 4);
  assertEquals(speakers.includes("Ada Lovelace, ada@example.com"), true);
  assertEquals(speakers.includes("Grace Hopper, grace@example.com"), true);
  assertEquals(
    speakers.includes("Katherine Johnson, katherine@example.com"),
    true,
  );
  assertEquals(
    speakers.includes("Margaret Hamilton, margaret@example.com"),
    true,
  );
  assertEquals(alice.toPlain(), bob.toPlain());
});

// ── Conference Table (after) ─────────────────────────────────────────
// Evolves the list into a <table> with split name/contact columns, then
// verifies concurrent adds still converge.

type ReplayStep = {
  $tag: "replay-step";
  eventId: string;
};

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

type TableDocument = {
  $tag: "app";
  controls: {
    $tag: "toolbar";
    input: { $tag: "input"; value: string };
    addSpeakerFromInput: {
      $tag: "button";
      steps: { $tag: "event-steps"; $items: ReplayStep[] };
    };
  };
  speakers: {
    $tag: "table";
    $items: SpeakerRow[];
  };
};

Deno.test("Formative: Conference Table", () => {
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

  // Record the "add speaker" recipe (list phase)
  const insertId = alice.pushBack("speakers", { $tag: "li", contact: "" });
  const copyId = alice.copy("speakers/!2/contact", "controls/input/value");
  alice.pushBack("controls/addSpeakerFromInput/steps", {
    $tag: "replay-step",
    eventId: insertId,
  });
  alice.pushBack("controls/addSpeakerFromInput/steps", {
    $tag: "replay-step",
    eventId: copyId,
  });
  alice.popBack("speakers");

  sync(alice, bob);

  // Alice transforms the list into a table with split columns
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

  // Concurrently, Bob adds a speaker using the button
  bob.set("controls/input/value", "Margaret Hamilton, margaret@example.com");
  bob.repeatEditsFrom("controls/addSpeakerFromInput/steps");

  sync(alice, bob);
  const merged = alice.toPlain() as TableDocument;
  assertEquals(
    merged.speakers.$items.map((row) => ({
      tag: row.$tag,
      contact: row.$items[0].contact,
    })),
    [
      { tag: "tr", contact: "Ada Lovelace, ada@example.com" },
      { tag: "tr", contact: "Grace Hopper, grace@example.com" },
      { tag: "tr", contact: "Margaret Hamilton, margaret@example.com" },
    ],
  );

  const expected: TableDocument = {
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
            { $tag: "replay-step", eventId: insertId },
            { $tag: "replay-step", eventId: copyId },
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
            {
              $tag: "td",
              contact: "Margaret Hamilton, margaret@example.com",
            },
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
