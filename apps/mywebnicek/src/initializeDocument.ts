/**
 * Default document initialization for the web app
 *
 * This creates formative examples from the specification that demonstrate
 * the end-user programming model of Denicek.
 */

import type { DenicekModel, GeneralizedPatch } from "@mydenicek/core";

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

/** Actions for "+1" button - wrap value in plus formula */
const incrementActions: GeneralizedPatch[] = [
    // Insert formula as sibling before $0
    { action: "insert", path: ["nodes", "$0", "sibling", "before"], value: { id: "$1", kind: "formula", operation: "plus" } },
    // Move $0 into the formula as first child
    { action: "move", path: ["nodes", "$0"], value: { parentId: "$1", index: 0 } },
    // Add "1" as second child of formula
    { action: "insert", path: ["nodes", "$1", "children", -1], value: { kind: "value", value: "1" } },
];

/** Actions for "-1" button - wrap value in minus formula */
const decrementActions: GeneralizedPatch[] = [
    // Insert formula as sibling before $0
    { action: "insert", path: ["nodes", "$0", "sibling", "before"], value: { id: "$1", kind: "formula", operation: "minus" } },
    // Move $0 into the formula as first child
    { action: "move", path: ["nodes", "$0"], value: { parentId: "$1", index: 0 } },
    // Add "1" as second child of formula
    { action: "insert", path: ["nodes", "$1", "children", -1], value: { kind: "value", value: "1" } },
];

/**
 * Initialize a document with formative examples
 */
export function initializeDocument(model: DenicekModel): void {
    const rootId = model.createRootNode("section");
    createFormativeExamples(model, rootId);
}

