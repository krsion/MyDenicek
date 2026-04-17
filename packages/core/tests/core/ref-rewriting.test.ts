import { assertEquals } from "@std/assert";
import { Denicek } from "../../mod.ts";

function sync(a: Denicek, b: Denicek): void {
  const aFrontiers = a.frontiers;
  const bFrontiers = b.frontiers;
  for (const event of a.eventsSince(bFrontiers)) b.applyRemote(event);
  for (const event of b.eventsSince(aFrontiers)) a.applyRemote(event);
}

function syncMesh(peers: Denicek[]): void {
  const frontiers = peers.map((peer) => peer.frontiers);
  const diffs = peers.map((peer, sourceIndex) => {
    const events = [];
    for (let targetIndex = 0; targetIndex < peers.length; targetIndex++) {
      if (sourceIndex !== targetIndex) {
        events.push(...peer.eventsSince(frontiers[targetIndex]!));
      }
    }
    return events;
  });
  for (let targetIndex = 0; targetIndex < peers.length; targetIndex++) {
    for (let sourceIndex = 0; sourceIndex < peers.length; sourceIndex++) {
      if (targetIndex !== sourceIndex) {
        for (const event of diffs[sourceIndex]!) {
          peers[targetIndex]!.applyRemote(event);
        }
      }
    }
  }
}

// ── Rename + concurrent insert with $ref ────────────────────────────

