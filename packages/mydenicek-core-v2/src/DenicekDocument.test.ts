import { beforeEach, describe, expect, it } from "vitest";
import { DenicekDocument } from "./DenicekDocument.js";
import { DenicekStore } from "./DenicekStore.js";

describe("DenicekDocument", () => {
    let doc: DenicekDocument;

    beforeEach(() => {
        doc = new DenicekDocument();
    });

    describe("basic operations", () => {
        it("should create an empty document", () => {
            const snapshot = doc.getSnapshot();
            expect(snapshot.root).toBe("");
            expect(Object.keys(snapshot.nodes)).toHaveLength(0);
        });

        it("should create a document with initial structure", () => {
            doc = DenicekDocument.create();
            const snapshot = doc.getSnapshot();
            expect(snapshot.root).toBeTruthy();
            expect(Object.keys(snapshot.nodes).length).toBeGreaterThan(0);
        });

        it("should add nodes via change()", () => {
            doc.change((model) => {
                model.initializeDocument();
            });

            const snapshot = doc.getSnapshot();
            expect(snapshot.root).toBeTruthy();
        });
    });

    describe("export/import", () => {
        it("should export and import document", () => {
            doc = DenicekDocument.create();
            const bytes = doc.export("snapshot");

            const doc2 = DenicekDocument.fromBytes(bytes);
            const snapshot1 = doc.getSnapshot();
            const snapshot2 = doc2.getSnapshot();

            expect(snapshot2.root).toBe(snapshot1.root);
            expect(Object.keys(snapshot2.nodes)).toHaveLength(Object.keys(snapshot1.nodes).length);
        });
    });

    describe("subscriptions", () => {
        it("should notify on changes", () => {
            let notified = false;
            doc.subscribe(() => {
                notified = true;
            });

            doc.change((model) => {
                model.initializeDocument();
            });

            expect(notified).toBe(true);
        });
    });
});

describe("DenicekModel", () => {
    let doc: DenicekDocument;

    beforeEach(() => {
        doc = DenicekDocument.create();
    });

    describe("node operations", () => {
        it("should get root node", () => {
            doc.change((model) => {
                const rootId = model.rootId;
                expect(rootId).toBeTruthy();

                const rootNode = model.getRootNode();
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

describe("DenicekStore", () => {
    let doc: DenicekDocument;
    let store: DenicekStore;

    beforeEach(() => {
        doc = DenicekDocument.create();
        store = new DenicekStore(doc);
    });

    describe("undo/redo", () => {
        it("should track canUndo/canRedo state", () => {
            expect(store.canUndo).toBe(false);
            expect(store.canRedo).toBe(false);
        });

        it("should undo changes", () => {
            let nodeId: string;
            store.modify((model) => {
                const rootId = model.rootId;
                nodeId = model.addElementChildNode(rootId, "test");
            });

            // Verify node was added
            const snapshotBefore = doc.getSnapshot();
            expect(snapshotBefore.nodes[nodeId!]).toBeTruthy();

            // Undo should be available now
            expect(store.canUndo).toBe(true);

            // Undo the change
            store.undo();

            // Verify node was removed
            const snapshotAfter = doc.getSnapshot();
            expect(snapshotAfter.nodes[nodeId!]).toBeUndefined();

            // Redo should be available
            expect(store.canRedo).toBe(true);
        });
    });

    describe("version change notification", () => {
        it("should notify on version change", () => {
            let versions: number[] = [];
            const storeWithCallback = new DenicekStore(doc, {
                onVersionChange: (v) => versions.push(v),
            });

            storeWithCallback.modify((model) => {
                const rootId = model.rootId;
                model.addElementChildNode(rootId, "test");
            });

            expect(versions.length).toBeGreaterThan(0);
        });
    });
});
