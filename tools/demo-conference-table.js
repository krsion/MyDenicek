/**
 * Conference Table Demo — Playwright automation script
 *
 * Run: node tools/demo-conference-table.js [url]
 *      node tools/demo-conference-table.js --auto [url]
 *
 * --auto  Auto-advance between phases (for screen recording).
 *         Without it, press ENTER in the terminal to advance.
 */

import { chromium } from "playwright";
import readline from "readline";
import fs from "fs";

const AUTO = process.argv.includes("--auto");
const explicitUrl = process.argv.slice(2).filter(a => !a.startsWith("--")).at(0);
const APP_URL = explicitUrl || "http://localhost:5173/mydenicek/";
const SLOW = 60;
const PAUSE = AUTO ? 2000 : 1200;

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

const rl = AUTO ? null : readline.createInterface({ input: process.stdin, output: process.stdout });

function waitForEnter(prompt) {
  if (AUTO) {
    console.log(`\n▶️  ${prompt}`);
    return new Promise(resolve => setTimeout(resolve, 2500));
  }
  return new Promise(resolve => {
    rl.question(`\n⏸️  ${prompt} — press ENTER to continue...`, () => resolve());
  });
}

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
  const input = page.locator('section').filter({ hasText: 'Conference List' }).locator('input').first();
  await input.click({ clickCount: 3 });
  await page.waitForTimeout(200);
  await input.type(newValue, { delay: SLOW });
  await page.waitForTimeout(200);
  await page.locator('body').click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(800);
}

async function screenshot(page, name) {
  if (AUTO) return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `demo-screenshots/${name}.png` });
  console.log(`  📸 ${name}`);
}

(async () => {
  fs.mkdirSync("demo-screenshots", { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    ...(AUTO ? { recordVideo: { dir: "demo-screenshots", size: { width: 1920, height: 1080 } } } : {}),
  });
  const page = await ctx.newPage();

  console.log("🚀 Conference Table Demo");
  console.log("   Press ENTER to advance between phases.\n");

  // ── Phase 1: Create document ────────────────────────────────────
  await waitForEnter("Phase 1: Create document from Formative Examples template");
  await page.goto(APP_URL);
  await page.waitForTimeout(2000);
  await injectCursor(page);
  await page.getByRole('button', { name: '+ Formative Examples' }).click();
  await page.waitForTimeout(3000);
  await injectCursor(page);
  await screenshot(page, "01-initial-list");

  // ── Phase 2: Refactor list → table ──────────────────────────────
  await waitForEnter("Phase 2: Refactor the flat <ul> list into a <table>");

  console.log("  Step 1: Change <ul> tag to <table>");
  await typeCommand(page, "/conferenceList/items updateTag table");
  await screenshot(page, "02-tag-table");

  console.log("  Step 2: Change <li> items to <td>");
  await typeCommand(page, "/conferenceList/items/* updateTag td");
  await screenshot(page, "03-tag-td");

  console.log("  Step 3: Wrap each <td> in a <tr> row");
  await typeCommand(page, "/conferenceList/items/* wrapList tr");
  await screenshot(page, "04-wrap-tr");

  await waitForEnter("Phase 2b: Add formula columns (split name and email)");

  console.log("  Step 4: Wrap the text field in a split-first formula (extracts name)");
  await typeCommand(page, "/conferenceList/items/*/0/text wrapRecord source split-first");
  await screenshot(page, "05-split-first");

  console.log("  Step 5: Add an empty email <td> to each row");
  await typeCommand(page, '/conferenceList/items/* insert -1 {"$tag":"td"}');
  await screenshot(page, "06-empty-td");

  console.log("  Step 6: Add split-rest formula to the email cell");
  await typeCommand(page, '/conferenceList/items/*/1 add email {"$tag":"split-rest"}');
  await screenshot(page, "07-split-rest");

  console.log("  Step 7: Add $ref source pointing to the original contact string");
  await typeCommand(page, '/conferenceList/items/*/1/email add source {"$ref":"../../../0/text/source"}');
  await screenshot(page, "08-ref-source");

  // ── Phase 3: Add speakers using the button AFTER refactoring ────
  await waitForEnter("Phase 3: Use the 'Add' button — it was recorded against the flat list!");

  const speakers = [
    "Katherine Johnson, katherine@nasa.gov",
    "Margaret Hamilton, margaret@mit.edu",
    "Grace Hopper, grace@navy.mil",
  ];

  const addBtn = page.locator('button:has-text("Add")').first();

  for (let i = 0; i < speakers.length; i++) {
    const name = speakers[i].split(",")[0];
    console.log(`  🎯 Adding "${name}"...`);
    await setInputField(page, speakers[i]);
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(PAUSE * 2);
    }
    await screenshot(page, `${9 + i}-add-${name.split(" ")[1].toLowerCase()}`);
  }

  // ── Final ───────────────────────────────────────────────────────
  await waitForEnter("Done! The button recorded against a flat list works on the table");
  await screenshot(page, "12-final");

  console.log("\n✅ Demo complete! Screenshots in demo-screenshots/");
  rl?.close();
  await page.close();
  if (AUTO) {
    const video = page.video();
    if (video) {
      const videoPath = await video.path();
      const dest = "docs/slides-assets/demo-conference-table.webm";
      fs.mkdirSync("docs/slides-assets", { recursive: true });
      fs.copyFileSync(videoPath, dest);
      console.log(`🎥 Video saved to ${dest}`);
    }
  }
  await browser.close();
})().catch(e => { console.error("❌ Demo failed:", e.message); rl?.close(); process.exit(1); });