Deno.test("rename + concurrent RecordAdd with $ref: ref is rewritten", () => {
  // $ref "../../input/value" from "form/formula/source" → "form/input/value".
  // After rename "input" → "textInput", becomes "../../textInput/value".
  const doc = {
    $tag: "root",
    form: {
      $tag: "form",
      input: { $tag: "field", value: "hello" },
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.rename("form", "input", "textInput");
  bob.add("form", "formula", {
    $tag: "x-formula",
    source: { $ref: "../../input/value" },
  });

  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());

  const plain = alice.toPlain() as Record<string, unknown>;
  const form = plain.form as Record<string, unknown>;
  const formula = form.formula as Record<string, unknown>;
  const source = formula.source as { $ref: string };
  assertEquals(source.$ref, "../../textInput/value");
});

Deno.test("rename + concurrent ListPushBack with $ref: ref is rewritten", () => {
  // $ref "../../../input" from "data/items/0/target" → "data/input".
  const doc = {
    $tag: "root",
    data: {
      $tag: "data",
      input: "hello",
      items: { $tag: "list", $items: [] as const },
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.rename("data", "input", "source");
  bob.pushBack("data/items", {
    $tag: "x-formula",
    target: { $ref: "../../../input" },
  });

  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());

  const plain = alice.toPlain() as Record<string, unknown>;
  const data = plain.data as Record<string, unknown>;
  const items = data.items as { $tag: string; $items: unknown[] };
  const pushed = items.$items[0] as Record<string, unknown>;
  const target = pushed.target as { $ref: string };
  assertEquals(target.$ref, "../../../source");
});

Deno.test("rename + concurrent ListPushFront with $ref: ref is rewritten", () => {
  const doc = {
    $tag: "root",
    data: {
      $tag: "data",
      input: "hello",
      items: { $tag: "list", $items: ["existing"] },
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.rename("data", "input", "source");
  bob.pushFront("data/items", {
    $tag: "x-formula",
    target: { $ref: "../../../input" },
  });

  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());

  const plain = alice.toPlain() as Record<string, unknown>;
  const data = plain.data as Record<string, unknown>;
  const items = data.items as { $tag: string; $items: unknown[] };
  const pushed = items.$items[0] as Record<string, unknown>;
  const target = pushed.target as { $ref: string };
  assertEquals(target.$ref, "../../../source");
});

// ── WrapRecord + concurrent insert with $ref ────────────────────────

Deno.test("wrapRecord + concurrent RecordAdd with $ref: ref is rewritten", () => {
  // $ref "../../input" from "data/formula/source" → "data/input".
  // After wrapRecord, "data/input" → "data/input/inner".
  const doc = {
    $tag: "root",
    data: {
      $tag: "data",
      input: "hello",
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.wrapRecord("data/input", "inner", "wrapper");
  bob.add("data", "formula", {
    $tag: "x-formula",
    source: { $ref: "../../input" },
  });

  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());

  const plain = alice.toPlain() as Record<string, unknown>;
  const data = plain.data as Record<string, unknown>;
  const formula = data.formula as Record<string, unknown>;
  const source = formula.source as { $ref: string };
  assertEquals(source.$ref, "../../input/inner");
});

Deno.test("wrapRecord + concurrent pushBack with $ref: ref is rewritten", () => {
  // $ref "../../0/contact/name" from "items/1/lookup" → "items/0/contact/name".
  const doc = {
    $tag: "root",
    items: {
      $tag: "ul",
      $items: [
        { $tag: "row", contact: { $tag: "info", name: "Alice" } },
      ],
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.wrapRecord("items/*/contact", "inner", "wrapper");
  bob.pushBack("items", {
    $tag: "row",
    lookup: { $ref: "../../0/contact/name" },
    contact: { $tag: "info", name: "Bob" },
  });

  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());

  const plain = alice.toPlain() as Record<string, unknown>;
  const items = plain.items as { $tag: string; $items: unknown[] };
  const pushed = items.$items[1] as Record<string, unknown>;
  const lookup = pushed.lookup as { $ref: string };
  assertEquals(lookup.$ref, "../../0/contact/inner/name");
});

// ── WrapList + concurrent insert with $ref ──────────────────────────

Deno.test("wrapList + concurrent RecordAdd with $ref: ref is rewritten", () => {
  const doc = {
    $tag: "root",
    data: {
      $tag: "data",
      input: "hello",
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.wrapList("data/input", "list-wrapper");
  bob.add("data", "formula", {
    $tag: "x-formula",
    source: { $ref: "../../input" },
  });

  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());

  const plain = alice.toPlain() as Record<string, unknown>;
  const data = plain.data as Record<string, unknown>;
  const formula = data.formula as Record<string, unknown>;
  const source = formula.source as { $ref: string };
  assertEquals(source.$ref, "../../input/*");
});

// ── Convergence: three peers ────────────────────────────────────────

Deno.test("convergence: rename + two concurrent inserts with $ref", () => {
  const doc = {
    $tag: "root",
    data: {
      $tag: "data",
      input: "hello",
      items: { $tag: "list", $items: [] as const },
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  const carol = new Denicek("carol", doc);

  alice.rename("data", "input", "source");
  bob.add("data", "formula", {
    $tag: "x-formula",
    target: { $ref: "../../input" },
  });
  carol.pushBack("data/items", {
    $tag: "x-formula",
    target: { $ref: "../../../input" },
  });

  syncMesh([alice, bob, carol]);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(bob.toPlain(), carol.toPlain());

  const plain = alice.toPlain() as Record<string, unknown>;
  const data = plain.data as Record<string, unknown>;
  const formula = data.formula as Record<string, unknown>;
  assertEquals((formula.target as { $ref: string }).$ref, "../../source");

  const items = data.items as { $tag: string; $items: unknown[] };
  const pushed = items.$items[0] as Record<string, unknown>;
  assertEquals(
    (pushed.target as { $ref: string }).$ref,
    "../../../source",
  );
});

Deno.test("convergence: wrapRecord + rename + concurrent insert with $ref", () => {
  const doc = {
    $tag: "root",
    data: {
      $tag: "data",
      input: "hello",
      items: { $tag: "list", $items: [] as const },
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  const carol = new Denicek("carol", doc);

  alice.wrapRecord("data/input", "inner", "wrapper");
  bob.rename("data", "input", "source");
  carol.add("data", "formula", {
    $tag: "x-formula",
    target: { $ref: "../../input" },
  });

  syncMesh([alice, bob, carol]);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(bob.toPlain(), carol.toPlain());
});

// ── Transitive sync convergence ─────────────────────────────────────

Deno.test("transitive sync: rename + insert with $ref via chain A↔B, B↔C, A↔C", () => {
  const doc = {
    $tag: "root",
    form: {
      $tag: "form",
      input: { $tag: "field", value: "hello" },
      items: { $tag: "list", $items: [] as const },
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);
  const carol = new Denicek("carol", doc);

  alice.rename("form", "input", "textInput");
  bob.add("form", "formula", {
    $tag: "x-formula",
    source: { $ref: "../../input/value" },
  });
  carol.pushBack("form/items", {
    $tag: "x-formula",
    target: { $ref: "../../../input" },
  });

  sync(alice, bob);
  sync(bob, carol);
  sync(alice, carol);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(bob.toPlain(), carol.toPlain());
});

// ── Absolute $ref rewriting ─────────────────────────────────────────

Deno.test("rename + concurrent insert with absolute $ref: ref is rewritten", () => {
  const doc = {
    $tag: "root",
    form: {
      $tag: "form",
      input: "hello",
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.rename("form", "input", "source");
  bob.add("form", "formula", {
    $tag: "x-formula",
    target: { $ref: "/form/input" },
  });

  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());

  const plain = alice.toPlain() as Record<string, unknown>;
  const form = plain.form as Record<string, unknown>;
  const formula = form.formula as Record<string, unknown>;
  const target = formula.target as { $ref: string };
  assertEquals(target.$ref, "/form/source");
});

// ── $ref inside nested structure ────────────────────────────────────

Deno.test("rename + concurrent insert with deeply nested $ref: ref is rewritten", () => {
  // ReferenceNode at "form/output/args/0". To reach "form/input" we
  // need "../../../input" (up 3: 0→args→output→form, then input).
  const doc = {
    $tag: "root",
    form: {
      $tag: "form",
      input: "hello",
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.rename("form", "input", "source");
  bob.add("form", "output", {
    $tag: "x-formula",
    operation: "uppercase",
    args: { $tag: "args", $items: [{ $ref: "../../../input" }] },
  });

  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());

  const plain = alice.toPlain() as Record<string, unknown>;
  const form = plain.form as Record<string, unknown>;
  const output = form.output as Record<string, unknown>;
  const args = output.args as { $tag: string; $items: unknown[] };
  const ref = args.$items[0] as { $ref: string };
  assertEquals(ref.$ref, "../../../source");
});

// ── No false rewriting when ref doesn't cross structural edit ───────

Deno.test("rename of unrelated field does not alter $ref", () => {
  const doc = {
    $tag: "root",
    form: {
      $tag: "form",
      input: "hello",
      other: "world",
    },
  };
  const alice = new Denicek("alice", doc);
  const bob = new Denicek("bob", doc);

  alice.rename("form", "other", "misc");
  bob.add("form", "formula", {
    $tag: "x-formula",
    source: { $ref: "../../input" },
  });

  sync(alice, bob);

  assertEquals(alice.toPlain(), bob.toPlain());

  const plain = alice.toPlain() as Record<string, unknown>;
  const form = plain.form as Record<string, unknown>;
  const formula = form.formula as Record<string, unknown>;
  const source = formula.source as { $ref: string };
  assertEquals(source.$ref, "../../input");
});
