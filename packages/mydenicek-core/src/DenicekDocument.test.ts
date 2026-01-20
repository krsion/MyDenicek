import { beforeEach, describe, expect, it } from "vitest";

import { DenicekDocument } from "./DenicekDocument.js";
import type { DenicekModel } from "./DenicekModel.js";

/** Simple test initializer - creates a minimal document structure */
function testInitializer(model: DenicekModel): void {
    const rootId = model.createRootNode("section");
    model.addElementChildNode(rootId, "p");
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
            doc = DenicekDocument.create({}, (model) => {
                model.createRootNode("section");
            });
            expect(doc.getRootId()).toBeTruthy();
            const snapshot = doc.getSnapshot();
            expect(snapshot.nodes.size).toBe(1);
        });

        it("should add nodes via change()", () => {
            doc.change((model) => {
                model.createRootNode("root");
            });

            expect(doc.getRootId()).toBeTruthy();
        });
    });

    describe("export/import", () => {
        it("should export and import document", () => {
            doc = DenicekDocument.create({}, testInitializer);
            const bytes = doc.export("snapshot");

            const doc2 = DenicekDocument.fromBytes(bytes);

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

            doc.change((model) => {
                model.createRootNode("root");
            });

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
            let nodeId: string;
            doc.change((model) => {
                const rootId = model.rootId;
                nodeId = model.addElementChildNode(rootId, "test");
            });

            // Verify node was added
            expect(doc.getNode(nodeId!)).toBeTruthy();

            // Undo should be available now
            expect(doc.canUndo).toBe(true);

            // Undo the change
            doc.undo();

            // Verify node was removed
            expect(doc.getNode(nodeId!)).toBeNull();

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

            docWithCallback.change((model) => {
                const rootId = model.rootId;
                model.addElementChildNode(rootId, "test");
            });

            expect(versions.length).toBeGreaterThan(0);
        });
    });
});

