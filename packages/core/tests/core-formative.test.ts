import { assertEquals } from "@std/assert";
import { Denicek } from "../mod.ts";

function syncPeers(leftPeer: Denicek, rightPeer: Denicek): void {
  const leftFrontiers = leftPeer.frontiers;
  const rightFrontiers = rightPeer.frontiers;
  for (const event of leftPeer.eventsSince(rightFrontiers)) rightPeer.applyRemote(event);
  for (const event of rightPeer.eventsSince(leftFrontiers)) leftPeer.applyRemote(event);
}

function replayRecordedCounterButton(peer: Denicek, delta: number, repetitions: number): void {
  for (let index = 0; index < repetitions; index++) {
    peer.pushBack("formula", delta);
  }
}

function recomputeCounterValue(peer: Denicek): void {
  const plainDocument = peer.toPlain() as {
    formula: { $items: number[] };
  };
  const nextCount = plainDocument.formula.$items.reduce((sum, delta) => sum + delta, 0);
  peer.set("count", nextCount);
}

function replayRecordedTodoAddition(peer: Denicek, text: string): void {
  peer.pushBack("items", { $tag: "task", text, completed: false });
}

function rebuildTodoListWithoutCompleted(peer: Denicek): void {
  const plainDocument = peer.toPlain() as {
    items: { $items: Array<{ $tag: string; text: string; completed: boolean }> };
  };
  const remainingItems = plainDocument.items.$items.filter((item) => !item.completed);

  peer.add("", "__scratchItems", { $tag: "ul", $items: [] });
  for (const item of remainingItems) {
    peer.pushBack("__scratchItems", item);
  }
  peer.copy("items", "__scratchItems");
  peer.delete("", "__scratchItems");
}

function refactorConferenceListToTable(peer: Denicek): void {
  peer.updateTag("speakers", "table");
  peer.updateTag("speakers/*", "td");
  peer.wrapList("speakers/*", "tr");
  peer.rename("speakers/*/*", "contact", "name");
  peer.add("speakers/*/*", "email", "");
}

function splitConferenceContacts(peer: Denicek): void {
  const plainDocument = peer.toPlain() as {
    speakers: {
      $items: Array<{ $items: Array<{ name: string }> }>;
    };
  };

  for (const [rowIndex, row] of plainDocument.speakers.$items.entries()) {
    const [name, email] = row.$items[0]!.name.split(",").map((part) => part.trim());
    peer.set(`speakers/${rowIndex}/0/name`, name);
    peer.set(`speakers/${rowIndex}/0/email`, email);
  }
}

function refactorSpeakerBudgetTable(peer: Denicek): void {
  peer.updateTag("speakers", "table");
  peer.updateTag("speakers/*", "td");
  peer.wrapList("speakers/*", "tr");
}

