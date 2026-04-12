import { assertEquals, Denicek, sync } from "./test-helpers.ts";

Deno.test("transforms selector after concurrent rename", () => {
  const doc = { $tag: "root", person: { $tag: "person", name: "Ada" } };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.rename("person", "name", "fullName");
  bob.set("person/name", "UPDATED");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    person: { $tag: "person", fullName: "UPDATED" },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("transforms selector after concurrent wrap-record", () => {
  const doc = {
    $tag: "root",
    person: { $tag: "person", name: "Ada" },
    focus: { $ref: "/person/name" },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.wrapRecord("person", "inner", "wrapper");
  bob.set("person/name", "UPDATED");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    person: { $tag: "wrapper", inner: { $tag: "person", name: "UPDATED" } },
    focus: { $ref: "/person/inner/name" },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("transforms selector after concurrent wrap-list", () => {
  const doc = {
    $tag: "root",
    person: { $tag: "person", name: "Ada" },
    focus: { $ref: "/person/name" },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.wrapList("person", "people");
  bob.set("person/name", "UPDATED");

  sync(alice, bob);

  const expected = {
    $tag: "root",
    person: { $tag: "people", $items: [{ $tag: "person", name: "UPDATED" }] },
    focus: { $ref: "/person/*/name" },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("updates absolute references with wildcard when wrapping wildcard targets in a list", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "task", name: "Ada" },
        { $tag: "task", name: "Grace" },
      ],
    },
    focus: { $ref: "/items/0/name" },
  });

  core.wrapList("items/*", "wrapped");

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "wrapped", $items: [{ $tag: "task", name: "Ada" }] },
        { $tag: "wrapped", $items: [{ $tag: "task", name: "Grace" }] },
      ],
    },
    focus: { $ref: "/items/0/*/name" },
  });
});

Deno.test("updates relative references with wildcard when wrapping wildcard targets in a list", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "task", name: "Ada" },
        { $tag: "task", name: "Grace" },
      ],
    },
    focus: { $ref: "../items/0/name" },
  });

  core.wrapList("items/*", "wrapped");

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [
        { $tag: "wrapped", $items: [{ $tag: "task", name: "Ada" }] },
        { $tag: "wrapped", $items: [{ $tag: "task", name: "Grace" }] },
      ],
    },
    focus: { $ref: "../items/0/*/name" },
  });
});

Deno.test("adds parent segment when wrapping a relative reference node in a record", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [{ $tag: "task", name: "Ada" }],
    },
    focus: { $ref: "../items/0/name" },
  });

  core.wrapRecord("focus", "inner", "wrapper");

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [{ $tag: "task", name: "Ada" }],
    },
    focus: {
      $tag: "wrapper",
      inner: { $ref: "../../items/0/name" },
    },
  });
});

Deno.test("adds parent segment when wrapping a relative reference node in a list", () => {
  const core = new Denicek("alice", {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [{ $tag: "task", name: "Ada" }],
    },
    focus: { $ref: "../items/0/name" },
  });

  core.wrapList("focus", "wrapper");

  assertEquals(core.toPlain(), {
    $tag: "root",
    items: {
      $tag: "items",
      $items: [{ $tag: "task", name: "Ada" }],
    },
    focus: {
      $tag: "wrapper",
      $items: [{ $ref: "../../items/0/name" }],
    },
  });
});

Deno.test("wildcard edit affects concurrently inserted item", () => {
  const doc = {
    $tag: "root",
    items: { $tag: "ul", $items: [{ $tag: "task", status: "todo" }] },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.set("items/*/status", "done");
  bob.pushBack("items", { $tag: "task", status: "todo" });

  sync(alice, bob);

  const expected = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "task", status: "done" },
        { $tag: "task", status: "done" },
      ],
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("concurrent refactor rewrites a replayed inserted row payload", () => {
  const doc = {
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
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

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

  sync(alice, bob);

  const expected = {
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
            { $tag: "replay-step", eventId: "alice:0" },
            { $tag: "replay-step", eventId: "alice:1" },
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
});

Deno.test("concurrent refactor rewrites a replayed appended row payload", () => {
  const doc = {
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
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

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

  bob.set("controls/input/value", "Margaret Hamilton, margaret@example.com");
  bob.repeatEditsFrom("controls/addSpeakerFromInput/steps");

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

  sync(alice, bob);

  const expected = {
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
            { $tag: "replay-step", eventId: "alice:0" },
            { $tag: "replay-step", eventId: "alice:1" },
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

Deno.test("wrapRecord with wildcard affects concurrently inserted item", () => {
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "li", contact: "Ada, ada@example.com" },
      ],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  // Alice wraps every item's contact in a split-first formula
  alice.wrapRecord("items/*/contact", "source", "split-first");

  // Bob concurrently inserts a new item
  bob.pushBack("items", { $tag: "li", contact: "Bob, bob@example.com" });

  sync(alice, bob);

  const expected = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        {
          $tag: "li",
          contact: {
            $tag: "split-first",
            source: "Ada, ada@example.com",
          },
        },
        {
          $tag: "li",
          contact: {
            $tag: "split-first",
            source: "Bob, bob@example.com",
          },
        },
      ],
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});
