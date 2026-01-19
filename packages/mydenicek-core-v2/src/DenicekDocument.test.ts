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
            let versions: number[] = [];
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
                    expect(valueNode.value).toBe("Hello World");
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
                    expect(node.value).toBe("Hello World");
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
});
