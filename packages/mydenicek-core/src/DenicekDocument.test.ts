import { beforeEach, describe, expect, it } from "vitest";

import { DenicekDocument } from "./DenicekDocument.js";

/** Simple test initializer - creates a minimal document structure */
function testInitializer(doc: DenicekDocument): void {
    const rootId = doc.createRootNode("section");
    doc.addChild(rootId, { kind: "element", tag: "p", attrs: {}, children: [] });
}

describe("DenicekDocument", () => {
    let doc: DenicekDocument;

    beforeEach(() => {
        doc = new DenicekDocument();
    });

    describe("basic operations", () => {
        it("should create an empty document", () => {
            expect(doc.getRootId()).toBeNull();
            const snapshot = doc.getSnapshot();
            expect(snapshot.nodes.size).toBe(0);
        });

        it("should create a document with initial structure via initializer", () => {
            doc = DenicekDocument.create({}, (d) => {
                d.createRootNode("section");
            });
            expect(doc.getRootId()).toBeTruthy();
            const snapshot = doc.getSnapshot();
            expect(snapshot.nodes.size).toBe(1);
        });

        it("should add nodes directly", () => {
            doc.createRootNode("root");
            expect(doc.getRootId()).toBeTruthy();
        });
    });

    describe("export/import", () => {
        it("should export and import document", () => {
            doc = DenicekDocument.create({}, testInitializer);
            const bytes = doc.export("snapshot");

            const doc2 = new DenicekDocument();
            doc2.import(bytes);

            expect(doc2.getRootId()).toBe(doc.getRootId());
            expect(doc2.getSnapshot().nodes.size).toBe(doc.getSnapshot().nodes.size);
        });
    });

    describe("subscriptions", () => {
        it("should notify on changes", () => {
            let notified = false;
            doc.subscribe(() => {
                notified = true;
            });

            doc.createRootNode("root");

            expect(notified).toBe(true);
        });
    });

    describe("undo/redo", () => {
        beforeEach(() => {
            doc = DenicekDocument.create({}, testInitializer);
        });

        it("should track canUndo/canRedo state on fresh document", () => {
            // Use a fresh document (not create() which adds initial content)
            const freshDoc = new DenicekDocument();
            expect(freshDoc.canUndo).toBe(false);
            expect(freshDoc.canRedo).toBe(false);
        });

        it("should undo changes", () => {
            const rootId = doc.getRootId()!;
            const nodeId = doc.addChild(rootId, { kind: "element", tag: "test", attrs: {}, children: [] });

            // Verify node was added
            expect(doc.getNode(nodeId)).toBeTruthy();

            // Undo should be available now
            expect(doc.canUndo).toBe(true);

            // Undo the change
            doc.undo();

            // Verify node was removed
            expect(doc.getNode(nodeId)).toBeNull();

            // Redo should be available
            expect(doc.canRedo).toBe(true);
        });
    });

    describe("version change notification", () => {
        it("should notify on version change", () => {
            const versions: number[] = [];
            const docWithCallback = DenicekDocument.create(
                { onVersionChange: (v: number) => versions.push(v) },
                testInitializer
            );

            const rootId = docWithCallback.getRootId()!;
            docWithCallback.addChild(rootId, { kind: "element", tag: "test", attrs: {}, children: [] });

            expect(versions.length).toBeGreaterThan(0);
        });
    });
});