function resolveValueAtPath(root: unknown, path: string): unknown {
  const segments = path.replace(/^\//, "").split("/").filter((segment) => segment.length > 0);
  let current: unknown = root;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return undefined;
    if ("$items" in current && Array.isArray((current as { $items?: unknown[] }).$items)) {
      current = (current as { $items: unknown[] }).$items[Number(segment)];
      continue;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function resolveReferencedValue(root: unknown, value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("/")) {
    return resolveReferencedValue(root, resolveValueAtPath(root, value));
  }
  return value;
}

function recomputeConferenceBudget(peer: Denicek): void {
  const plainDocument = peer.toPlain() as {
    summary: { dependsOn: { $items: string[] } };
  };
  const nextTotal = plainDocument.summary.dependsOn.$items.reduce((sum, dependencyPath) => {
    const value = resolveReferencedValue(plainDocument, dependencyPath);
    return sum + Number(value);
  }, 0);
  peer.set("summary/total", nextTotal);
}

function normalizeTwoWordMessage(message: string): string {
  return message
    .toLowerCase()
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => `${word[0]!.toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function applyRecordedHelloWorldNormalization(peer: Denicek): void {
  const plainDocument = peer.toPlain() as { messages: { $items: string[] } };
  peer.set("messages/0", normalizeTwoWordMessage(plainDocument.messages.$items[0]!));

  const replayDocument = peer.toPlain() as { messages: { $items: string[] } };
  for (const [messageIndex, message] of replayDocument.messages.$items.entries()) {
    if (messageIndex === 0) continue;
    peer.set(`messages/${messageIndex}`, normalizeTwoWordMessage(message));
  }
}

function applyDirectHelloWorldNormalization(peer: Denicek): void {
  const plainDocument = peer.toPlain() as { messages: { $items: string[] } };
  for (const [messageIndex, message] of plainDocument.messages.$items.entries()) {
    peer.set(`messages/${messageIndex}`, normalizeTwoWordMessage(message));
  }
}

function copyTrafficStatistic(peer: Denicek): void {
  peer.copy("stats/secondary", "stats/primary");
  peer.delete("stats/secondary", "source");
  peer.add("stats/secondary", "source", { $ref: "/dataSources/south" });
  peer.delete("stats/secondary", "minInjuries");
  peer.add("stats/secondary", "minInjuries", { $ref: "/stats/primary/minInjuries" });
}

function recomputeTrafficStatistic(peer: Denicek, statisticPath: string): void {
  const plainDocument = peer.toPlain();
  const sourceRows = resolveReferencedValue(
    plainDocument,
    resolveValueAtPath(plainDocument, `${statisticPath}/source`),
  ) as {
    $items: Array<{ injuries: number }>;
  };
  const minimumInjuries = Number(
    resolveReferencedValue(plainDocument, resolveValueAtPath(plainDocument, `${statisticPath}/minInjuries`)),
  );
  const nextResult = sourceRows.$items.filter((row) => row.injuries >= minimumInjuries).length;
  peer.set(`${statisticPath}/result`, nextResult);
}

Deno.test("Formative: Counter App", () => {
  const peer = new Denicek("alice", {
    $tag: "app",
    formula: { $tag: "ops", $items: [] as number[] },
    count: 0,
  });

  replayRecordedCounterButton(peer, 1, 2);
  replayRecordedCounterButton(peer, -1, 1);
  recomputeCounterValue(peer);

  assertEquals(peer.toPlain(), {
    $tag: "app",
    formula: { $tag: "ops", $items: [1, 1, -1] },
    count: 1,
  });
  assertEquals(peer.inspectEvents().map(({ editKind, target }) => ({ editKind, target })), [
    { editKind: "ListPushBack", target: "formula" },
    { editKind: "ListPushBack", target: "formula" },
    { editKind: "ListPushBack", target: "formula" },
    { editKind: "SetValue", target: "count" },
  ]);
});

Deno.test("Formative: Todo App", () => {
  const initialDocument = {
    $tag: "app",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "task", text: "Ship prototype", completed: true },
        { $tag: "task", text: "Write paper", completed: false },
      ],
    },
  };
  const alice = new Denicek("alice", initialDocument);
  const bob = new Denicek("bob", initialDocument);

  replayRecordedTodoAddition(alice, "Review feedback");
  bob.set("items/1/completed", true);

  syncPeers(alice, bob);

  replayRecordedTodoAddition(alice, "Book venue");
  rebuildTodoListWithoutCompleted(alice);
  syncPeers(alice, bob);
  rebuildTodoListWithoutCompleted(bob);
  syncPeers(alice, bob);

  const expected = {
    $tag: "app",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "task", text: "Review feedback", completed: false },
        { $tag: "task", text: "Book venue", completed: false },
      ],
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("Formative: Conference List", () => {
  const initialDocument = {
    $tag: "div",
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

  alice.pushBack("speakers", { $tag: "li", contact: "Barbara Liskov, barbara@example.com" });
  refactorConferenceListToTable(bob);

  syncPeers(alice, bob);

  splitConferenceContacts(alice);
  splitConferenceContacts(bob);
  syncPeers(alice, bob);

  const expected = {
    $tag: "div",
    speakers: {
      $tag: "table",
      $items: [
        { $tag: "tr", $items: [{ $tag: "td", name: "Ada Lovelace", email: "ada@example.com" }] },
        { $tag: "tr", $items: [{ $tag: "td", name: "Grace Hopper", email: "grace@example.com" }] },
        { $tag: "tr", $items: [{ $tag: "td", name: "Barbara Liskov", email: "barbara@example.com" }] },
      ],
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

Deno.test("Formative: Conference Budget", () => {
  const initialDocument = {
    $tag: "app",
    speakers: {
      $tag: "ul",
      $items: [
        { $tag: "speaker", name: "Ada Lovelace", fee: 100 },
        { $tag: "speaker", name: "Grace Hopper", fee: 200 },
      ],
    },
    summary: {
      $tag: "budget",
      total: 0,
      dependsOn: {
        $tag: "refs",
        $items: [
          { $ref: "/speakers/0/fee" },
          { $ref: "/speakers/1/fee" },
        ],
      },
    },
  };
  const alice = new Denicek("alice", initialDocument);
  const bob = new Denicek("bob", initialDocument);

  alice.set("speakers/1/fee", 250);
  refactorSpeakerBudgetTable(bob);

  syncPeers(alice, bob);

  recomputeConferenceBudget(alice);
  recomputeConferenceBudget(bob);

  const expected = {
    $tag: "app",
    speakers: {
      $tag: "table",
      $items: [
        { $tag: "tr", $items: [{ $tag: "td", name: "Ada Lovelace", fee: 100 }] },
        { $tag: "tr", $items: [{ $tag: "td", name: "Grace Hopper", fee: 250 }] },
      ],
    },
    summary: {
      $tag: "budget",
      total: 350,
      dependsOn: {
        $tag: "refs",
        $items: [
          "/speakers/0/0/fee",
          "/speakers/1/0/fee",
        ],
      },
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});

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

  applyRecordedHelloWorldNormalization(recordedPeer);
  applyDirectHelloWorldNormalization(directPeer);

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

Deno.test("Formative: Traffic Accidents", () => {
  const peer = new Denicek("alice", {
    $tag: "app",
    dataSources: {
      $tag: "sources",
      north: {
        $tag: "rows",
        $items: [
          { $tag: "accident", injuries: 1 },
          { $tag: "accident", injuries: 3 },
          { $tag: "accident", injuries: 4 },
        ],
      },
      south: {
        $tag: "rows",
        $items: [
          { $tag: "accident", injuries: 2 },
          { $tag: "accident", injuries: 5 },
        ],
      },
    },
    stats: {
      $tag: "stats",
      primary: {
        $tag: "formula",
        source: { $ref: "/dataSources/north" },
        minInjuries: 3,
        result: 0,
      },
      secondary: {
        $tag: "formula",
        source: { $ref: "/dataSources/south" },
        minInjuries: 0,
        result: 0,
      },
    },
  });

  copyTrafficStatistic(peer);
  recomputeTrafficStatistic(peer, "stats/primary");
  recomputeTrafficStatistic(peer, "stats/secondary");

  assertEquals(peer.toPlain(), {
    $tag: "app",
    dataSources: {
      $tag: "sources",
      north: {
        $tag: "rows",
        $items: [
          { $tag: "accident", injuries: 1 },
          { $tag: "accident", injuries: 3 },
          { $tag: "accident", injuries: 4 },
        ],
      },
      south: {
        $tag: "rows",
        $items: [
          { $tag: "accident", injuries: 2 },
          { $tag: "accident", injuries: 5 },
        ],
      },
    },
    stats: {
      $tag: "stats",
      primary: {
        $tag: "formula",
        source: "/dataSources/north",
        minInjuries: 3,
        result: 2,
      },
      secondary: {
        $tag: "formula",
        source: "/dataSources/south",
        minInjuries: "/stats/primary/minInjuries",
        result: 1,
      },
    },
  });

  peer.set("stats/primary/minInjuries", 2);
  recomputeTrafficStatistic(peer, "stats/primary");
  recomputeTrafficStatistic(peer, "stats/secondary");

  assertEquals(peer.toPlain(), {
    $tag: "app",
    dataSources: {
      $tag: "sources",
      north: {
        $tag: "rows",
        $items: [
          { $tag: "accident", injuries: 1 },
          { $tag: "accident", injuries: 3 },
          { $tag: "accident", injuries: 4 },
        ],
      },
      south: {
        $tag: "rows",
        $items: [
          { $tag: "accident", injuries: 2 },
          { $tag: "accident", injuries: 5 },
        ],
      },
    },
    stats: {
      $tag: "stats",
      primary: {
        $tag: "formula",
        source: "/dataSources/north",
        minInjuries: 2,
        result: 2,
      },
      secondary: {
        $tag: "formula",
        source: "/dataSources/south",
        minInjuries: "/stats/primary/minInjuries",
        result: 2,
      },
    },
  });
});
