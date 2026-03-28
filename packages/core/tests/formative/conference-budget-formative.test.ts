import { assertEquals } from "@std/assert";
import { Denicek } from "../../mod.ts";

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

  const syncPeers = (): void => {
    const aliceFrontiers = alice.frontiers;
    const bobFrontiers = bob.frontiers;
    for (const event of alice.eventsSince(bobFrontiers)) bob.applyRemote(event);
    for (const event of bob.eventsSince(aliceFrontiers)) {
      alice.applyRemote(event);
    }
  };
  const resolveValueAtPath = (root: unknown, path: string): unknown => {
    const segments = path.replace(/^\//, "").split("/").filter((segment) =>
      segment.length > 0
    );
    const walk = (current: unknown, index: number): unknown => {
      if (index >= segments.length) return current;
      const segment = segments[index]!;
      if (typeof current !== "object" || current === null) return undefined;
      if (
        "$items" in current &&
        Array.isArray((current as { $items?: unknown[] }).$items)
      ) {
        const items = (current as { $items: unknown[] }).$items;
        if (segment === "*") {
          return items.map((item) => walk(item, index + 1));
        }
        return walk(items[Number(segment)], index + 1);
      }
      return walk((current as Record<string, unknown>)[segment], index + 1);
    };
    return walk(root, 0);
  };
  const resolveReferencedValue = (root: unknown, value: unknown): unknown => {
    if (
      typeof value === "object" && value !== null && "$ref" in value &&
      typeof value.$ref === "string"
    ) {
      return resolveReferencedValue(root, resolveValueAtPath(root, value.$ref));
    }
    if (Array.isArray(value)) {
      return value.reduce(
        (sum, item) => sum + Number(resolveReferencedValue(root, item)),
        0,
      );
    }
    if (Array.isArray(value)) {
      return value.reduce(
        (sum, item) => sum + Number(resolveReferencedValue(root, item)),
        0,
      );
    }
    return value;
  };

  alice.set("speakers/1/fee", 250);
  bob.updateTag("speakers", "table");
  bob.updateTag("speakers/*", "td");
  bob.wrapList("speakers/*", "tr");

  syncPeers();

  {
    const plainDocument = alice.toPlain() as {
      summary: { dependsOn: { $items: Array<{ $ref: string }> } };
    };
    const nextTotal = plainDocument.summary.dependsOn.$items.reduce(
      (sum, dependencyPath) => {
        const value = resolveReferencedValue(plainDocument, dependencyPath);
        return sum + Number(value);
      },
      0,
    );
    alice.set("summary/total", nextTotal);
  }
  {
    const plainDocument = bob.toPlain() as {
      summary: { dependsOn: { $items: Array<{ $ref: string }> } };
    };
    const nextTotal = plainDocument.summary.dependsOn.$items.reduce(
      (sum, dependencyPath) => {
        const value = resolveReferencedValue(plainDocument, dependencyPath);
        return sum + Number(value);
      },
      0,
    );
    bob.set("summary/total", nextTotal);
  }

  const expected = {
    $tag: "app",
    speakers: {
      $tag: "table",
      $items: [
        {
          $tag: "tr",
          $items: [{ $tag: "td", name: "Ada Lovelace", fee: 100 }],
        },
        {
          $tag: "tr",
          $items: [{ $tag: "td", name: "Grace Hopper", fee: 250 }],
        },
      ],
    },
    summary: {
      $tag: "budget",
      total: 350,
      dependsOn: {
        $tag: "refs",
        $items: [
          { $ref: "/speakers/0/*/fee" },
          { $ref: "/speakers/1/*/fee" },
        ],
      },
    },
  };
  assertEquals(alice.toPlain(), expected);
  assertEquals(bob.toPlain(), expected);
});
