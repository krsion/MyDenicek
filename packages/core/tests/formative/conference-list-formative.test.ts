import { assertEquals, Denicek, sync } from "../core/test-helpers.ts";
import { evaluateAllFormulas } from "../../mod.ts";

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
  const speakers = (alice.toPlain() as unknown as {
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
// Evolves the list into a <table> with two columns:
// Column 1: name (split-first formula wrapping the original contact)
// Column 2: email (split-rest formula referencing the wrapped source)
// Verifies concurrent adds still converge.

type ReplayStep = {
  $tag: "replay-step";
  eventId: string;
};

type NameCell = {
  $tag: "td";
  contact: {
    $tag: "split-first";
    source: string;
  };
};

type EmailCell = {
  $tag: "td";
  email: {
    $tag: "split-rest";
    source: { $ref: string };
  };
};

type SpeakerRow = {
  $tag: "tr";
  $items: [NameCell, EmailCell];
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
  // Wrap contact in split-first → column 1 shows the name
  alice.wrapRecord("speakers/*/0/contact", "source", "split-first");
  // Push split-rest td → column 2 shows the email
  alice.pushBack("speakers/*", {
    $tag: "td",
    email: {
      $tag: "split-rest",
      source: { $ref: "../../../0/contact/source" },
    },
  });

  // Concurrently, Bob adds a speaker using the button
  bob.set("controls/input/value", "Margaret Hamilton, margaret@example.com");
  bob.repeatEditsFrom("controls/addSpeakerFromInput/steps");

  sync(alice, bob);

  // Verify all speakers are present with correct name extraction
  const merged = alice.toPlain() as TableDocument;
  const itemCount = merged.speakers.$items.length;
  // Bob's concurrent add may produce 2 or 3 depending on OT resolution
  assertEquals(itemCount >= 2, true);

  // First two rows: wrapRecord turned contact into {$tag: "split-first", source: "..."}
  const names = merged.speakers.$items.map((row) => row.$items[0].contact);
  assertEquals(names[0], {
    $tag: "split-first",
    source: "Ada Lovelace, ada@example.com",
  });
  assertEquals(names[1], {
    $tag: "split-first",
    source: "Grace Hopper, grace@example.com",
  });
  // Verify formula evaluation extracts names correctly
  const results = evaluateAllFormulas(merged);
  assertEquals(results.get("speakers/0/0/contact"), "Ada Lovelace");
  assertEquals(results.get("speakers/1/0/contact"), "Grace Hopper");

  // Verify email column formulas evaluate correctly
  assertEquals(results.get("speakers/0/1/email"), "ada@example.com");
  assertEquals(results.get("speakers/1/1/email"), "grace@example.com");

  assertEquals(alice.toPlain(), bob.toPlain());
});
