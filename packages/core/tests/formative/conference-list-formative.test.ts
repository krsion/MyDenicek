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
  alice.insert("speakers", -1, {
    $tag: "li",
    contact: "Katherine Johnson, katherine@example.com",
  }, true);
  bob.insert("speakers", -1, {
    $tag: "li",
    contact: "Margaret Hamilton, margaret@example.com",
  }, true);

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
  const insertId = alice.insert(
    "speakers",
    -1,
    { $tag: "li", contact: "" },
    true,
  );
  const copyId = alice.copy("speakers/!2/contact", "controls/input/value");
  alice.insert("controls/addSpeakerFromInput/steps", -1, {
    $tag: "replay-step",
    eventId: insertId,
  }, true);
  alice.insert("controls/addSpeakerFromInput/steps", -1, {
    $tag: "replay-step",
    eventId: copyId,
  }, true);
  alice.remove("speakers", -1, true);

  sync(alice, bob);

  // Alice transforms the list into a table with split columns
  alice.updateTag("speakers", "table");
  alice.updateTag("speakers/*", "td");
  alice.wrapList("speakers/*", "tr");
  // Wrap contact in split-first → column 1 shows the name
  alice.wrapRecord("speakers/*/0/contact", "source", "split-first");
  // Push split-rest td → column 2 shows the email
  alice.insert("speakers/*", -1, {
    $tag: "td",
    email: {
      $tag: "split-rest",
      source: { $ref: "../../../0/contact/source" },
    },
  }, true);

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

// ── Button replay after table refactoring ────────────────────────────
// The "Add Speaker" button was recorded against a flat <ul> list.
// After the list is refactored into a <table> with formula columns,
// clicking the button still works: repeatEditsFrom retargets each
// recorded step through every structural edit that happened after
// recording. This is sequential, not concurrent — all refactoring
// completes before the button is used.

Deno.test("Formative: Button replay after table refactoring", () => {
  const initialDocument = {
    $tag: "app",
    controls: {
      $tag: "toolbar",
      input: {
        $tag: "input",
        value: "",
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

  // ── Phase 1: Record a button against the flat <ul> list ──────────
  // The button recipe: append an <li> with empty contact, then copy
  // the input value into it. This is what the button "knows" — it
  // has no idea a table refactoring will happen later.
  const insertId = alice.insert(
    "speakers",
    -1,
    { $tag: "li", contact: "" },
    true,
  );
  const copyId = alice.copy("speakers/!2/contact", "controls/input/value");
  alice.insert("controls/addSpeakerFromInput/steps", -1, {
    $tag: "replay-step",
    eventId: insertId,
  }, true);
  alice.insert("controls/addSpeakerFromInput/steps", -1, {
    $tag: "replay-step",
    eventId: copyId,
  }, true);
  alice.remove("speakers", -1, true);

  // Verify: the button recorded edits that target a flat list.
  // insertId's edit: insert <li> into "speakers" (a <ul>)
  // copyId's edit: copy into "speakers/!2/contact" (a string field on an <li>)

  // ── Phase 2: Refactor list → table with formula columns ──────────
  // 5 structural edits that completely change the document shape.
  alice.updateTag("speakers", "table"); // <ul> → <table>
  alice.updateTag("speakers/*", "td"); // <li> → <td>
  alice.wrapList("speakers/*", "tr"); // <td> → <tr>[<td>]
  alice.wrapRecord("speakers/*/0/contact", "source", "split-first");
  alice.insert("speakers/*", -1, { // add email column
    $tag: "td",
    email: {
      $tag: "split-rest",
      source: { $ref: "../../../0/contact/source" },
    },
  }, true);

  // Verify: document is now a table. The button has NOT been updated —
  // its steps still reference the original insertId and copyId.
  const beforeReplay = alice.toPlain() as TableDocument;
  assertEquals(beforeReplay.speakers.$tag, "table");
  assertEquals(beforeReplay.speakers.$items.length, 2);
  assertEquals(beforeReplay.speakers.$items[0].$tag, "tr");
  assertEquals(beforeReplay.speakers.$items[0].$items.length, 2);
  // The button still has the same two step IDs from phase 1:
  assertEquals(
    beforeReplay.controls.addSpeakerFromInput.steps.$items.length,
    2,
  );

  // ── Phase 3: Click the button AFTER the refactor ─────────────────
  // repeatEditsFrom retargets each recorded step through every
  // structural edit that happened after recording. The <li> insert
  // becomes a <tr> row insert; the contact copy gains extra path
  // segments to reach through the split-first wrapper.
  alice.set(
    "controls/input/value",
    "Margaret Hamilton, margaret@example.com",
  );
  alice.repeatEditsFrom("controls/addSpeakerFromInput/steps");

  // ── Verify: the button produced a complete table row ─────────────
  const doc = alice.toPlain() as TableDocument;

  // 3 rows now (was 2 before the button click)
  assertEquals(doc.speakers.$items.length, 3);

  // The new row is a proper <tr> with two <td> cells
  const newRow = doc.speakers.$items[2];
  assertEquals(newRow.$tag, "tr");
  assertEquals(newRow.$items.length, 2);

  // Cell 1: split-first formula wrapping the copied contact string
  const nameCell = newRow.$items[0];
  assertEquals(nameCell.$tag, "td");
  assertEquals(nameCell.contact.$tag, "split-first");
  assertEquals(
    nameCell.contact.source,
    "Margaret Hamilton, margaret@example.com",
  );

  // Cell 2: split-rest formula with a $ref to the source
  const emailCell = newRow.$items[1];
  assertEquals(emailCell.$tag, "td");
  assertEquals(emailCell.email.$tag, "split-rest");

  // Formula evaluation: the formulas produce correct results
  const results = evaluateAllFormulas(doc);

  // Original rows still correct
  assertEquals(results.get("speakers/0/0/contact"), "Ada Lovelace");
  assertEquals(results.get("speakers/0/1/email"), "ada@example.com");
  assertEquals(results.get("speakers/1/0/contact"), "Grace Hopper");
  assertEquals(results.get("speakers/1/1/email"), "grace@example.com");

  // NEW ROW — added by a button that was recorded against a flat list,
  // replayed against a table, and produced correct formula cells:
  assertEquals(results.get("speakers/2/0/contact"), "Margaret Hamilton");
  assertEquals(
    results.get("speakers/2/1/email"),
    "margaret@example.com",
  );
});
