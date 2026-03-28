import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import type { PlainNode, PlainRecord } from "@mydenicek/core";
import { DocumentSession } from "../document-session.ts";

const INITIAL_DOC: PlainNode = {
  $tag: "root",
  title: "Hello",
  items: { $tag: "list", $items: ["a", "b"] },
};

function readTitleField(node: PlainNode): string {
  if (
    typeof node !== "object" || node === null || !("$tag" in node) ||
    "$items" in node || "$ref" in node
  ) {
    throw new Error("Expected snapshot.doc to be a record");
  }

  const title = (node as PlainRecord).title;
  if (typeof title !== "string") {
    throw new Error("Expected snapshot.doc.title to be a string");
  }

  return title;
}

describe("DocumentSession", () => {
  it("creates a snapshot for a fresh document", () => {
    const session = new DocumentSession("alice", INITIAL_DOC);
    const snapshot = session.createSnapshot();
    expect(snapshot.peerId).toBe("alice");
    expect(snapshot.events).toHaveLength(0);
    expect(snapshot.conflicts).toHaveLength(0);
    expect(snapshot.doc).toMatchObject({ $tag: "root", title: "Hello" });
  });

  it("records local edits in the snapshot", () => {
    const session = new DocumentSession("alice", INITIAL_DOC);
    session.set("title", "Updated");
    const snapshot = session.createSnapshot();
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]!.editKind).toBe("SetValue");
    expect(readTitleField(snapshot.doc)).toBe("Updated");
  });
});
