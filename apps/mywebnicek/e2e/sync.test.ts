import { expect, test } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "https://krsion.github.io/mydenicek/";

test.describe("mydenicek E2E", () => {
  test("page loads and renders document from template", async ({ page }) => {
    await page.goto("./");

    // Click the "Formative Examples" template button to create a document
    await page.getByText("+ Formative Examples").click();

    // Document should render after template selection
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("two peers can sync edits via the server", async ({ browser }) => {
    // Alice creates a room from a template
    const aliceCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    await alice.goto(BASE);
    await alice.getByText("+ Formative Examples").click();
    await expect(alice.locator("h1").first()).toBeVisible({ timeout: 10_000 });

    // Get Alice's room hash from the URL
    const roomId = new URL(alice.url()).hash.slice(1);
    expect(roomId).toBeTruthy();

    // Wait for sync connection
    await expect(alice.getByText("connected")).toBeVisible({ timeout: 30_000 });

    // Bob joins the same room
    const bobCtx = await browser.newContext();
    const bob = await bobCtx.newPage();
    await bob.goto(`${BASE}#${roomId}`);
    await expect(bob.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    await expect(bob.getByText("connected")).toBeVisible({ timeout: 30_000 });

    // Wait for initial sync to settle between both peers
    await bob.waitForTimeout(3000);

    // Alice makes an edit via the command bar
    const aliceInput = alice.getByPlaceholder("/path command");
    await aliceInput.click();
    await aliceInput.fill("/header/title/text set ALICE-EDIT");
    await aliceInput.press("Enter");

    // Wait for sync — Bob should see Alice's edit
    await expect(bob.getByText("ALICE-EDIT")).toBeVisible({ timeout: 30_000 });

    // Verify Alice also sees it (use .first() since command output also contains the text)
    await expect(alice.getByText("ALICE-EDIT").first()).toBeVisible();

    await aliceCtx.close();
    await bobCtx.close();
  });
});