describe("DenicekModel", () => {
    let doc: DenicekDocument;

    beforeEach(() => {
        doc = DenicekDocument.create({}, testInitializer);
    });

    describe("node operations", () => {
        it("should get root node", () => {
            doc.change((model) => {
                const rootId = model.rootId;
                expect(rootId).toBeTruthy();

                const rootNode = model.getNode(rootId);
                expect(rootNode).toBeTruthy();
                expect(rootNode?.kind).toBe("element");
            });
        });

        it("should add element child", () => {
            doc.change((model) => {
                const rootId = model.rootId;
                const newId = model.addElementChildNode(rootId, "span");
                expect(newId).toBeTruthy();

                const newNode = model.getNode(newId);
                expect(newNode?.kind).toBe("element");
                if (newNode?.kind === "element") {
                    expect(newNode.tag).toBe("span");
                }
            });
        });

        it("should add value child", () => {
            doc.change((model) => {
                const rootId = model.rootId;
                // First add an element to hold the value
                const containerId = model.addElementChildNode(rootId, "p");

                const valueId = model.addValueChildNode(containerId, "Hello World");
                expect(valueId).toBeTruthy();

                const valueNode = model.getNode(valueId);
                expect(valueNode?.kind).toBe("value");
                if (valueNode?.kind === "value") {
                    expect(valueNode.value.toString()).toBe("Hello World");
                }
            });
        });

        it("should update tag", () => {
            doc.change((model) => {
                const rootId = model.rootId;
                const newId = model.addElementChildNode(rootId, "div");
                model.updateTag(newId, "span");

                const node = model.getNode(newId);
                if (node?.kind === "element") {
                    expect(node.tag).toBe("span");
                }
            });
        });

        it("should update attribute", () => {
            doc.change((model) => {
                const rootId = model.rootId;
                const newId = model.addElementChildNode(rootId, "div");
                model.updateAttribute(newId, "class", "container");

                const node = model.getNode(newId);
                if (node?.kind === "element") {
                    expect(node.attrs.class).toBe("container");
                }
            });
        });

        it("should splice value", () => {
            doc.change((model) => {
                const rootId = model.rootId;
                const containerId = model.addElementChildNode(rootId, "p");
                const valueId = model.addValueChildNode(containerId, "Hello");

                model.spliceValue(valueId, 5, 0, " World");

                const node = model.getNode(valueId);
                if (node?.kind === "value") {
                    expect(node.value.toString()).toBe("Hello World");
                }
            });
        });
    });

    describe("tree operations", () => {
        it("should delete node", () => {
            let nodeId: string;
            doc.change((model) => {
                const rootId = model.rootId;
                nodeId = model.addElementChildNode(rootId, "div");
            });

            doc.change((model) => {
                model.deleteNode(nodeId!);
                const node = model.getNode(nodeId!);
                expect(node).toBeUndefined();
            });
        });
    });

    describe("copy operations", () => {
        it("should copy an element node with tag and attrs", () => {
            doc.change((model) => {
                const rootId = model.rootId;
                const sourceId = model.addChildNode(rootId, {
                    kind: "element",
                    tag: "div",
                    attrs: { class: "source", "data-test": 123 },
                    children: []
                });

                const copyId = model.copyNode(sourceId, rootId);

                const copy = model.getNode(copyId);
                expect(copy?.kind).toBe("element");
                if (copy?.kind === "element") {
                    expect(copy.tag).toBe("div");
                    expect(copy.attrs.class).toBe("source");
                    expect(copy.attrs["data-test"]).toBe(123);
                }
            });
        });

        it("should copy a value node with current text value", () => {
            doc.change((model) => {
                const rootId = model.rootId;
                const containerId = model.addElementChildNode(rootId, "p");
                const sourceId = model.addValueChildNode(containerId, "original text");

                const copyId = model.copyNode(sourceId, containerId);

                const copy = model.getNode(copyId);
                expect(copy?.kind).toBe("value");
                if (copy?.kind === "value") {
                    expect(copy.value.toString()).toBe("original text");
                }
            });
        });

        it("should store sourceId on the copied element node", () => {
            let sourceId: string;
            let copyId: string;

            doc.change((model) => {
                const rootId = model.rootId;
                sourceId = model.addElementChildNode(rootId, "span");
                copyId = model.copyNode(sourceId, rootId);
            });

            const copyData = doc.getNode(copyId!);
            expect(copyData?.sourceId).toBe(sourceId!);
        });

        it("should store sourceId on the copied value node", () => {
            let sourceId: string;
            let copyId: string;

            doc.change((model) => {
                const rootId = model.rootId;
                const containerId = model.addElementChildNode(rootId, "p");
                sourceId = model.addValueChildNode(containerId, "test");
                copyId = model.copyNode(sourceId, containerId);
            });

            const copyData = doc.getNode(copyId!);
            expect(copyData?.sourceId).toBe(sourceId!);
        });

        it("should throw when source node doesn't exist", () => {
            expect(() => {
                doc.change((model) => {
                    model.copyNode("nonexistent@123", model.rootId);
                });
            }).toThrow("Source node not found");
        });

        it("should throw when parent node doesn't exist", () => {
            let sourceId: string;
            doc.change((model) => {
                sourceId = model.addElementChildNode(model.rootId, "div");
            });

            expect(() => {
                doc.change((model) => {
                    model.copyNode(sourceId!, "nonexistent@456");
                });
            }).toThrow("Parent node not found");
        });

        it("should emit copy patch with sourceId", () => {
            doc.clearHistory();
            let sourceId: string;

            doc.change((model) => {
                const rootId = model.rootId;
                sourceId = model.addElementChildNode(rootId, "div");
                model.copyNode(sourceId, rootId);
            });

            const history = doc.getHistory();
            const copyPatch = history.find(p => p.action === "copy");
            expect(copyPatch).toBeTruthy();
            expect(copyPatch?.value).toHaveProperty("sourceId", sourceId!);
        });

        it("should copy CURRENT value when source is modified before copy", () => {
            doc.change((model) => {
                const rootId = model.rootId;
                const containerId = model.addElementChildNode(rootId, "p");
                const sourceId = model.addValueChildNode(containerId, "initial");

                // Modify source value
                model.spliceValue(sourceId, 0, 7, "modified");

                // Copy should get "modified" value
                const copyId = model.copyNode(sourceId, containerId);

                const copy = model.getNode(copyId);
                if (copy?.kind === "value") {
                    expect(copy.value.toString()).toBe("modified");
                }
            });
        });

        it("should read CURRENT value during replay (not value at recording time)", () => {
            // This is the key test for the copy feature:
            // When a copy patch is replayed, it should read the CURRENT value
            // from the source, not the value that existed when the copy was recorded.

            let sourceId: string;
            let containerId: string;

            // Create source with initial value
            doc.change((model) => {
                const rootId = model.rootId;
                containerId = model.addElementChildNode(rootId, "p");
                sourceId = model.addValueChildNode(containerId, "original");
            });

            // Get count of children before recording
            const snapshotBefore = doc.getSnapshot();
            const childrenBefore = snapshotBefore.childIds.get(containerId!) ?? [];
            const childCountBeforeRecording = childrenBefore.length;

            // Record a copy operation
            doc.clearHistory();
            doc.change((model) => {
                model.copyNode(sourceId!, containerId!);
            });
            const copyScript = doc.getHistory();

            // Get count of children after recording (includes the first copy)
            const snapshotAfterRecording = doc.getSnapshot();
            const childrenAfterRecording = snapshotAfterRecording.childIds.get(containerId!) ?? [];
            const childCountAfterRecording = childrenAfterRecording.length;
            expect(childCountAfterRecording).toBe(childCountBeforeRecording + 1);

            // Now modify the source value AFTER recording
            doc.change((model) => {
                model.spliceValue(sourceId!, 0, 8, "updated");
            });

            // Verify source is now "updated"
            const sourceNode = doc.getNode(sourceId!);
            if (sourceNode?.kind === "value") {
                expect(sourceNode.value).toBe("updated");
            }

            // Replay the copy script - should create another copy with "updated"
            doc.replay(copyScript, containerId!);

            // Now we should have one more child
            const snapshotAfterReplay = doc.getSnapshot();
            const childrenAfterReplay = snapshotAfterReplay.childIds.get(containerId!) ?? [];
            expect(childrenAfterReplay.length).toBe(childCountAfterRecording + 1);

            // The replayed copy is inserted at index 1 (as per the recorded patch)
            // This shifts the original first copy to the end
            // So we need to check the child at the index where it was inserted (index 1)
            // OR we can check that at least one copy has "updated"
            const allCopiesWithUpdated = childrenAfterReplay
                .filter(id => id !== sourceId!)
                .map(id => doc.getNode(id))
                .filter(node => node?.kind === "value" && node.value === "updated");

            // At least one copy should have "updated" (the replayed one)
            expect(allCopiesWithUpdated.length).toBeGreaterThanOrEqual(1);
        });

        it("should apply copy via applyPatch", () => {
            let sourceId: string;
            let containerId: string;

            doc.change((model) => {
                const rootId = model.rootId;
                containerId = model.addElementChildNode(rootId, "div");
                sourceId = model.addValueChildNode(containerId, "test value");
            });

            // Apply a copy patch directly
            doc.change((model) => {
                const result = model.applyPatch({
                    action: "copy",
                    path: ["nodes", containerId!, "children", 1],
                    value: { sourceId: sourceId! }
                });
                expect(typeof result).toBe("string");
            });

            // Verify copy was created
            const snapshot = doc.getSnapshot();
            const containerChildren = snapshot.childIds.get(containerId!) ?? [];
            expect(containerChildren.length).toBe(2);

            const copyNodeId = containerChildren[1];
            expect(copyNodeId).toBeDefined();
            const copyNode = doc.getNode(copyNodeId!);
            expect(copyNode?.kind).toBe("value");
            if (copyNode?.kind === "value") {
                expect(copyNode.value).toBe("test value");
            }
        });
    });
});
