/**
 * Conference Table Demo — Playwright automation script
 *
 * Demonstrates the full workflow of the mydenicek CRDT system:
 * 1. Create a conference list document from template
 * 2. The "Add" button is pre-recorded (programming by demonstration)
 * 3. Refactor the flat list into a table with formula columns
 * 4. Use the SAME button after refactoring — it still works!
 *
 * Run: node tools/demo-conference-table.ts [url]
 * Default URL: http://localhost:5173/mydenicek/
 */

const { chromium } = require("playwright");

const APP_URL = process.argv[2] || "http://localhost:5173/mydenicek/";
const SLOW = 80;
const PAUSE = 1200;

async function typeCommand(page, command) {
  const input = page.locator('input[placeholder*="path command"]');
  await input.click();
  await input.fill("");
  await page.waitForTimeout(200);
  await input.type(command, { delay: SLOW });
  await page.waitForTimeout(300);
  await input.press("Enter");
  await page.waitForTimeout(PAUSE);
}

async function screenshot(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `demo-screenshots/${name}.png` });
  console.log(`  📸 ${name}`);
}

(async () => {
  const fs = require("fs");
  fs.mkdirSync("demo-screenshots", { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();

  console.log("🚀 Conference Table Demo\n");

  // ── Load and create document ────────────────────────────────────
  console.log("Phase 0: Setup");
  await page.goto(APP_URL);
  await page.waitForTimeout(2000);
  await page.click('button:has-text("+ Formative Examples")');
  await page.waitForTimeout(3000);
  await screenshot(page, "01-initial");

  // ── Show the flat list ──────────────────────────────────────────
  console.log("\nPhase 1: The Conference List (flat <ul>)");
  await typeCommand(page, "/conferenceList/items tree");
  await screenshot(page, "02-list-tree");

  // ── Use the Add button to add a speaker (list phase) ───────────
  console.log("\nPhase 2: Add a speaker via the button");
  const addBtn = page.locator('button:has-text("Add")').first();
  if (await addBtn.isVisible()) {
    await addBtn.click();
    await page.waitForTimeout(PAUSE);
  }
  await screenshot(page, "03-after-add");

  // ── Refactor: list → table with formulas ────────────────────────
  console.log("\nPhase 3: Refactor list → table");
  console.log("  updateTag ul → table");
  await typeCommand(page, "/conferenceList/items updateTag table");
  await screenshot(page, "04-tag-table");

  console.log("  updateTag li → td");
  await typeCommand(page, "/conferenceList/items/* updateTag td");
  await screenshot(page, "05-tag-td");

  console.log("  wrapList td → tr[td]");
  await typeCommand(page, "/conferenceList/items/* wrapList tr");
  await screenshot(page, "06-wrap-tr");

  console.log("  wrapRecord text → split-first formula");
  await typeCommand(page, "/conferenceList/items/*/0/text wrapRecord source split-first");
  await screenshot(page, "07-split-first");

  console.log("  insert email column with split-rest");
  await typeCommand(
    page,
    '/conferenceList/items/* insert -1 {"$tag":"td","email":{"$tag":"split-rest","source":{"$ref":"../../../0/text/source"}}}',
  );
  await screenshot(page, "08-split-rest");

  // ── Verify formulas ─────────────────────────────────────────────
  console.log("\nPhase 4: Verify formulas");
  await typeCommand(page, "/conferenceList/items/0/0/text get");
  await screenshot(page, "09-name-result");
  await typeCommand(page, "/conferenceList/items/0/1/email get");
  await screenshot(page, "10-email-result");

  // ── THE DEMO: Add speakers AFTER refactoring ─────────────────────
  // The button was recorded against a flat <ul>/<li> list.
  // After 5 structural edits turned it into a <table> with formulas,
  // the button STILL WORKS — producing correct table rows.

  const speakers = [
    "Katherine Johnson, katherine@nasa.gov",
    "Margaret Hamilton, margaret@mit.edu",
    "Grace Hopper, grace@navy.mil",
  ];

  for (let i = 0; i < speakers.length; i++) {
    console.log(`\n🎯 Phase 5.${i + 1}: Adding "${speakers[i].split(",")[0]}" via the button`);
    // Change the input field to a new speaker
    await typeCommand(page, `/conferenceList/composer/input/value set ${speakers[i]}`);
    // Click Add — the button replays its recorded edits, retargeted through the refactoring
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(PAUSE * 2);
    }
    await screenshot(page, `${11 + i}-add-${speakers[i].split(",")[0].split(" ")[1].toLowerCase()}`);
  }

  console.log("\nPhase 6: Final state — 5 speakers in the table, all with formulas");
  await typeCommand(page, "/conferenceList/items tree");
  await screenshot(page, "14-final-tree");

  console.log("\n✅ Demo complete! Screenshots in demo-screenshots/");
  await page.waitForTimeout(3000);
  await browser.close();
})().catch(e => { console.error("❌ Demo failed:", e.message); process.exit(1); });
