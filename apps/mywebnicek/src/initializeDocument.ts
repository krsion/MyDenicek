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
/** Shorthand for creating formula nodes */
const formula = (operation: string) => ({ kind: "formula" as const, operation });
/** Shorthand for creating ref nodes */
const ref = (target: string) => ({ kind: "ref" as const, target });

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

    // Article E (Formulas Demo)
    const articleEId = model.addChild(sectionId, el("article"));
    model.updateAttribute(articleEId, "style", { gridColumn: 'span 2' });
    const h2EId = model.addChild(articleEId, el("h2"));
    model.addChild(h2EId, val("Formula Examples"));
    const pEId = model.addChild(articleEId, el("p"));
    model.addChild(pEId, val("Toggle the Formulas/Results button in the toolbar to see formula structure."));

    // Formula examples container
    const formulaGridId = model.addChild(articleEId, el("div"));
    model.updateAttribute(formulaGridId, "style", { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 12 });

    // Example 1: Counter with plus formula
    const counterBoxId = model.addChild(formulaGridId, el("div"));
    model.updateAttribute(counterBoxId, "style", { padding: 12, background: '#f0f8ff', borderRadius: 8, border: '1px solid #b0d4f1' });
    const counterLabelId = model.addChild(counterBoxId, el("div"));
    model.updateAttribute(counterLabelId, "style", { fontWeight: 'bold', marginBottom: 8 });
    model.addChild(counterLabelId, val("Counter:"));
    // Create a value node for the base number
    const counterValueId = model.addChild(counterBoxId, val("5"));
    // Create plus(ref, 10) formula
    const plusFormulaId = model.addChild(counterBoxId, formula("plus"));
    model.addChild(plusFormulaId, ref(counterValueId));  // Reference to the counter value
    model.addChild(plusFormulaId, val("10"));  // Add 10
    const counterDescId = model.addChild(counterBoxId, el("div"));
    model.updateAttribute(counterDescId, "style", { fontSize: '0.8em', color: '#666', marginTop: 8 });
    model.addChild(counterDescId, val("plus(ref→5, 10) = 15"));

    // Example 2: Text transformation
    const textBoxId = model.addChild(formulaGridId, el("div"));
    model.updateAttribute(textBoxId, "style", { padding: 12, background: '#f0fff0', borderRadius: 8, border: '1px solid #b0e0b0' });
    const textLabelId = model.addChild(textBoxId, el("div"));
    model.updateAttribute(textLabelId, "style", { fontWeight: 'bold', marginBottom: 8 });
    model.addChild(textLabelId, val("Text Transform:"));
    // Create a value node for the text
    const textValueId = model.addChild(textBoxId, val("hello world"));
    // Create upperText(ref) formula
    const upperFormulaId = model.addChild(textBoxId, formula("upperText"));
    model.addChild(upperFormulaId, ref(textValueId));  // Reference to the text
    const textDescId = model.addChild(textBoxId, el("div"));
    model.updateAttribute(textDescId, "style", { fontSize: '0.8em', color: '#666', marginTop: 8 });
    model.addChild(textDescId, val("upperText(ref→'hello world')"));

    // Example 3: Concat formula
    const concatBoxId = model.addChild(formulaGridId, el("div"));
    model.updateAttribute(concatBoxId, "style", { padding: 12, background: '#fff8f0', borderRadius: 8, border: '1px solid #f0d0b0' });
    const concatLabelId = model.addChild(concatBoxId, el("div"));
    model.updateAttribute(concatLabelId, "style", { fontWeight: 'bold', marginBottom: 8 });
    model.addChild(concatLabelId, val("String Concat:"));
    // Create concat("Hello, ", ref, "!") formula
    const concatFormulaId = model.addChild(concatBoxId, formula("concat"));
    model.addChild(concatFormulaId, val("Hello, "));
    const nameValueId = model.addChild(concatBoxId, val("User"));
    model.addChild(concatFormulaId, ref(nameValueId));
    model.addChild(concatFormulaId, val("!"));
    const concatDescId = model.addChild(concatBoxId, el("div"));
    model.updateAttribute(concatDescId, "style", { fontSize: '0.8em', color: '#666', marginTop: 8 });
    model.addChild(concatDescId, val("concat('Hello, ', ref→'User', '!')"));

    // Example 4: Math - multiply
    const mathBoxId = model.addChild(formulaGridId, el("div"));
    model.updateAttribute(mathBoxId, "style", { padding: 12, background: '#f8f0ff', borderRadius: 8, border: '1px solid #d0b0f0' });
    const mathLabelId = model.addChild(mathBoxId, el("div"));
    model.updateAttribute(mathLabelId, "style", { fontWeight: 'bold', marginBottom: 8 });
    model.addChild(mathLabelId, val("Math:"));
    const priceValueId = model.addChild(mathBoxId, val("25"));
    const qtyValueId = model.addChild(mathBoxId, val("4"));
    // Create multiply(ref_price, ref_qty) formula
    const multiplyFormulaId = model.addChild(mathBoxId, formula("multiply"));
    model.addChild(multiplyFormulaId, ref(priceValueId));
    model.addChild(multiplyFormulaId, ref(qtyValueId));
    const mathDescId = model.addChild(mathBoxId, el("div"));
    model.updateAttribute(mathDescId, "style", { fontSize: '0.8em', color: '#666', marginTop: 8 });
    model.addChild(mathDescId, val("multiply(ref→25, ref→4) = 100"));

    // Example 5: Nested formula - capitalize(concat(...))
    const nestedBoxId = model.addChild(formulaGridId, el("div"));
    model.updateAttribute(nestedBoxId, "style", { padding: 12, background: '#fff0f8', borderRadius: 8, border: '1px solid #f0b0d0' });
    const nestedLabelId = model.addChild(nestedBoxId, el("div"));
    model.updateAttribute(nestedLabelId, "style", { fontWeight: 'bold', marginBottom: 8 });
    model.addChild(nestedLabelId, val("Nested Formula:"));
    const firstNameId = model.addChild(nestedBoxId, val("john"));
    const lastNameId = model.addChild(nestedBoxId, val("doe"));
    // Create capitalize(concat(ref_first, " ", ref_last))
    const outerFormulaId = model.addChild(nestedBoxId, formula("concat"));
    // Inner capitalize for first name
    const capFirstId = model.addChild(outerFormulaId, formula("capitalize"));
    model.addChild(capFirstId, ref(firstNameId));
    model.addChild(outerFormulaId, val(" "));
    // Inner capitalize for last name
    const capLastId = model.addChild(outerFormulaId, formula("capitalize"));
    model.addChild(capLastId, ref(lastNameId));
    const nestedDescId = model.addChild(nestedBoxId, el("div"));
    model.updateAttribute(nestedDescId, "style", { fontSize: '0.8em', color: '#666', marginTop: 8 });
    model.addChild(nestedDescId, val("concat(capitalize(ref), ' ', capitalize(ref))"));

    // Example 6: countChildren
    const countBoxId = model.addChild(formulaGridId, el("div"));
    model.updateAttribute(countBoxId, "style", { padding: 12, background: '#f0f0f0', borderRadius: 8, border: '1px solid #c0c0c0' });
    const countLabelId = model.addChild(countBoxId, el("div"));
    model.updateAttribute(countLabelId, "style", { fontWeight: 'bold', marginBottom: 8 });
    model.addChild(countLabelId, val("Count Children:"));
    // Create countChildren(ref_to_ulA) formula - counts items in Article A's list
    const countFormulaId = model.addChild(countBoxId, formula("countChildren"));
    model.addChild(countFormulaId, val(ulAId));  // Pass the list ID as a value
    const countDescId = model.addChild(countBoxId, el("div"));
    model.updateAttribute(countDescId, "style", { fontSize: '0.8em', color: '#666', marginTop: 8 });
    model.addChild(countDescId, val("countChildren(Article A's list) = 3"));
}
