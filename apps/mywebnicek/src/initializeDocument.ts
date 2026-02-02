/**
 * Default document initialization for the web app
 *
 * This creates formative examples from the specification that demonstrate
 * the end-user programming model of Denicek.
 */

import type { DenicekDocument, GeneralizedPatch } from "@mydenicek/core";

/** Shorthand for creating element nodes */
const el = (tag: string) => ({ kind: "element" as const, tag, attrs: {}, children: [] });
/** Shorthand for creating value nodes */
const val = (value: string) => ({ kind: "value" as const, value });
/** Shorthand for creating action nodes (programmable buttons) */
const action = (label: string, target: string, actions: GeneralizedPatch[] = []) => ({ kind: "action" as const, label, actions, target });
/** Shorthand for creating formula nodes */
const formula = (operation: string) => ({ kind: "formula" as const, operation });
/** Shorthand for creating ref nodes */
const ref = (target: string) => ({ kind: "ref" as const, target });

// ============================================================================
// Pre-programmed actions for buttons
// ============================================================================

/** Actions for "Add Item" button in Todo List */
const addTodoItemActions: GeneralizedPatch[] = [
    // Insert new li element as child of the list ($0)
    { action: "insert", path: ["nodes", "$0", "children", -1], value: { id: "$1", kind: "element", tag: "li" } },
    // Style the li
    { action: "put", path: ["nodes", "$1", "attrs", "style"], value: { display: 'flex', alignItems: 'center', gap: 8, padding: 4 } },
    // Insert checkbox input as child of li
    { action: "insert", path: ["nodes", "$1", "children", -1], value: { id: "$2", kind: "element", tag: "input" } },
    // Set checkbox type
    { action: "put", path: ["nodes", "$2", "attrs", "type"], value: "checkbox" },
    // Insert text value as child of li
    { action: "insert", path: ["nodes", "$1", "children", -1], value: { kind: "value", value: "New item" } },
];

/** Actions for "Add Conference" button */
const addConferenceActions: GeneralizedPatch[] = [
    // Insert new tr element as child of tbody ($0)
    { action: "insert", path: ["nodes", "$0", "children", -1], value: { id: "$1", kind: "element", tag: "tr" } },
    // Insert first td (name)
    { action: "insert", path: ["nodes", "$1", "children", -1], value: { id: "$2", kind: "element", tag: "td" } },
    { action: "put", path: ["nodes", "$2", "attrs", "style"], value: { padding: 8 } },
    { action: "insert", path: ["nodes", "$2", "children", -1], value: { kind: "value", value: "New Conference" } },
    // Insert second td (location)
    { action: "insert", path: ["nodes", "$1", "children", -1], value: { id: "$3", kind: "element", tag: "td" } },
    { action: "put", path: ["nodes", "$3", "attrs", "style"], value: { padding: 8 } },
    { action: "insert", path: ["nodes", "$3", "children", -1], value: { kind: "value", value: "Location" } },
];

/** Actions for "+1" button - add "1" child to sum formula */
const incrementActions: GeneralizedPatch[] = [
    // Add "1" as child of the sum formula ($0)
    { action: "insert", path: ["nodes", "$0", "children", -1], value: { kind: "value", value: "1" } },
];

/** Actions for "-1" button - add "-1" child to sum formula */
const decrementActions: GeneralizedPatch[] = [
    // Add "-1" as child of the sum formula ($0)
    { action: "insert", path: ["nodes", "$0", "children", -1], value: { kind: "value", value: "-1" } },
];

/**
 * Initialize a document with formative examples
 */
export function initializeDocument(doc: DenicekDocument): void {
    const rootId = doc.createRootNode("section");
    createFormativeExamples(doc, rootId);
}

