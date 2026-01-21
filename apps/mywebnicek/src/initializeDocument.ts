/**
 * Default document initialization for the web app
 *
 * This creates a sample document structure for demonstration purposes.
 * Extracted from core library to keep initialization logic application-specific.
 */

import type { DenicekModel } from "@mydenicek/core";

/** Shorthand for creating element nodes */
const el = (tag: string) => ({ kind: "element" as const, tag, attrs: {}, children: [] });
/** Shorthand for creating value nodes */
const val = (value: string) => ({ kind: "value" as const, value });
/** Shorthand for creating action nodes (programmable buttons) */
const action = (label: string, target: string) => ({ kind: "action" as const, label, actions: [], target });

/**
 * Initialize a document with a sample structure
 */
export function initializeDocument(model: DenicekModel): void {
    const rootId = model.createRootNode("section");
    createDemoContent(model, rootId);
}

function createDemoContent(model: DenicekModel, rootId: string): void {
    // Create initial document structure
    const sectionId = model.addChild(rootId, el("section"));
    model.updateAttribute(sectionId, "style", { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 });
    model.updateAttribute(sectionId, "data-testid", "section");

    // Article A
    const articleAId = model.addChild(sectionId, el("article"));
    const h2AId = model.addChild(articleAId, el("h2"));
    model.addChild(h2AId, val("Article A"));
    const pAId = model.addChild(articleAId, el("p"));
    model.addChild(pAId, val("Lorem ipsum dolor sit amet, consectetur adipiscing elit."));
    const ulAId = model.addChild(articleAId, el("ul"));
    const li1Id = model.addChild(ulAId, el("li"));
    model.addChild(li1Id, val("Item A1"));
    const li2Id = model.addChild(ulAId, el("li"));
    model.addChild(li2Id, val("Item A2"));
    const li3Id = model.addChild(ulAId, el("li"));
    model.addChild(li3Id, val("Item A3"));

    // Article B
    const articleBId = model.addChild(sectionId, el("article"));
    const h2BId = model.addChild(articleBId, el("h2"));
    model.addChild(h2BId, val("Article B"));
    const pBId = model.addChild(articleBId, el("p"));
    model.addChild(pBId, val("Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."));

    // Input field
    const inputContainerId = model.addChild(articleBId, el("div"));
    model.updateAttribute(inputContainerId, "style", { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 });
    const labelId = model.addChild(inputContainerId, el("label"));
    model.addChild(labelId, val("Input:"));
    const inputId = model.addChild(inputContainerId, el("input"));
    model.updateAttribute(inputId, "type", "text");
    model.updateAttribute(inputId, "placeholder", "Type here...");
    model.updateAttribute(inputId, "style", { padding: 4, border: '1px solid #ccc', borderRadius: 4 });

    const divBId = model.addChild(articleBId, el("div"));
    model.updateAttribute(divBId, "style", { display: 'flex', gap: 8 });
    // Action nodes (programmable buttons) - target the list in Article A
    model.addChild(divBId, action("Add Item", ulAId));
    model.addChild(divBId, action("Clear List", ulAId));
    model.addChild(divBId, action("Button 3", ulAId));

    // Article C
    const articleCId = model.addChild(sectionId, el("article"));
    model.updateAttribute(articleCId, "style", { gridColumn: 'span 2' });
    const h2CId = model.addChild(articleCId, el("h2"));
    model.addChild(h2CId, val("Article C"));
    const gridCId = model.addChild(articleCId, el("div"));
    model.updateAttribute(gridCId, "style", { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 });
    for (let i = 0; i < 9; i++) {
        const boxId = model.addChild(gridCId, el("div"));
        model.updateAttribute(boxId, "style", { padding: 12, background: '#f7f7f7', border: '1px dashed #ccc', borderRadius: 6 });
        model.addChild(boxId, val(`Box ${i + 1}`));
    }

    // Article D (Table)
    const articleDId = model.addChild(sectionId, el("article"));
    model.updateAttribute(articleDId, "style", { gridColumn: 'span 2' });
    const h2DId = model.addChild(articleDId, el("h2"));
    model.addChild(h2DId, val("Table Data"));
    const tableId = model.addChild(articleDId, el("table"));
    model.updateAttribute(tableId, "border", "1");
    model.updateAttribute(tableId, "style", { width: '100%', borderCollapse: 'collapse' });

    const theadId = model.addChild(tableId, el("thead"));
    const theadTrId = model.addChild(theadId, el("tr"));
    const th1Id = model.addChild(theadTrId, el("th"));
    model.addChild(th1Id, val("Name"));
    const th2Id = model.addChild(theadTrId, el("th"));
    model.addChild(th2Id, val("Role"));
    const th3Id = model.addChild(theadTrId, el("th"));
    model.addChild(th3Id, val("Status"));

    const tbodyId = model.addChild(tableId, el("tbody"));
    const tr1Id = model.addChild(tbodyId, el("tr"));
    const td1aId = model.addChild(tr1Id, el("td"));
    model.addChild(td1aId, val("Alice"));
    const td1bId = model.addChild(tr1Id, el("td"));
    model.addChild(td1bId, val("Developer"));
    const td1cId = model.addChild(tr1Id, el("td"));
    model.addChild(td1cId, val("Active"));

    const tr2Id = model.addChild(tbodyId, el("tr"));
    const td2aId = model.addChild(tr2Id, el("td"));
    model.addChild(td2aId, val("Bob"));
    const td2bId = model.addChild(tr2Id, el("td"));
    model.addChild(td2bId, val("Designer"));
    const td2cId = model.addChild(tr2Id, el("td"));
    model.addChild(td2cId, val("Inactive"));
}
