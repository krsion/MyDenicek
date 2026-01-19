/**
 * Default document initialization for the web app
 *
 * This creates a sample document structure for demonstration purposes.
 * Extracted from core library to keep initialization logic application-specific.
 */

import type { DenicekModel } from "@mydenicek/core-v2";

/**
 * Initialize a document with a sample structure
 */
export function initializeDocument(model: DenicekModel): void {
    const rootId = model.createRootNode("section");
    createDemoContent(model, rootId);
}

function createDemoContent(model: DenicekModel, rootId: string): void {
    // Create initial document structure
    const sectionId = model.addElementChildNode(rootId, "section");
    model.updateAttribute(sectionId, "style", { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 });
    model.updateAttribute(sectionId, "data-testid", "section");

    // Article A
    const articleAId = model.addElementChildNode(sectionId, "article");
    const h2AId = model.addElementChildNode(articleAId, "h2");
    model.addValueChildNode(h2AId, "Article A");
    const pAId = model.addElementChildNode(articleAId, "p");
    model.addValueChildNode(pAId, "Lorem ipsum dolor sit amet, consectetur adipiscing elit.");
    const ulAId = model.addElementChildNode(articleAId, "ul");
    const li1Id = model.addElementChildNode(ulAId, "li");
    model.addValueChildNode(li1Id, "Item A1");
    const li2Id = model.addElementChildNode(ulAId, "li");
    model.addValueChildNode(li2Id, "Item A2");
    const li3Id = model.addElementChildNode(ulAId, "li");
    model.addValueChildNode(li3Id, "Item A3");

    // Article B
    const articleBId = model.addElementChildNode(sectionId, "article");
    const h2BId = model.addElementChildNode(articleBId, "h2");
    model.addValueChildNode(h2BId, "Article B");
    const pBId = model.addElementChildNode(articleBId, "p");
    model.addValueChildNode(pBId, "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.");
    const divBId = model.addElementChildNode(articleBId, "div");
    model.updateAttribute(divBId, "style", { display: 'flex', gap: 8 });
    const btn1Id = model.addElementChildNode(divBId, "button");
    model.addValueChildNode(btn1Id, "Button 1");
    const btn2Id = model.addElementChildNode(divBId, "button");
    model.addValueChildNode(btn2Id, "Button 2");
    const btn3Id = model.addElementChildNode(divBId, "button");
    model.addValueChildNode(btn3Id, "Button 3");

    // Article C
    const articleCId = model.addElementChildNode(sectionId, "article");
    model.updateAttribute(articleCId, "style", { gridColumn: 'span 2' });
    const h2CId = model.addElementChildNode(articleCId, "h2");
    model.addValueChildNode(h2CId, "Article C");
    const gridCId = model.addElementChildNode(articleCId, "div");
    model.updateAttribute(gridCId, "style", { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 });
    for (let i = 0; i < 9; i++) {
        const boxId = model.addElementChildNode(gridCId, "div");
        model.updateAttribute(boxId, "style", { padding: 12, background: '#f7f7f7', border: '1px dashed #ccc', borderRadius: 6 });
        model.addValueChildNode(boxId, `Box ${i + 1}`);
    }

    // Article D (Table)
    const articleDId = model.addElementChildNode(sectionId, "article");
    model.updateAttribute(articleDId, "style", { gridColumn: 'span 2' });
    const h2DId = model.addElementChildNode(articleDId, "h2");
    model.addValueChildNode(h2DId, "Table Data");
    const tableId = model.addElementChildNode(articleDId, "table");
    model.updateAttribute(tableId, "border", "1");
    model.updateAttribute(tableId, "style", { width: '100%', borderCollapse: 'collapse' });

    const theadId = model.addElementChildNode(tableId, "thead");
    const theadTrId = model.addElementChildNode(theadId, "tr");
    const th1Id = model.addElementChildNode(theadTrId, "th");
    model.addValueChildNode(th1Id, "Name");
    const th2Id = model.addElementChildNode(theadTrId, "th");
    model.addValueChildNode(th2Id, "Role");
    const th3Id = model.addElementChildNode(theadTrId, "th");
    model.addValueChildNode(th3Id, "Status");

    const tbodyId = model.addElementChildNode(tableId, "tbody");
    const tr1Id = model.addElementChildNode(tbodyId, "tr");
    const td1aId = model.addElementChildNode(tr1Id, "td");
    model.addValueChildNode(td1aId, "Alice");
    const td1bId = model.addElementChildNode(tr1Id, "td");
    model.addValueChildNode(td1bId, "Developer");
    const td1cId = model.addElementChildNode(tr1Id, "td");
    model.addValueChildNode(td1cId, "Active");

    const tr2Id = model.addElementChildNode(tbodyId, "tr");
    const td2aId = model.addElementChildNode(tr2Id, "td");
    model.addValueChildNode(td2aId, "Bob");
    const td2bId = model.addElementChildNode(tr2Id, "td");
    model.addValueChildNode(td2bId, "Designer");
    const td2cId = model.addElementChildNode(tr2Id, "td");
    model.addValueChildNode(td2cId, "Inactive");
}
