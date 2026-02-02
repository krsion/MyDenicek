/**
 * Default document initialization for the web app
 *
 * This creates formative examples from the specification that demonstrate
 * the end-user programming model of Denicek.
 */

import type { DenicekDocument, GeneralizedPatch, NodeInput } from "@mydenicek/core";

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

/** Add a single child and return its ID (throws if creation fails) */
const add = (doc: DenicekDocument, parentId: string, child: NodeInput): string => {
    const [id] = doc.addChildren(parentId, [child]);
    if (!id) throw new Error("Failed to create node");
    return id;
};

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
    const mainId = add(doc, rootId, el("section"));
    doc.updateAttribute([mainId], "style", { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 16 });

    // =========================================================================
    // Example 1: Counter
    // Demonstrates formulas and action buttons
    // =========================================================================
    const counterArticleId = add(doc, mainId, el("article"));
    doc.updateAttribute([counterArticleId], "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const counterTitleId = add(doc, counterArticleId, el("h2"));
    add(doc, counterTitleId, val("Counter"));

    const counterDescId = add(doc, counterArticleId, el("p"));
    doc.updateAttribute([counterDescId], "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    add(doc, counterDescId, val("Click +1/-1 buttons to add values to the sum formula."));

    // Counter display container
    const counterDisplayId = add(doc, counterArticleId, el("div"));
    doc.updateAttribute([counterDisplayId], "style", { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 });

    const counterLabelId = add(doc, counterDisplayId, el("span"));
    doc.updateAttribute([counterLabelId], "style", { fontWeight: 'bold' });
    add(doc, counterLabelId, val("Count:"));

    // The counter is a sum formula with initial value
    const counterFormulaId = add(doc, counterDisplayId, formula("sum"));
    add(doc, counterFormulaId, val("5"));

    // Counter buttons container
    const counterButtonsId = add(doc, counterArticleId, el("div"));
    doc.updateAttribute([counterButtonsId], "style", { display: 'flex', gap: 8 });

    // +1/-1 buttons - add values to sum formula
    doc.addChildren(counterButtonsId, [
        action("+1", counterFormulaId, incrementActions),
        action("-1", counterFormulaId, decrementActions),
    ]);

    // =========================================================================
    // Example 2: Todo List
    // Demonstrates recording an "add item" pattern
    // =========================================================================
    const todoArticleId = add(doc, mainId, el("article"));
    doc.updateAttribute([todoArticleId], "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const todoTitleId = add(doc, todoArticleId, el("h2"));
    add(doc, todoTitleId, val("Todo List"));

    const todoDescId = add(doc, todoArticleId, el("p"));
    doc.updateAttribute([todoDescId], "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    add(doc, todoDescId, val("Record adding an item, then replay to add more."));

    // Todo list
    const todoListId = add(doc, todoArticleId, el("ul"));
    doc.updateAttribute([todoListId], "style", { listStyle: 'none', padding: 0, margin: 0 });

    // Helper to create todo items
    const createTodoItem = (text: string, checked: boolean) => {
        const liId = add(doc, todoListId, el("li"));
        doc.updateAttribute([liId], "style", { display: 'flex', alignItems: 'center', gap: 8, padding: 4 });
        const checkboxId = add(doc, liId, el("input"));
        doc.updateAttribute([checkboxId], "type", "checkbox");
        if (checked) doc.updateAttribute([checkboxId], "checked", "checked");
        add(doc, liId, val(text));
    };

    createTodoItem("Learn CRDTs", true);
    createTodoItem("Build MyDenicek", false);
    createTodoItem("Write documentation", false);

    // Add button container
    const todoButtonsId = add(doc, todoArticleId, el("div"));
    doc.updateAttribute([todoButtonsId], "style", { marginTop: 12 });
    add(doc, todoButtonsId, action("Add Item", todoListId, addTodoItemActions));

    // =========================================================================
    // Example 3: Hello World (Bulk Transformation)
    // Demonstrates applying transformations across multiple items
    // =========================================================================
    const helloArticleId = add(doc, mainId, el("article"));
    doc.updateAttribute([helloArticleId], "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const helloTitleId = add(doc, helloArticleId, el("h2"));
    add(doc, helloTitleId, val("Hello World"));

    const helloDescId = add(doc, helloArticleId, el("p"));
    doc.updateAttribute([helloDescId], "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    add(doc, helloDescId, val("Record wrapping in <strong>, then replay on each item."));

    // Word list
    const helloListId = add(doc, helloArticleId, el("ul"));

    const words = ["Hello", "World", "Denicek"];
    for (const word of words) {
        const liId = add(doc, helloListId, el("li"));
        add(doc, liId, val(word));
    }

    // =========================================================================
    // Example 4: Price Calculator (Formulas)
    // Demonstrates reactive computation
    // =========================================================================
    const priceArticleId = add(doc, mainId, el("article"));
    doc.updateAttribute([priceArticleId], "style", { padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const priceTitleId = add(doc, priceArticleId, el("h2"));
    add(doc, priceTitleId, val("Price Calculator"));

    const priceDescId = add(doc, priceArticleId, el("p"));
    doc.updateAttribute([priceDescId], "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    add(doc, priceDescId, val("Edit quantity or price values - the total updates automatically."));

    // Price inputs container
    const priceGridId = add(doc, priceArticleId, el("div"));
    doc.updateAttribute([priceGridId], "style", { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' });

    // Quantity row
    const qtyLabelId = add(doc, priceGridId, el("label"));
    doc.updateAttribute([qtyLabelId], "style", { fontWeight: 'bold' });
    add(doc, qtyLabelId, val("Quantity:"));
    const qtyValueId = add(doc, priceGridId, val("3"));

    // Price row
    const priceLabelId = add(doc, priceGridId, el("label"));
    doc.updateAttribute([priceLabelId], "style", { fontWeight: 'bold' });
    add(doc, priceLabelId, val("Price:"));
    const priceValueId = add(doc, priceGridId, val("25"));

    // Total row with formula
    const totalLabelId = add(doc, priceGridId, el("label"));
    doc.updateAttribute([totalLabelId], "style", { fontWeight: 'bold' });
    add(doc, totalLabelId, val("Total:"));

    // product(qty, price) formula
    const totalFormulaId = add(doc, priceGridId, formula("product"));
    doc.addChildren(totalFormulaId, [ref(qtyValueId), ref(priceValueId)]);

    // =========================================================================
    // Example 5: Conference List (Schema Refactoring)
    // Demonstrates concurrent editing with CRDT conflict resolution
    // =========================================================================
    const confArticleId = add(doc, mainId, el("article"));
    doc.updateAttribute([confArticleId], "style", { gridColumn: 'span 2', padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const confTitleId = add(doc, confArticleId, el("h2"));
    add(doc, confTitleId, val("Conference List"));

    const confDescId = add(doc, confArticleId, el("p"));
    doc.updateAttribute([confDescId], "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    add(doc, confDescId, val("Demonstrates schema refactoring. Record adding a 'year' field to one item, then replay on others."));

    // Conference table
    const confTableId = add(doc, confArticleId, el("table"));
    doc.updateAttribute([confTableId], "style", { width: '100%', borderCollapse: 'collapse' });
    doc.updateAttribute([confTableId], "border", "1");

    // Table header
    const theadId = add(doc, confTableId, el("thead"));
    const headerRowId = add(doc, theadId, el("tr"));
    doc.updateAttribute([headerRowId], "style", { background: '#e9ecef' });

    const thNameId = add(doc, headerRowId, el("th"));
    doc.updateAttribute([thNameId], "style", { padding: 8, textAlign: 'left' });
    add(doc, thNameId, val("Conference"));

    const thLocId = add(doc, headerRowId, el("th"));
    doc.updateAttribute([thLocId], "style", { padding: 8, textAlign: 'left' });
    add(doc, thLocId, val("Location"));

    // Table body
    const tbodyId = add(doc, confTableId, el("tbody"));

    const conferences = [
        { name: "UIST", location: "Pittsburgh" },
        { name: "CHI", location: "Yokohama" },
        { name: "SPLASH", location: "Singapore" },
    ];

    for (const conf of conferences) {
        const rowId = add(doc, tbodyId, el("tr"));

        const tdNameId = add(doc, rowId, el("td"));
        doc.updateAttribute([tdNameId], "style", { padding: 8 });
        add(doc, tdNameId, val(conf.name));

        const tdLocId = add(doc, rowId, el("td"));
        doc.updateAttribute([tdLocId], "style", { padding: 8 });
        add(doc, tdLocId, val(conf.location));
    }

    // Action buttons
    const confButtonsId = add(doc, confArticleId, el("div"));
    doc.updateAttribute([confButtonsId], "style", { marginTop: 12, display: 'flex', gap: 8 });
    add(doc, confButtonsId, action("Add Conference", tbodyId, addConferenceActions));

    // =========================================================================
    // Example 6: Formula Showcase
    // Demonstrates all available formula operations
    // =========================================================================
    const formulaArticleId = add(doc, mainId, el("article"));
    doc.updateAttribute([formulaArticleId], "style", { gridColumn: 'span 2', padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' });

    const formulaTitleId = add(doc, formulaArticleId, el("h2"));
    add(doc, formulaTitleId, val("Formula Showcase"));

    const formulaDescId = add(doc, formulaArticleId, el("p"));
    doc.updateAttribute([formulaDescId], "style", { fontSize: '0.9em', color: '#666', marginBottom: 12 });
    add(doc, formulaDescId, val("Toggle 'Formulas/Results' in toolbar to see formula structure vs computed values."));

    // Formula grid
    const formulaGridId = add(doc, formulaArticleId, el("div"));
    doc.updateAttribute([formulaGridId], "style", { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 });

    // Helper to create formula boxes
    const createFormulaBox = (label: string, bgColor: string, borderColor: string) => {
        const boxId = add(doc, formulaGridId, el("div"));
        doc.updateAttribute([boxId], "style", { padding: 12, background: bgColor, borderRadius: 8, border: `1px solid ${borderColor}` });
        const labelId = add(doc, boxId, el("div"));
        doc.updateAttribute([labelId], "style", { fontWeight: 'bold', marginBottom: 8, fontSize: '0.85em' });
        add(doc, labelId, val(label));
        return boxId;
    };

    // String operations
    const upperBoxId = createFormulaBox("upperText", "#e8f5e9", "#a5d6a7");
    const upperValId = add(doc, upperBoxId, val("hello"));
    const upperFormulaId = add(doc, upperBoxId, formula("upperText"));
    add(doc, upperFormulaId, ref(upperValId));

    const lowerBoxId = createFormulaBox("lowerText", "#e8f5e9", "#a5d6a7");
    const lowerValId = add(doc, lowerBoxId, val("WORLD"));
    const lowerFormulaId = add(doc, lowerBoxId, formula("lowerText"));
    add(doc, lowerFormulaId, ref(lowerValId));

    const capBoxId = createFormulaBox("capitalize", "#e8f5e9", "#a5d6a7");
    const capValId = add(doc, capBoxId, val("denicek"));
    const capFormulaId = add(doc, capBoxId, formula("capitalize"));
    add(doc, capFormulaId, ref(capValId));

    const concatBoxId = createFormulaBox("concat", "#e8f5e9", "#a5d6a7");
    const concatFormulaId = add(doc, concatBoxId, formula("concat"));
    doc.addChildren(concatFormulaId, [val("Hello"), val(", "), val("World!")]);

    const trimBoxId = createFormulaBox("trim", "#e8f5e9", "#a5d6a7");
    const trimValId = add(doc, trimBoxId, val("  spaces  "));
    const trimFormulaId = add(doc, trimBoxId, formula("trim"));
    add(doc, trimFormulaId, ref(trimValId));

    const lengthBoxId = createFormulaBox("length", "#e8f5e9", "#a5d6a7");
    const lengthValId = add(doc, lengthBoxId, val("Hello"));
    const lengthFormulaId = add(doc, lengthBoxId, formula("length"));
    add(doc, lengthFormulaId, ref(lengthValId));

    const replaceBoxId = createFormulaBox("replace", "#e8f5e9", "#a5d6a7");
    const replaceValId = add(doc, replaceBoxId, val("foo bar foo"));
    const replaceFormulaId = add(doc, replaceBoxId, formula("replace"));
    doc.addChildren(replaceFormulaId, [ref(replaceValId), val("foo"), val("baz")]);

    // Math operations
    const sumBoxId = createFormulaBox("sum", "#e3f2fd", "#90caf9");
    const sumFormulaId = add(doc, sumBoxId, formula("sum"));
    doc.addChildren(sumFormulaId, [val("10"), val("5"), val("3")]);

    const productBoxId = createFormulaBox("product", "#e3f2fd", "#90caf9");
    const productFormulaId = add(doc, productBoxId, formula("product"));
    doc.addChildren(productFormulaId, [val("2"), val("3"), val("7")]);

    const modBoxId = createFormulaBox("mod", "#e3f2fd", "#90caf9");
    const [modAId, modBId] = doc.addChildren(modBoxId, [val("17"), val("5")]);
    const modFormulaId = add(doc, modBoxId, formula("mod"));
    doc.addChildren(modFormulaId, [ref(modAId!), ref(modBId!)]);

    const roundBoxId = createFormulaBox("round", "#e3f2fd", "#90caf9");
    const roundValId = add(doc, roundBoxId, val("3.7"));
    const roundFormulaId = add(doc, roundBoxId, formula("round"));
    add(doc, roundFormulaId, ref(roundValId));

    const floorBoxId = createFormulaBox("floor", "#e3f2fd", "#90caf9");
    const floorValId = add(doc, floorBoxId, val("3.9"));
    const floorFormulaId = add(doc, floorBoxId, formula("floor"));
    add(doc, floorFormulaId, ref(floorValId));

    const ceilBoxId = createFormulaBox("ceil", "#e3f2fd", "#90caf9");
    const ceilValId = add(doc, ceilBoxId, val("3.1"));
    const ceilFormulaId = add(doc, ceilBoxId, formula("ceil"));
    add(doc, ceilFormulaId, ref(ceilValId));

    const absBoxId = createFormulaBox("abs", "#e3f2fd", "#90caf9");
    const absValId = add(doc, absBoxId, val("-42"));
    const absFormulaId = add(doc, absBoxId, formula("abs"));
    add(doc, absFormulaId, ref(absValId));

    // Array operations
    const splitBoxId = createFormulaBox("splitString", "#fff3e0", "#ffcc80");
    const splitValId = add(doc, splitBoxId, val("a,b,c,d"));
    const splitFormulaId = add(doc, splitBoxId, formula("splitString"));
    doc.addChildren(splitFormulaId, [ref(splitValId), val(",")]);

    const atIndexBoxId = createFormulaBox("atIndex", "#fff3e0", "#ffcc80");
    const atIdxValId = add(doc, atIndexBoxId, val("apple,banana,cherry"));
    const atIdxSplitId = add(doc, atIndexBoxId, formula("splitString"));
    doc.addChildren(atIdxSplitId, [ref(atIdxValId), val(",")]);
    const atIdxFormulaId = add(doc, atIndexBoxId, formula("atIndex"));
    doc.addChildren(atIdxFormulaId, [ref(atIdxSplitId), val("1")]);

    const arrLenBoxId = createFormulaBox("arrayLength", "#fff3e0", "#ffcc80");
    const arrLenValId = add(doc, arrLenBoxId, val("one,two,three,four"));
    const arrLenSplitId = add(doc, arrLenBoxId, formula("splitString"));
    doc.addChildren(arrLenSplitId, [ref(arrLenValId), val(",")]);
    const arrLenFormulaId = add(doc, arrLenBoxId, formula("arrayLength"));
    add(doc, arrLenFormulaId, ref(arrLenSplitId));

    // Tree operation
    const countBoxId = createFormulaBox("countChildren", "#f3e5f5", "#ce93d8");
    const countDescId = add(doc, countBoxId, el("div"));
    doc.updateAttribute([countDescId], "style", { fontSize: '0.8em', color: '#666' });
    add(doc, countDescId, val("(counts todo list items)"));
    const countFormulaId = add(doc, countBoxId, formula("countChildren"));
    add(doc, countFormulaId, val(todoListId));

    // Nested formula example
    const nestedBoxId = createFormulaBox("nested: concat+capitalize", "#fce4ec", "#f48fb1");
    const [firstId, lastId] = doc.addChildren(nestedBoxId, [val("john"), val("doe")]);
    const nestedFormulaId = add(doc, nestedBoxId, formula("concat"));
    const capFirstId = add(doc, nestedFormulaId, formula("capitalize"));
    add(doc, capFirstId, ref(firstId!));
    add(doc, nestedFormulaId, val(" "));
    const capLastId = add(doc, nestedFormulaId, formula("capitalize"));
    add(doc, capLastId, ref(lastId!));
}
