/**
 * Conference Table Demo — Playwright automation script
 *
 * Run: node tools/demo-conference-table.ts [url]
 * Default URL: http://localhost:5173/mydenicek/
 */

const { chromium } = require("playwright");

const APP_URL = process.argv[2] || "http://localhost:5173/mydenicek/";
const SLOW = 60;
const PAUSE = 1500;

const CURSOR_CSS = `
  * { cursor: none !important; }
  body::after {
    content: '';
    position: fixed;
    width: 24px; height: 24px;
    border-radius: 50%;
    background: rgba(255, 30, 30, 0.6);
    border: 3px solid #e00;
    box-shadow: 0 0 8px rgba(255, 0, 0, 0.4);
    pointer-events: none;
    z-index: 999999;
    transform: translate(-50%, -50%);
    left: var(--mouse-x, -100px);
    top: var(--mouse-y, -100px);
    transition: left 0.05s, top 0.05s;
  }
`;
const CURSOR_JS = `
  document.addEventListener('mousemove', e => {
    document.body.style.setProperty('--mouse-x', e.clientX + 'px');
    document.body.style.setProperty('--mouse-y', e.clientY + 'px');
  });
`;

async function injectCursor(page) {
  await page.addStyleTag({ content: CURSOR_CSS });
  await page.addScriptTag({ content: CURSOR_JS });
}

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

async function setInputField(page, newValue) {
  // Find the Conference List input by looking near the "Add" button
  const input = page.locator('section').filter({ hasText: 'Conference List' }).locator('input').first();
  await input.click({ clickCount: 3 }); // triple-click to select all
  await page.waitForTimeout(200);
  await input.type(newValue, { delay: SLOW });
  await page.waitForTimeout(200);
  // Blur to commit the value
  await page.locator('body').click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(800);
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
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  console.log("🚀 Conference Table Demo\n");

  // ── Phase 1: Create document ────────────────────────────────────
  console.log("Phase 1: Create document from template");
  await page.goto(APP_URL);
  await page.waitForTimeout(2000);
  await injectCursor(page);
  await page.click('button:has-text("+ Formative Examples")');
  await page.waitForTimeout(3000);
  await injectCursor(page);
  await screenshot(page, "01-initial-list");

  // ── Phase 2: Refactor list → table ──────────────────────────────
  console.log("\nPhase 2: Refactor list → table with formulas");

  console.log("  updateTag ul → table");
  await typeCommand(page, "/conferenceList/items updateTag table");
  await screenshot(page, "02-tag-table");

  console.log("  updateTag li → td");
  await typeCommand(page, "/conferenceList/items/* updateTag td");
  await screenshot(page, "03-tag-td");

  console.log("  wrapList td → tr[td]");
  await typeCommand(page, "/conferenceList/items/* wrapList tr");
  await screenshot(page, "04-wrap-tr");

  console.log("  wrapRecord text → split-first formula");
  await typeCommand(page, "/conferenceList/items/*/0/text wrapRecord source split-first");
  await screenshot(page, "05-split-first");

  console.log("  insert email column with split-rest");
  await typeCommand(
    page,
    '/conferenceList/items/* insert -1 {"$tag":"td","email":{"$tag":"split-rest","source":{"$ref":"../../../0/text/source"}}}',
  );
  await screenshot(page, "06-table-done");

  // ── Phase 3: Add speakers using the button AFTER refactoring ────
  const speakers = [
    "Katherine Johnson, katherine@nasa.gov",
    "Margaret Hamilton, margaret@mit.edu",
    "Grace Hopper, grace@navy.mil",
  ];

  const addBtn = page.locator('button:has-text("Add")').first();

  for (let i = 0; i < speakers.length; i++) {
    const name = speakers[i].split(",")[0];
    console.log(`\n🎯 Phase 3.${i + 1}: Adding "${name}"`);

    // Click the input field, clear it, type the new speaker name
    await setInputField(page, speakers[i]);

    // Click the Add button
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(PAUSE * 2);
    }
    await screenshot(page, `${7 + i}-add-${name.split(" ")[1].toLowerCase()}`);
  }

  // ── Final ───────────────────────────────────────────────────────
  console.log("\nPhase 4: Final state — 5 speakers in the table");
  await screenshot(page, "10-final");

  console.log("\n✅ Demo complete! Screenshots in demo-screenshots/");
  await page.waitForTimeout(3000);
  await browser.close();
})().catch(e => { console.error("❌ Demo failed:", e.message); process.exit(1); });
