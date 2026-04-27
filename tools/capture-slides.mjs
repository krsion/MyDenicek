// Playwright script to capture hi-res screenshots for the presentation
// with all 3 panels open and complex multi-peer history
import { chromium } from "playwright";

const SYNC_URL = "http://localhost:5173/mydenicek/";
const OUT = "docs/slides-assets";
const VIEWPORT = { width: 1280, height: 720 };
const DPR = 2; // 2x for 2560x1440 output

async function waitForSync(page, ms = 1500) {
  await page.waitForTimeout(ms);
}

async function typeCommand(page, cmd) {
  const input = page.locator('input[placeholder*="path command"]');
  await input.fill(cmd);
  await input.press("Enter");
  await page.waitForTimeout(500);
}

async function ensureAllPanelsOn(page) {
  // Check each panel button - if it's NOT highlighted (active), click it
  for (const label of ["Document", "Raw JSON", "Event Graph"]) {
    const btn = page.getByRole("button", { name: label, exact: true });
    // Active buttons have a specific background; we check by CSS class or style
    const isActive = await btn.evaluate((el) => {
      const style = getComputedStyle(el);
      // Active buttons typically have a colored background
      return (
        style.backgroundColor !== "rgb(255, 255, 255)" &&
        style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        style.backgroundColor !== "transparent"
      );
    });
    if (!isActive) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Create 4 peer contexts with 2x DPR
  const contexts = [];
  const pages = [];
  for (let i = 0; i < 4; i++) {
    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DPR,
    });
    contexts.push(ctx);
    pages.push(await ctx.newPage());
  }

  // Peer 0 (Alice): Create formative examples
  console.log("Peer 0: Creating formative examples...");
  await pages[0].goto(SYNC_URL);
  await pages[0].waitForTimeout(1000);
  await pages[0].getByRole("button", { name: "+ Formative Examples" }).click();
  await pages[0].waitForTimeout(2000);

  // Get room ID from URL hash
  const roomId = new URL(pages[0].url()).hash.slice(1);
  console.log(`Room: ${roomId}`);

  // Connect peers 1-3 to the same room
  for (let i = 1; i < 4; i++) {
    console.log(`Peer ${i}: Connecting to room ${roomId}...`);
    await pages[i].goto(`${SYNC_URL}#${roomId}`);
    await pages[i].waitForTimeout(2000);
  }

  // Ensure all peers have synced
  await waitForSync(pages[0], 2000);

  // Now make concurrent edits from all 4 peers using Promise.all
  console.log("Making concurrent edits from all 4 peers...");

  // Round 1: concurrent structural edits
  await Promise.all([
    // Alice: wrap conference list into table
    typeCommand(
      pages[0],
      "/conferences/speakers/* wrapRecord row"
    ),
    // Bob: add a new speaker to the list
    typeCommand(
      pages[1],
      "/conferences/speakers pushBack {name: 'Bob Smith', email: 'bob@example.com'}"
    ),
    // Carol: increment the counter
    typeCommand(pages[2], "/counter/value/right set 5"),
    // Dave: change the title
    typeCommand(pages[3], '/header/title/text set "MyDenicek Demo"'),
  ]);
  await waitForSync(pages[0], 2000);

  // Round 2: more concurrent edits
  await Promise.all([
    typeCommand(
      pages[0],
      "/conferences/speakers pushBack {name: 'Carol Lee', email: 'carol@test.org'}"
    ),
    typeCommand(pages[1], "/counter/value/right set 10"),
    typeCommand(
      pages[2],
      '/header/subtitle/text set "Collaborative editing with CRDTs"'
    ),
    typeCommand(
      pages[3],
      "/conferences/speakers pushBack {name: 'Dave Kim', email: 'dave@uni.edu'}"
    ),
  ]);
  await waitForSync(pages[0], 2000);

  // Round 3: more concurrent edits for richer graph
  await Promise.all([
    typeCommand(pages[0], "/counter/value/right set 20"),
    typeCommand(
      pages[1],
      "/conferences/speakers pushBack {name: 'Eve Chen', email: 'eve@lab.io'}"
    ),
    typeCommand(pages[2], "/counter/value/left set 100"),
    typeCommand(
      pages[3],
      "/conferences/speakers pushBack {name: 'Frank Wu', email: 'frank@org.net'}"
    ),
  ]);
  await waitForSync(pages[0], 3000);

  console.log("Taking screenshots...");

  // Ensure all 3 panels are on for peer 0
  await ensureAllPanelsOn(pages[0]);
  await pages[0].waitForTimeout(500);

  // Screenshot 1: Full view with all 3 panels and complex graph (main background)
  // Scroll the event graph to show branching
  const graphPanel = pages[0].locator(".event-graph-panel, [class*=graph]").first();
  try {
    // Try to scroll the graph to show branching area
    await pages[0].evaluate(() => {
      const svgs = document.querySelectorAll("svg");
      for (const svg of svgs) {
        if (svg.clientHeight > 200) {
          // This is likely the event graph
          svg.scrollTop = svg.scrollHeight * 0.4;
        }
      }
      // Also try scrollable containers near the graph
      const containers = document.querySelectorAll('[style*="overflow"]');
      for (const c of containers) {
        if (c.scrollHeight > c.clientHeight && c.querySelector("svg")) {
          c.scrollTop = c.scrollHeight * 0.4;
        }
      }
    });
  } catch (e) {
    console.log("Could not scroll graph:", e.message);
  }
  await pages[0].waitForTimeout(500);

  await pages[0].screenshot({
    path: `${OUT}/slide-bg-all-panels.png`,
    type: "png",
  });
  console.log("Captured: slide-bg-all-panels.png");

  // Screenshot 2: Alice's view after her structural edits (for concurrent editing slide)
  await ensureAllPanelsOn(pages[0]);
  await pages[0].screenshot({
    path: `${OUT}/slide-alice-view.png`,
    type: "png",
  });
  console.log("Captured: slide-alice-view.png");

  // Screenshot 3: Bob's view
  await ensureAllPanelsOn(pages[1]);
  await pages[1].screenshot({
    path: `${OUT}/slide-bob-view.png`,
    type: "png",
  });
  console.log("Captured: slide-bob-view.png");

  // Get event count from peer 0
  const stats = await pages[0].evaluate(() => {
    const statsEl = document.querySelector('[class*="stats"], [class*="event"]');
    return document.body.innerText.match(/Events:\s*\d+/)?.[0] || "unknown";
  });
  console.log(`Stats: ${stats}`);

  // Close
  for (const ctx of contexts) await ctx.close();
  await browser.close();
  console.log("Done!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