function createFormativeExamples(doc: DenicekDocument, rootId: string): void {
    // Main container with grid layout
    const mainId = doc.addChild(rootId, el("section"));
    doc.updateAttribute(mainId, "style", { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 16 });

    // =========================================================================
    // Example 1: Counter
    // Demonstrates formulas and action buttons
    // =========================================================================
    const counterArticleId = doc.addChild(mainId, el("article"));
    doc.updateAttribute(counterArticleId, "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const counterTitleId = doc.addChild(counterArticleId, el("h2"));
    doc.addChild(counterTitleId, val("Counter"));

    const counterDescId = doc.addChild(counterArticleId, el("p"));
    doc.updateAttribute(counterDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    doc.addChild(counterDescId, val("Click +1/-1 buttons to add values to the sum formula."));

    // Counter display container
    const counterDisplayId = doc.addChild(counterArticleId, el("div"));
    doc.updateAttribute(counterDisplayId, "style", { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 });

    const counterLabelId = doc.addChild(counterDisplayId, el("span"));
    doc.updateAttribute(counterLabelId, "style", { fontWeight: 'bold' });
    doc.addChild(counterLabelId, val("Count:"));

    // The counter is a sum formula with initial value
    const counterFormulaId = doc.addChild(counterDisplayId, formula("sum"));
    doc.addChild(counterFormulaId, val("5"));

    // Counter buttons container
    const counterButtonsId = doc.addChild(counterArticleId, el("div"));
    doc.updateAttribute(counterButtonsId, "style", { display: 'flex', gap: 8 });

    // +1 button - adds "1" child to sum formula
    doc.addChild(counterButtonsId, action("+1", counterFormulaId, incrementActions));
    // -1 button - adds "-1" child to sum formula
    doc.addChild(counterButtonsId, action("-1", counterFormulaId, decrementActions));

    // =========================================================================
    // Example 2: Todo List
    // Demonstrates recording an "add item" pattern
    // =========================================================================
    const todoArticleId = doc.addChild(mainId, el("article"));
    doc.updateAttribute(todoArticleId, "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const todoTitleId = doc.addChild(todoArticleId, el("h2"));
    doc.addChild(todoTitleId, val("Todo List"));

    const todoDescId = doc.addChild(todoArticleId, el("p"));
    doc.updateAttribute(todoDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    doc.addChild(todoDescId, val("Record adding an item, then replay to add more."));

    // Todo list
    const todoListId = doc.addChild(todoArticleId, el("ul"));
    doc.updateAttribute(todoListId, "style", { listStyle: 'none', padding: 0, margin: 0 });

    // Helper to create todo items
    const createTodoItem = (text: string, checked: boolean) => {
        const liId = doc.addChild(todoListId, el("li"));
        doc.updateAttribute(liId, "style", { display: 'flex', alignItems: 'center', gap: 8, padding: 4 });
        const checkboxId = doc.addChild(liId, el("input"));
        doc.updateAttribute(checkboxId, "type", "checkbox");
        if (checked) doc.updateAttribute(checkboxId, "checked", "checked");
        doc.addChild(liId, val(text));
    };

    createTodoItem("Learn CRDTs", true);
    createTodoItem("Build MyDenicek", false);
    createTodoItem("Write documentation", false);

    // Add button container
    const todoButtonsId = doc.addChild(todoArticleId, el("div"));
    doc.updateAttribute(todoButtonsId, "style", { marginTop: 12 });
    doc.addChild(todoButtonsId, action("Add Item", todoListId, addTodoItemActions));

    // =========================================================================
    // Example 3: Hello World (Bulk Transformation)
    // Demonstrates applying transformations across multiple items
    // =========================================================================
    const helloArticleId = doc.addChild(mainId, el("article"));
    doc.updateAttribute(helloArticleId, "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const helloTitleId = doc.addChild(helloArticleId, el("h2"));
    doc.addChild(helloTitleId, val("Hello World"));

    const helloDescId = doc.addChild(helloArticleId, el("p"));
    doc.updateAttribute(helloDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    doc.addChild(helloDescId, val("Record wrapping in <strong>, then replay on each item."));

    // Word list
    const helloListId = doc.addChild(helloArticleId, el("ul"));

    const words = ["Hello", "World", "Denicek"];
    for (const word of words) {
        const liId = doc.addChild(helloListId, el("li"));
        doc.addChild(liId, val(word));
    }

    // =========================================================================
    // Example 4: Price Calculator (Formulas)
    // Demonstrates reactive computation
    // =========================================================================
    const priceArticleId = doc.addChild(mainId, el("article"));
    doc.updateAttribute(priceArticleId, "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const priceTitleId = doc.addChild(priceArticleId, el("h2"));
    doc.addChild(priceTitleId, val("Price Calculator"));

    const priceDescId = doc.addChild(priceArticleId, el("p"));
    doc.updateAttribute(priceDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    doc.addChild(priceDescId, val("Edit quantity or price values - the total updates automatically."));

    // Price inputs container
    const priceGridId = doc.addChild(priceArticleId, el("div"));
    doc.updateAttribute(priceGridId, "style", { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' });

    // Quantity row
    const qtyLabelId = doc.addChild(priceGridId, el("label"));
    doc.updateAttribute(qtyLabelId, "style", { fontWeight: 'bold' });
    doc.addChild(qtyLabelId, val("Quantity:"));
    const qtyValueId = doc.addChild(priceGridId, val("3"));

    // Price row
    const priceLabelId = doc.addChild(priceGridId, el("label"));
    doc.updateAttribute(priceLabelId, "style", { fontWeight: 'bold' });
    doc.addChild(priceLabelId, val("Price:"));
    const priceValueId = doc.addChild(priceGridId, val("25"));

    // Total row with formula
    const totalLabelId = doc.addChild(priceGridId, el("label"));
    doc.updateAttribute(totalLabelId, "style", { fontWeight: 'bold' });
    doc.addChild(totalLabelId, val("Total:"));

    // product(qty, price) formula
    const totalFormulaId = doc.addChild(priceGridId, formula("product"));
    doc.addChild(totalFormulaId, ref(qtyValueId));
    doc.addChild(totalFormulaId, ref(priceValueId));

    // =========================================================================
    // Example 5: Conference List (Schema Refactoring)
    // Demonstrates concurrent editing with CRDT conflict resolution
    // =========================================================================
    const confArticleId = doc.addChild(mainId, el("article"));
    doc.updateAttribute(confArticleId, "style", { gridColumn: 'span 2', padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const confTitleId = doc.addChild(confArticleId, el("h2"));
    doc.addChild(confTitleId, val("Conference List"));

    const confDescId = doc.addChild(confArticleId, el("p"));
    doc.updateAttribute(confDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    doc.addChild(confDescId, val("Demonstrates schema refactoring. Record adding a 'year' field to one item, then replay on others."));

    // Conference table
    const confTableId = doc.addChild(confArticleId, el("table"));
    doc.updateAttribute(confTableId, "style", { width: '100%', borderCollapse: 'collapse' });
    doc.updateAttribute(confTableId, "border", "1");

    // Table header
    const theadId = doc.addChild(confTableId, el("thead"));
    const headerRowId = doc.addChild(theadId, el("tr"));
    doc.updateAttribute(headerRowId, "style", { background: '#e9ecef' });

    const thNameId = doc.addChild(headerRowId, el("th"));
    doc.updateAttribute(thNameId, "style", { padding: 8, textAlign: 'left' });
    doc.addChild(thNameId, val("Conference"));

    const thLocId = doc.addChild(headerRowId, el("th"));
    doc.updateAttribute(thLocId, "style", { padding: 8, textAlign: 'left' });
    doc.addChild(thLocId, val("Location"));

    // Table body
    const tbodyId = doc.addChild(confTableId, el("tbody"));

    const conferences = [
        { name: "UIST", location: "Pittsburgh" },
        { name: "CHI", location: "Yokohama" },
        { name: "SPLASH", location: "Singapore" },
    ];

    for (const conf of conferences) {
        const rowId = doc.addChild(tbodyId, el("tr"));

        const tdNameId = doc.addChild(rowId, el("td"));
        doc.updateAttribute(tdNameId, "style", { padding: 8 });
        doc.addChild(tdNameId, val(conf.name));

        const tdLocId = doc.addChild(rowId, el("td"));
        doc.updateAttribute(tdLocId, "style", { padding: 8 });
        doc.addChild(tdLocId, val(conf.location));
    }

    // Action buttons
    const confButtonsId = doc.addChild(confArticleId, el("div"));
    doc.updateAttribute(confButtonsId, "style", { marginTop: 12, display: 'flex', gap: 8 });
    doc.addChild(confButtonsId, action("Add Conference", tbodyId, addConferenceActions));

    // =========================================================================
    // Example 6: Formula Showcase
    // Demonstrates all available formula operations
    // =========================================================================
    const formulaArticleId = doc.addChild(mainId, el("article"));
    doc.updateAttribute(formulaArticleId, "style", { gridColumn: 'span 2', padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const formulaTitleId = doc.addChild(formulaArticleId, el("h2"));
    doc.addChild(formulaTitleId, val("Formula Showcase"));

    const formulaDescId = doc.addChild(formulaArticleId, el("p"));
    doc.updateAttribute(formulaDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    doc.addChild(formulaDescId, val("Toggle 'Formulas/Results' in toolbar to see formula structure vs computed values."));

    // Formula grid
    const formulaGridId = doc.addChild(formulaArticleId, el("div"));
    doc.updateAttribute(formulaGridId, "style", { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 });

    // Helper to create formula boxes
    const createFormulaBox = (label: string, bgColor: string, borderColor: string) => {
        const boxId = doc.addChild(formulaGridId, el("div"));
        doc.updateAttribute(boxId, "style", { padding: 12, background: bgColor, borderRadius: 8, border: `1px solid ${borderColor}` });
        const labelId = doc.addChild(boxId, el("div"));
        doc.updateAttribute(labelId, "style", { fontWeight: 'bold', marginBottom: 8, fontSize: '0.85em' });
        doc.addChild(labelId, val(label));
        return boxId;
    };

    // String operations
    const upperBoxId = createFormulaBox("upperText", "#e8f5e9", "#a5d6a7");
    const upperValId = doc.addChild(upperBoxId, val("hello"));
    const upperFormulaId = doc.addChild(upperBoxId, formula("upperText"));
    doc.addChild(upperFormulaId, ref(upperValId));

    const lowerBoxId = createFormulaBox("lowerText", "#e8f5e9", "#a5d6a7");
    const lowerValId = doc.addChild(lowerBoxId, val("WORLD"));
    const lowerFormulaId = doc.addChild(lowerBoxId, formula("lowerText"));
    doc.addChild(lowerFormulaId, ref(lowerValId));

    const capBoxId = createFormulaBox("capitalize", "#e8f5e9", "#a5d6a7");
    const capValId = doc.addChild(capBoxId, val("denicek"));
    const capFormulaId = doc.addChild(capBoxId, formula("capitalize"));
    doc.addChild(capFormulaId, ref(capValId));

    const concatBoxId = createFormulaBox("concat", "#e8f5e9", "#a5d6a7");
    const concatFormulaId = doc.addChild(concatBoxId, formula("concat"));
    doc.addChild(concatFormulaId, val("Hello"));
    doc.addChild(concatFormulaId, val(", "));
    doc.addChild(concatFormulaId, val("World!"));

    const trimBoxId = createFormulaBox("trim", "#e8f5e9", "#a5d6a7");
    const trimValId = doc.addChild(trimBoxId, val("  spaces  "));
    const trimFormulaId = doc.addChild(trimBoxId, formula("trim"));
    doc.addChild(trimFormulaId, ref(trimValId));

    const lengthBoxId = createFormulaBox("length", "#e8f5e9", "#a5d6a7");
    const lengthValId = doc.addChild(lengthBoxId, val("Hello"));
    const lengthFormulaId = doc.addChild(lengthBoxId, formula("length"));
    doc.addChild(lengthFormulaId, ref(lengthValId));

    const replaceBoxId = createFormulaBox("replace", "#e8f5e9", "#a5d6a7");
    const replaceValId = doc.addChild(replaceBoxId, val("foo bar foo"));
    const replaceFormulaId = doc.addChild(replaceBoxId, formula("replace"));
    doc.addChild(replaceFormulaId, ref(replaceValId));
    doc.addChild(replaceFormulaId, val("foo"));
    doc.addChild(replaceFormulaId, val("baz"));

    // Math operations
    const sumBoxId = createFormulaBox("sum", "#e3f2fd", "#90caf9");
    const sumFormulaId = doc.addChild(sumBoxId, formula("sum"));
    doc.addChild(sumFormulaId, val("10"));
    doc.addChild(sumFormulaId, val("5"));
    doc.addChild(sumFormulaId, val("3"));

    const productBoxId = createFormulaBox("product", "#e3f2fd", "#90caf9");
    const productFormulaId = doc.addChild(productBoxId, formula("product"));
    doc.addChild(productFormulaId, val("2"));
    doc.addChild(productFormulaId, val("3"));
    doc.addChild(productFormulaId, val("7"));

    const modBoxId = createFormulaBox("mod", "#e3f2fd", "#90caf9");
    const modAId = doc.addChild(modBoxId, val("17"));
    const modBId = doc.addChild(modBoxId, val("5"));
    const modFormulaId = doc.addChild(modBoxId, formula("mod"));
    doc.addChild(modFormulaId, ref(modAId));
    doc.addChild(modFormulaId, ref(modBId));

    const roundBoxId = createFormulaBox("round", "#e3f2fd", "#90caf9");
    const roundValId = doc.addChild(roundBoxId, val("3.7"));
    const roundFormulaId = doc.addChild(roundBoxId, formula("round"));
    doc.addChild(roundFormulaId, ref(roundValId));

    const floorBoxId = createFormulaBox("floor", "#e3f2fd", "#90caf9");
    const floorValId = doc.addChild(floorBoxId, val("3.9"));
    const floorFormulaId = doc.addChild(floorBoxId, formula("floor"));
    doc.addChild(floorFormulaId, ref(floorValId));

    const ceilBoxId = createFormulaBox("ceil", "#e3f2fd", "#90caf9");
    const ceilValId = doc.addChild(ceilBoxId, val("3.1"));
    const ceilFormulaId = doc.addChild(ceilBoxId, formula("ceil"));
    doc.addChild(ceilFormulaId, ref(ceilValId));

    const absBoxId = createFormulaBox("abs", "#e3f2fd", "#90caf9");
    const absValId = doc.addChild(absBoxId, val("-42"));
    const absFormulaId = doc.addChild(absBoxId, formula("abs"));
    doc.addChild(absFormulaId, ref(absValId));

    // Array operations
    const splitBoxId = createFormulaBox("splitString", "#fff3e0", "#ffcc80");
    const splitValId = doc.addChild(splitBoxId, val("a,b,c,d"));
    const splitFormulaId = doc.addChild(splitBoxId, formula("splitString"));
    doc.addChild(splitFormulaId, ref(splitValId));
    doc.addChild(splitFormulaId, val(","));

    const atIndexBoxId = createFormulaBox("atIndex", "#fff3e0", "#ffcc80");
    const atIdxValId = doc.addChild(atIndexBoxId, val("apple,banana,cherry"));
    const atIdxSplitId = doc.addChild(atIndexBoxId, formula("splitString"));
    doc.addChild(atIdxSplitId, ref(atIdxValId));
    doc.addChild(atIdxSplitId, val(","));
    const atIdxFormulaId = doc.addChild(atIndexBoxId, formula("atIndex"));
    doc.addChild(atIdxFormulaId, ref(atIdxSplitId));
    doc.addChild(atIdxFormulaId, val("1"));

    const arrLenBoxId = createFormulaBox("arrayLength", "#fff3e0", "#ffcc80");
    const arrLenValId = doc.addChild(arrLenBoxId, val("one,two,three,four"));
    const arrLenSplitId = doc.addChild(arrLenBoxId, formula("splitString"));
    doc.addChild(arrLenSplitId, ref(arrLenValId));
    doc.addChild(arrLenSplitId, val(","));
    const arrLenFormulaId = doc.addChild(arrLenBoxId, formula("arrayLength"));
    doc.addChild(arrLenFormulaId, ref(arrLenSplitId));

    // Tree operation
    const countBoxId = createFormulaBox("countChildren", "#f3e5f5", "#ce93d8");
    const countDescId = doc.addChild(countBoxId, el("div"));
    doc.updateAttribute(countDescId, "style", { fontSize: '0.8em', color: '#666' });
    doc.addChild(countDescId, val("(counts todo list items)"));
    const countFormulaId = doc.addChild(countBoxId, formula("countChildren"));
    doc.addChild(countFormulaId, val(todoListId));

    // Nested formula example
    const nestedBoxId = createFormulaBox("nested: concat+capitalize", "#fce4ec", "#f48fb1");
    const firstId = doc.addChild(nestedBoxId, val("john"));
    const lastId = doc.addChild(nestedBoxId, val("doe"));
    const nestedFormulaId = doc.addChild(nestedBoxId, formula("concat"));
    const capFirstId = doc.addChild(nestedFormulaId, formula("capitalize"));
    doc.addChild(capFirstId, ref(firstId));
    doc.addChild(nestedFormulaId, val(" "));
    const capLastId = doc.addChild(nestedFormulaId, formula("capitalize"));
    doc.addChild(capLastId, ref(lastId));
}