function createFormativeExamples(model: DenicekModel, rootId: string): void {
    // Main container with grid layout
    const mainId = model.addChild(rootId, el("section"));
    model.updateAttribute(mainId, "style", { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 16 });

    // =========================================================================
    // Example 1: Counter
    // Demonstrates formulas and action buttons
    // =========================================================================
    const counterArticleId = model.addChild(mainId, el("article"));
    model.updateAttribute(counterArticleId, "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const counterTitleId = model.addChild(counterArticleId, el("h2"));
    model.addChild(counterTitleId, val("Counter"));

    const counterDescId = model.addChild(counterArticleId, el("p"));
    model.updateAttribute(counterDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    model.addChild(counterDescId, val("Click +1/-1 buttons to wrap the value in a formula."));

    // Counter display container
    const counterDisplayId = model.addChild(counterArticleId, el("div"));
    model.updateAttribute(counterDisplayId, "style", { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 });

    const counterLabelId = model.addChild(counterDisplayId, el("span"));
    model.updateAttribute(counterLabelId, "style", { fontWeight: 'bold' });
    model.addChild(counterLabelId, val("Count:"));

    // The counter value node
    const counterValueId = model.addChild(counterDisplayId, val("5"));

    // Counter buttons container
    const counterButtonsId = model.addChild(counterArticleId, el("div"));
    model.updateAttribute(counterButtonsId, "style", { display: 'flex', gap: 8 });

    // +1 button - wraps target in plus formula
    model.addChild(counterButtonsId, action("+1", counterValueId, incrementActions));
    // -1 button - wraps target in minus formula
    model.addChild(counterButtonsId, action("-1", counterValueId, decrementActions));

    // =========================================================================
    // Example 2: Todo List
    // Demonstrates recording an "add item" pattern
    // =========================================================================
    const todoArticleId = model.addChild(mainId, el("article"));
    model.updateAttribute(todoArticleId, "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const todoTitleId = model.addChild(todoArticleId, el("h2"));
    model.addChild(todoTitleId, val("Todo List"));

    const todoDescId = model.addChild(todoArticleId, el("p"));
    model.updateAttribute(todoDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    model.addChild(todoDescId, val("Record adding an item, then replay to add more."));

    // Todo list
    const todoListId = model.addChild(todoArticleId, el("ul"));
    model.updateAttribute(todoListId, "style", { listStyle: 'none', padding: 0, margin: 0 });

    // Helper to create todo items
    const createTodoItem = (text: string, checked: boolean) => {
        const liId = model.addChild(todoListId, el("li"));
        model.updateAttribute(liId, "style", { display: 'flex', alignItems: 'center', gap: 8, padding: 4 });
        const checkboxId = model.addChild(liId, el("input"));
        model.updateAttribute(checkboxId, "type", "checkbox");
        if (checked) model.updateAttribute(checkboxId, "checked", "checked");
        model.addChild(liId, val(text));
    };

    createTodoItem("Learn CRDTs", true);
    createTodoItem("Build MyDenicek", false);
    createTodoItem("Write documentation", false);

    // Add button container
    const todoButtonsId = model.addChild(todoArticleId, el("div"));
    model.updateAttribute(todoButtonsId, "style", { marginTop: 12 });
    model.addChild(todoButtonsId, action("Add Item", todoListId, addTodoItemActions));

    // =========================================================================
    // Example 3: Hello World (Bulk Transformation)
    // Demonstrates applying transformations across multiple items
    // =========================================================================
    const helloArticleId = model.addChild(mainId, el("article"));
    model.updateAttribute(helloArticleId, "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const helloTitleId = model.addChild(helloArticleId, el("h2"));
    model.addChild(helloTitleId, val("Hello World"));

    const helloDescId = model.addChild(helloArticleId, el("p"));
    model.updateAttribute(helloDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    model.addChild(helloDescId, val("Record wrapping in <strong>, then replay on each item."));

    // Word list
    const helloListId = model.addChild(helloArticleId, el("ul"));

    const words = ["Hello", "World", "Denicek"];
    for (const word of words) {
        const liId = model.addChild(helloListId, el("li"));
        model.addChild(liId, val(word));
    }

    // =========================================================================
    // Example 4: Price Calculator (Formulas)
    // Demonstrates reactive computation
    // =========================================================================
    const priceArticleId = model.addChild(mainId, el("article"));
    model.updateAttribute(priceArticleId, "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const priceTitleId = model.addChild(priceArticleId, el("h2"));
    model.addChild(priceTitleId, val("Price Calculator"));

    const priceDescId = model.addChild(priceArticleId, el("p"));
    model.updateAttribute(priceDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    model.addChild(priceDescId, val("Edit quantity or price values - the total updates automatically."));

    // Price inputs container
    const priceGridId = model.addChild(priceArticleId, el("div"));
    model.updateAttribute(priceGridId, "style", { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' });

    // Quantity row
    const qtyLabelId = model.addChild(priceGridId, el("label"));
    model.updateAttribute(qtyLabelId, "style", { fontWeight: 'bold' });
    model.addChild(qtyLabelId, val("Quantity:"));
    const qtyValueId = model.addChild(priceGridId, val("3"));

    // Price row
    const priceLabelId = model.addChild(priceGridId, el("label"));
    model.updateAttribute(priceLabelId, "style", { fontWeight: 'bold' });
    model.addChild(priceLabelId, val("Price:"));
    const priceValueId = model.addChild(priceGridId, val("25"));

    // Total row with formula
    const totalLabelId = model.addChild(priceGridId, el("label"));
    model.updateAttribute(totalLabelId, "style", { fontWeight: 'bold' });
    model.addChild(totalLabelId, val("Total:"));

    // multiply(qty, price) formula
    const totalFormulaId = model.addChild(priceGridId, formula("multiply"));
    model.addChild(totalFormulaId, ref(qtyValueId));
    model.addChild(totalFormulaId, ref(priceValueId));

    // =========================================================================
    // Example 5: Conference List (Schema Refactoring)
    // Demonstrates concurrent editing with CRDT conflict resolution
    // =========================================================================
    const confArticleId = model.addChild(mainId, el("article"));
    model.updateAttribute(confArticleId, "style", { gridColumn: 'span 2', padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const confTitleId = model.addChild(confArticleId, el("h2"));
    model.addChild(confTitleId, val("Conference List"));

    const confDescId = model.addChild(confArticleId, el("p"));
    model.updateAttribute(confDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    model.addChild(confDescId, val("Demonstrates schema refactoring. Record adding a 'year' field to one item, then replay on others."));

    // Conference table
    const confTableId = model.addChild(confArticleId, el("table"));
    model.updateAttribute(confTableId, "style", { width: '100%', borderCollapse: 'collapse' });
    model.updateAttribute(confTableId, "border", "1");

    // Table header
    const theadId = model.addChild(confTableId, el("thead"));
    const headerRowId = model.addChild(theadId, el("tr"));
    model.updateAttribute(headerRowId, "style", { background: '#e9ecef' });

    const thNameId = model.addChild(headerRowId, el("th"));
    model.updateAttribute(thNameId, "style", { padding: 8, textAlign: 'left' });
    model.addChild(thNameId, val("Conference"));

    const thLocId = model.addChild(headerRowId, el("th"));
    model.updateAttribute(thLocId, "style", { padding: 8, textAlign: 'left' });
    model.addChild(thLocId, val("Location"));

    // Table body
    const tbodyId = model.addChild(confTableId, el("tbody"));

    const conferences = [
        { name: "UIST", location: "Pittsburgh" },
        { name: "CHI", location: "Yokohama" },
        { name: "SPLASH", location: "Singapore" },
    ];

    for (const conf of conferences) {
        const rowId = model.addChild(tbodyId, el("tr"));

        const tdNameId = model.addChild(rowId, el("td"));
        model.updateAttribute(tdNameId, "style", { padding: 8 });
        model.addChild(tdNameId, val(conf.name));

        const tdLocId = model.addChild(rowId, el("td"));
        model.updateAttribute(tdLocId, "style", { padding: 8 });
        model.addChild(tdLocId, val(conf.location));
    }

    // Action buttons
    const confButtonsId = model.addChild(confArticleId, el("div"));
    model.updateAttribute(confButtonsId, "style", { marginTop: 12, display: 'flex', gap: 8 });
    model.addChild(confButtonsId, action("Add Conference", tbodyId, addConferenceActions));

    // =========================================================================
    // Example 6: Formula Showcase
    // Demonstrates all available formula operations
    // =========================================================================
    const formulaArticleId = model.addChild(mainId, el("article"));
    model.updateAttribute(formulaArticleId, "style", { gridColumn: 'span 2', padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const formulaTitleId = model.addChild(formulaArticleId, el("h2"));
    model.addChild(formulaTitleId, val("Formula Showcase"));

    const formulaDescId = model.addChild(formulaArticleId, el("p"));
    model.updateAttribute(formulaDescId, "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    model.addChild(formulaDescId, val("Toggle 'Formulas/Results' in toolbar to see formula structure vs computed values."));

    // Formula grid
    const formulaGridId = model.addChild(formulaArticleId, el("div"));
    model.updateAttribute(formulaGridId, "style", { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 });

    // Helper to create formula boxes
    const createFormulaBox = (label: string, bgColor: string, borderColor: string) => {
        const boxId = model.addChild(formulaGridId, el("div"));
        model.updateAttribute(boxId, "style", { padding: 12, background: bgColor, borderRadius: 8, border: `1px solid ${borderColor}` });
        const labelId = model.addChild(boxId, el("div"));
        model.updateAttribute(labelId, "style", { fontWeight: 'bold', marginBottom: 8, fontSize: '0.85em' });
        model.addChild(labelId, val(label));
        return boxId;
    };

    // String operations
    const upperBoxId = createFormulaBox("upperText", "#e8f5e9", "#a5d6a7");
    const upperValId = model.addChild(upperBoxId, val("hello"));
    const upperFormulaId = model.addChild(upperBoxId, formula("upperText"));
    model.addChild(upperFormulaId, ref(upperValId));

    const lowerBoxId = createFormulaBox("lowerText", "#e8f5e9", "#a5d6a7");
    const lowerValId = model.addChild(lowerBoxId, val("WORLD"));
    const lowerFormulaId = model.addChild(lowerBoxId, formula("lowerText"));
    model.addChild(lowerFormulaId, ref(lowerValId));

    const capBoxId = createFormulaBox("capitalize", "#e8f5e9", "#a5d6a7");
    const capValId = model.addChild(capBoxId, val("denicek"));
    const capFormulaId = model.addChild(capBoxId, formula("capitalize"));
    model.addChild(capFormulaId, ref(capValId));

    const concatBoxId = createFormulaBox("concat", "#e8f5e9", "#a5d6a7");
    const concatFormulaId = model.addChild(concatBoxId, formula("concat"));
    model.addChild(concatFormulaId, val("Hello"));
    model.addChild(concatFormulaId, val(", "));
    model.addChild(concatFormulaId, val("World!"));

    const trimBoxId = createFormulaBox("trim", "#e8f5e9", "#a5d6a7");
    const trimValId = model.addChild(trimBoxId, val("  spaces  "));
    const trimFormulaId = model.addChild(trimBoxId, formula("trim"));
    model.addChild(trimFormulaId, ref(trimValId));

    const lengthBoxId = createFormulaBox("length", "#e8f5e9", "#a5d6a7");
    const lengthValId = model.addChild(lengthBoxId, val("Hello"));
    const lengthFormulaId = model.addChild(lengthBoxId, formula("length"));
    model.addChild(lengthFormulaId, ref(lengthValId));

    const replaceBoxId = createFormulaBox("replace", "#e8f5e9", "#a5d6a7");
    const replaceValId = model.addChild(replaceBoxId, val("foo bar foo"));
    const replaceFormulaId = model.addChild(replaceBoxId, formula("replace"));
    model.addChild(replaceFormulaId, ref(replaceValId));
    model.addChild(replaceFormulaId, val("foo"));
    model.addChild(replaceFormulaId, val("baz"));

    // Math operations
    const plusBoxId = createFormulaBox("plus", "#e3f2fd", "#90caf9");
    const plusAId = model.addChild(plusBoxId, val("10"));
    const plusBId = model.addChild(plusBoxId, val("5"));
    const plusFormulaId = model.addChild(plusBoxId, formula("plus"));
    model.addChild(plusFormulaId, ref(plusAId));
    model.addChild(plusFormulaId, ref(plusBId));

    const minusBoxId = createFormulaBox("minus", "#e3f2fd", "#90caf9");
    const minusAId = model.addChild(minusBoxId, val("100"));
    const minusBId = model.addChild(minusBoxId, val("37"));
    const minusFormulaId = model.addChild(minusBoxId, formula("minus"));
    model.addChild(minusFormulaId, ref(minusAId));
    model.addChild(minusFormulaId, ref(minusBId));

    const multiplyBoxId = createFormulaBox("multiply", "#e3f2fd", "#90caf9");
    const mulAId = model.addChild(multiplyBoxId, val("7"));
    const mulBId = model.addChild(multiplyBoxId, val("6"));
    const mulFormulaId = model.addChild(multiplyBoxId, formula("multiply"));
    model.addChild(mulFormulaId, ref(mulAId));
    model.addChild(mulFormulaId, ref(mulBId));

    const divideBoxId = createFormulaBox("divide", "#e3f2fd", "#90caf9");
    const divAId = model.addChild(divideBoxId, val("84"));
    const divBId = model.addChild(divideBoxId, val("4"));
    const divFormulaId = model.addChild(divideBoxId, formula("divide"));
    model.addChild(divFormulaId, ref(divAId));
    model.addChild(divFormulaId, ref(divBId));

    const modBoxId = createFormulaBox("mod", "#e3f2fd", "#90caf9");
    const modAId = model.addChild(modBoxId, val("17"));
    const modBId = model.addChild(modBoxId, val("5"));
    const modFormulaId = model.addChild(modBoxId, formula("mod"));
    model.addChild(modFormulaId, ref(modAId));
    model.addChild(modFormulaId, ref(modBId));

    const roundBoxId = createFormulaBox("round", "#e3f2fd", "#90caf9");
    const roundValId = model.addChild(roundBoxId, val("3.7"));
    const roundFormulaId = model.addChild(roundBoxId, formula("round"));
    model.addChild(roundFormulaId, ref(roundValId));

    const floorBoxId = createFormulaBox("floor", "#e3f2fd", "#90caf9");
    const floorValId = model.addChild(floorBoxId, val("3.9"));
    const floorFormulaId = model.addChild(floorBoxId, formula("floor"));
    model.addChild(floorFormulaId, ref(floorValId));

    const ceilBoxId = createFormulaBox("ceil", "#e3f2fd", "#90caf9");
    const ceilValId = model.addChild(ceilBoxId, val("3.1"));
    const ceilFormulaId = model.addChild(ceilBoxId, formula("ceil"));
    model.addChild(ceilFormulaId, ref(ceilValId));

    const absBoxId = createFormulaBox("abs", "#e3f2fd", "#90caf9");
    const absValId = model.addChild(absBoxId, val("-42"));
    const absFormulaId = model.addChild(absBoxId, formula("abs"));
    model.addChild(absFormulaId, ref(absValId));

    // Array operations
    const splitBoxId = createFormulaBox("splitString", "#fff3e0", "#ffcc80");
    const splitValId = model.addChild(splitBoxId, val("a,b,c,d"));
    const splitFormulaId = model.addChild(splitBoxId, formula("splitString"));
    model.addChild(splitFormulaId, ref(splitValId));
    model.addChild(splitFormulaId, val(","));

    const atIndexBoxId = createFormulaBox("atIndex", "#fff3e0", "#ffcc80");
    const atIdxValId = model.addChild(atIndexBoxId, val("apple,banana,cherry"));
    const atIdxSplitId = model.addChild(atIndexBoxId, formula("splitString"));
    model.addChild(atIdxSplitId, ref(atIdxValId));
    model.addChild(atIdxSplitId, val(","));
    const atIdxFormulaId = model.addChild(atIndexBoxId, formula("atIndex"));
    model.addChild(atIdxFormulaId, ref(atIdxSplitId));
    model.addChild(atIdxFormulaId, val("1"));

    const arrLenBoxId = createFormulaBox("arrayLength", "#fff3e0", "#ffcc80");
    const arrLenValId = model.addChild(arrLenBoxId, val("one,two,three,four"));
    const arrLenSplitId = model.addChild(arrLenBoxId, formula("splitString"));
    model.addChild(arrLenSplitId, ref(arrLenValId));
    model.addChild(arrLenSplitId, val(","));
    const arrLenFormulaId = model.addChild(arrLenBoxId, formula("arrayLength"));
    model.addChild(arrLenFormulaId, ref(arrLenSplitId));

    // Tree operation
    const countBoxId = createFormulaBox("countChildren", "#f3e5f5", "#ce93d8");
    const countDescId = model.addChild(countBoxId, el("div"));
    model.updateAttribute(countDescId, "style", { fontSize: '0.8em', color: '#666' });
    model.addChild(countDescId, val("(counts todo list items)"));
    const countFormulaId = model.addChild(countBoxId, formula("countChildren"));
    model.addChild(countFormulaId, val(todoListId));

    // Nested formula example
    const nestedBoxId = createFormulaBox("nested: concat+capitalize", "#fce4ec", "#f48fb1");
    const firstId = model.addChild(nestedBoxId, val("john"));
    const lastId = model.addChild(nestedBoxId, val("doe"));
    const nestedFormulaId = model.addChild(nestedBoxId, formula("concat"));
    const capFirstId = model.addChild(nestedFormulaId, formula("capitalize"));
    model.addChild(capFirstId, ref(firstId));
    model.addChild(nestedFormulaId, val(" "));
    const capLastId = model.addChild(nestedFormulaId, formula("capitalize"));
    model.addChild(capLastId, ref(lastId));
}
