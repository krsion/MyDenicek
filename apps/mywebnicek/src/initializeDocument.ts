/**
 * Default initial document for the web app.
 *
 * A plain tagged tree using HTML tags for rendering.
 * Passed to `useDenicek({ initialDocument })`.
 */

import type { PlainNode } from "@mydenicek/core";

/** Value node shorthand: a record with `$kind: "value"`. */
function val(tag: string, value: PlainNode): PlainNode {
  return { $tag: tag, $kind: "value", value };
}

/** The starter document tree shown to new users. */
export const INITIAL_DOCUMENT: PlainNode = {
  $tag: "section",
  header: {
    $tag: "header",
    title: { $tag: "h1", text: "MyWebnicek" },
    subtitle: {
      $tag: "p",
      text:
        "A local-first collaborative document-oriented end-user programming editor",
    },
  },
  counter: {
    $tag: "article",
    heading: { $tag: "h2", text: "Counter" },
    value: { $tag: "p", count: 0 },
  },
  todoList: {
    $tag: "article",
    heading: { $tag: "h2", text: "Todo List" },
    items: {
      $tag: "ul",
      item1: { $tag: "li", text: "Try editing this text" },
      item2: {
        $tag: "li",
        text: "Add new items with the command bar",
      },
      item3: {
        $tag: "li",
        text: "Delete items with: delete /path field",
      },
    },
  },
  conferences: {
    $tag: "article",
    heading: { $tag: "h2", text: "Conferences" },
    table: {
      $tag: "table",
      head: {
        $tag: "thead",
        headerRow: {
          $tag: "tr",
          name: val("th", "Name"),
          location: val("th", "Location"),
        },
      },
      body: {
        $tag: "tbody",
        ecoop: {
          $tag: "tr",
          name: val("td", "ECOOP 2025"),
          location: val("td", "Bergen"),
        },
      },
    },
  },
};