describe("DenicekDocument mutations", () => {
    let doc: DenicekDocument;

    beforeEach(() => {
        doc = DenicekDocument.create({}, testInitializer);
    });

    describe("node operations", () => {
        it("should get root node", () => {
            const rootId = doc.getRootId();
            expect(rootId).toBeTruthy();

            const rootNode = doc.getNode(rootId!);
            expect(rootNode).toBeTruthy();
            expect(rootNode?.kind).toBe("element");
        });

        it("should add element child", () => {
            const rootId = doc.getRootId()!;
            const newId = doc.addChild(rootId, { kind: "element", tag: "span", attrs: {}, children: [] });
            expect(newId).toBeTruthy();

            const newNode = doc.getNode(newId);
            expect(newNode?.kind).toBe("element");
            if (newNode?.kind === "element") {
                expect(newNode.tag).toBe("span");
            }
        });

        it("should add value child", () => {
            const rootId = doc.getRootId()!;
            // First add an element to hold the value
            const containerId = doc.addChild(rootId, { kind: "element", tag: "p", attrs: {}, children: [] });

            const valueId = doc.addChild(containerId, { kind: "value", value: "Hello World" });
            expect(valueId).toBeTruthy();

            const valueNode = doc.getNode(valueId);
            expect(valueNode?.kind).toBe("value");
            if (valueNode?.kind === "value") {
                expect(valueNode.value).toBe("Hello World");
            }
        });

        it("should update tag", () => {
            const rootId = doc.getRootId()!;
            const newId = doc.addChild(rootId, { kind: "element", tag: "div", attrs: {}, children: [] });
            doc.updateTag(newId, "span");

            const node = doc.getNode(newId);
            if (node?.kind === "element") {
                expect(node.tag).toBe("span");
            }
        });

        it("should update attribute", () => {
            const rootId = doc.getRootId()!;
            const newId = doc.addChild(rootId, { kind: "element", tag: "div", attrs: {}, children: [] });
            doc.updateAttribute(newId, "class", "container");

            const node = doc.getNode(newId);
            if (node?.kind === "element") {
                expect(node.attrs.class).toBe("container");
            }
        });

        it("should splice value", () => {
            const rootId = doc.getRootId()!;
            const containerId = doc.addChild(rootId, { kind: "element", tag: "p", attrs: {}, children: [] });
            const valueId = doc.addChild(containerId, { kind: "value", value: "Hello" });

            doc.spliceValue(valueId, 5, 0, " World");

            const node = doc.getNode(valueId);
            if (node?.kind === "value") {
                expect(node.value).toBe("Hello World");
            }
        });
    });

    describe("tree operations", () => {
        it("should delete node", () => {
            const rootId = doc.getRootId()!;
            const nodeId = doc.addChild(rootId, { kind: "element", tag: "div", attrs: {}, children: [] });

            doc.deleteNode(nodeId);
            const node = doc.getNode(nodeId);
            expect(node).toBeNull();
        });
    });

    describe("copy operations", () => {
        it("should copy an element node with tag and attrs", () => {
            const rootId = doc.getRootId()!;
            const sourceId = doc.addChild(rootId, {
                kind: "element",
                tag: "div",
                attrs: { class: "source", "data-test": 123 },
                children: []
            });

            const copyId = doc.copyNode(sourceId, rootId);

            const copy = doc.getNode(copyId);
            expect(copy?.kind).toBe("element");
            if (copy?.kind === "element") {
                expect(copy.tag).toBe("div");
                expect(copy.attrs.class).toBe("source");
                expect(copy.attrs["data-test"]).toBe(123);
            }
        });

        it("should copy a value node with current text value", () => {
            const rootId = doc.getRootId()!;
            const containerId = doc.addChild(rootId, { kind: "element", tag: "p", attrs: {}, children: [] });
            const sourceId = doc.addChild(containerId, { kind: "value", value: "original text" });

            const copyId = doc.copyNode(sourceId, containerId);

            const copy = doc.getNode(copyId);
            expect(copy?.kind).toBe("value");
            if (copy?.kind === "value") {
                expect(copy.value).toBe("original text");
            }
        });

        it("should store sourceId on the copied element node", () => {
            const rootId = doc.getRootId()!;
            const sourceId = doc.addChild(rootId, { kind: "element", tag: "span", attrs: {}, children: [] });
            const copyId = doc.copyNode(sourceId, rootId);

            const copyData = doc.getNode(copyId);
            expect(copyData?.sourceId).toBe(sourceId);
        });

        it("should store sourceId on the copied value node", () => {
            const rootId = doc.getRootId()!;
            const containerId = doc.addChild(rootId, { kind: "element", tag: "p", attrs: {}, children: [] });
            const sourceId = doc.addChild(containerId, { kind: "value", value: "test" });
            const copyId = doc.copyNode(sourceId, containerId);

            const copyData = doc.getNode(copyId);
            expect(copyData?.sourceId).toBe(sourceId);
        });

        it("should emit copy patch with sourceId", () => {
            doc.clearHistory();
            const rootId = doc.getRootId()!;
            const sourceId = doc.addChild(rootId, { kind: "element", tag: "div", attrs: {}, children: [] });
            doc.copyNode(sourceId, rootId);

            const history = doc.getHistory();
            const copyPatch = history.find(p => p.action === "copy");
            expect(copyPatch).toBeTruthy();
            expect(copyPatch?.value).toHaveProperty("sourceId", sourceId);
        });

        it("should copy CURRENT value when source is modified before copy", () => {
            const rootId = doc.getRootId()!;
            const containerId = doc.addChild(rootId, { kind: "element", tag: "p", attrs: {}, children: [] });
            const sourceId = doc.addChild(containerId, { kind: "value", value: "initial" });

            // Modify source value
            doc.spliceValue(sourceId, 0, 7, "modified");

            // Copy should get "modified" value
            const copyId = doc.copyNode(sourceId, containerId);

            const copy = doc.getNode(copyId);
            if (copy?.kind === "value") {
                expect(copy.value).toBe("modified");
            }
        });

        it("should read CURRENT value during replay (not value at recording time)", () => {
            // This is the key test for the copy feature:
            // When a copy patch is replayed, it should read the CURRENT value
            // from the source, not the value that existed when the copy was recorded.

            const rootId = doc.getRootId()!;
            const containerId = doc.addChild(rootId, { kind: "element", tag: "p", attrs: {}, children: [] });
            const sourceId = doc.addChild(containerId, { kind: "value", value: "original" });

            // Get count of children before recording
            const snapshotBefore = doc.getSnapshot();
            const childrenBefore = snapshotBefore.childIds.get(containerId) ?? [];
            const childCountBeforeRecording = childrenBefore.length;

            // Record a copy operation
            doc.clearHistory();
            doc.copyNode(sourceId, containerId);
            const copyScript = doc.getHistory();

            // Get count of children after recording (includes the first copy)
            const snapshotAfterRecording = doc.getSnapshot();
            const childrenAfterRecording = snapshotAfterRecording.childIds.get(containerId) ?? [];
            const childCountAfterRecording = childrenAfterRecording.length;
            expect(childCountAfterRecording).toBe(childCountBeforeRecording + 1);

            // Now modify the source value AFTER recording
            doc.spliceValue(sourceId, 0, 8, "updated");

            // Verify source is now "updated"
            const sourceNode = doc.getNode(sourceId);
            if (sourceNode?.kind === "value") {
                expect(sourceNode.value).toBe("updated");
            }

            // Replay the copy script - should create another copy with "updated"
            doc.replay(copyScript, containerId);

            // Now we should have one more child
            const snapshotAfterReplay = doc.getSnapshot();
            const childrenAfterReplay = snapshotAfterReplay.childIds.get(containerId) ?? [];
            expect(childrenAfterReplay.length).toBe(childCountAfterRecording + 1);

            // At least one copy should have "updated" (the replayed one)
            const allCopiesWithUpdated = childrenAfterReplay
                .filter(id => id !== sourceId)
                .map(id => doc.getNode(id))
                .filter(node => node?.kind === "value" && node.value === "updated");

            expect(allCopiesWithUpdated.length).toBeGreaterThanOrEqual(1);
        });
    });
});
