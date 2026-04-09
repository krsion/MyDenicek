/**
 * Default initial document for the web app.
 *
 * A plain tagged tree containing all formative examples.
 * Passed to `useDenicek({ initialDocument })`.
 *
 * Interactive parts (buttons, replay scripts) are built by
 * {@link initializeActions} after construction since they need event IDs.
 */

import type { Denicek, PlainNode } from "@mydenicek/core";

/** The starter document tree. */
export const INITIAL_DOCUMENT: PlainNode = {
  $tag: "section",
  header: {
    $tag: "header",
    title: { $tag: "h1", text: "mydenicek" },
    subtitle: {
      $tag: "p",
      text: "A local-first collaborative document editor — formative examples",
    },
  },

  // ── 1. Counter (formula + button) ──────────────────────────────────
  counter: {
    $tag: "article",
    heading: { $tag: "h2", text: "Counter" },
    value: 0,
    btn: {
      $tag: "button",
      label: "Increment",
      steps: { $tag: "event-steps", $items: [] },
    },
  },

  // ── 2. Todo List (composer + list) ─────────────────────────────────
  todoList: {
    $tag: "article",
    heading: { $tag: "h2", text: "Todo List" },
    composer: {
      $tag: "composer",
      input: { $tag: "input", value: "New task" },
      addAction: {
        $tag: "button",
        label: "Add",
        steps: { $tag: "event-steps", $items: [] },
      },
    },
    items: {
      $tag: "ul",
      $items: [
        { $tag: "li", text: "Write paper" },
        { $tag: "li", text: "Ship prototype" },
      ],
    },
  },

  // ── 3. Conference List (table + composer) ───────────────────────────
  conferences: {
    $tag: "article",
    heading: { $tag: "h2", text: "Conferences" },
    composer: {
      $tag: "composer",
      input: { $tag: "input", value: "Jan Novák, jan@novak.cz" },
      addAction: {
        $tag: "button",
        label: "Add Speaker",
        steps: { $tag: "event-steps", $items: [] },
      },
    },
    speakers: {
      $tag: "table",
      $items: [
        {
          $tag: "tr",
          name: { $tag: "td", text: "Tomáš Petříček" },
          email: { $tag: "td", text: "tomas@tomasp.net" },
        },
        {
          $tag: "tr",
          name: { $tag: "td", text: "Ada Lovelace" },
          email: { $tag: "td", text: "ada@example.com" },
        },
      ],
    },
  },
};

/**
 * Build interactive parts that require event IDs (buttons, replay scripts).
 * Call once after constructing the Denicek instance.
 */
export function initializeActions(dk: Denicek): void {
  // ── Counter: record the "increment via wrap" recipe ──────────────
  const wrapId = dk.wrapRecord("counter/value", "value", "x-formula-plus");
  const renameId = dk.rename("counter/value", "value", "left");
  const addRightId = dk.add("counter/value", "right", 1);

  dk.pushBack("counter/btn/steps", { $tag: "step", eventId: wrapId });
  dk.pushBack("counter/btn/steps", { $tag: "step", eventId: renameId });
  dk.pushBack("counter/btn/steps", { $tag: "step", eventId: addRightId });

  // ── Todo: record the "add item from input" recipe ────────────────
  const pushId = dk.pushFront("todoList/items", {
    $tag: "li",
    text: "",
  });
  const copyId = dk.copy(
    "todoList/items/!0/text",
    "todoList/composer/input/value",
  );

  dk.pushBack("todoList/composer/addAction/steps", {
    $tag: "step",
    eventId: pushId,
  });
  dk.pushBack("todoList/composer/addAction/steps", {
    $tag: "step",
    eventId: copyId,
  });

  // ── Conferences: record the "add speaker from input" recipe ───────
  const addSpeakerId = dk.pushFront("conferences/speakers", {
    $tag: "tr",
    name: { $tag: "td", text: "" },
    email: { $tag: "td", text: "" },
  });
  const copySpeakerNameId = dk.copy(
    "conferences/speakers/!0/name/text",
    "conferences/composer/input/value",
  );
  const copySpeakerEmailId = dk.copy(
    "conferences/speakers/!0/email/text",
    "conferences/composer/input/value",
  );
  const splitNameId = dk.applyPrimitiveEdit(
    "conferences/speakers/!0/name/text",
    "splitFirst",
    ", ",
  );
  const splitEmailId = dk.applyPrimitiveEdit(
    "conferences/speakers/!0/email/text",
    "splitRest",
    ", ",
  );

  dk.pushBack("conferences/composer/addAction/steps", {
    $tag: "step",
    eventId: addSpeakerId,
  });
  dk.pushBack("conferences/composer/addAction/steps", {
    $tag: "step",
    eventId: copySpeakerNameId,
  });
  dk.pushBack("conferences/composer/addAction/steps", {
    $tag: "step",
    eventId: copySpeakerEmailId,
  });
  dk.pushBack("conferences/composer/addAction/steps", {
    $tag: "step",
    eventId: splitNameId,
  });
  dk.pushBack("conferences/composer/addAction/steps", {
    $tag: "step",
    eventId: splitEmailId,
  });
}
