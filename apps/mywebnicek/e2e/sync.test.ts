import { expect, test } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "https://krsion.github.io/mydenicek/";

test.describe("mydenicek E2E", () => {
  test("page loads and renders document after entering name", async ({ page }) => {
    await page.goto("./");

    // Name prompt should appear
    await expect(page.getByPlaceholder("e.g. Alice")).toBeVisible();

    // Enter name and join
    await page.getByPlaceholder("e.g. Alice").fill("E2E-Tester");
    await page.getByRole("button", { name: "Join" }).click();

    // Document should render (wait for a heading)
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 10_000 });

    // Header should show peer name and sync status
    await expect(page.getByText("E2E-Tester")).toBeVisible();
  });

  test("two peers can sync edits via the server", async ({ browser }) => {
    const roomId = `e2e-${Date.now()}`;

    // Alice joins
    const aliceCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    await alice.goto(`${BASE}#${roomId}`);
    await alice.getByPlaceholder("e.g. Alice").fill("Alice");
    await alice.getByRole("button", { name: "Join" }).click();
    await expect(alice.locator("h2").first()).toBeVisible({ timeout: 10_000 });
    await expect(alice.getByText("connected")).toBeVisible({ timeout: 10_000 });

    // Bob joins the same room
    const bobCtx = await browser.newContext();
    const bob = await bobCtx.newPage();
    await bob.goto(`${BASE}#${roomId}`);
    await bob.getByPlaceholder("e.g. Alice").fill("Bob");
    await bob.getByRole("button", { name: "Join" }).click();
    await expect(bob.locator("h2").first()).toBeVisible({ timeout: 10_000 });
    await expect(bob.getByText("connected")).toBeVisible({ timeout: 10_000 });

    // Wait for initial sync to settle between both peers
    await bob.waitForTimeout(2000);

    // Alice makes an edit via the command bar
    const aliceInput = alice.getByPlaceholder("/path command");
    await aliceInput.click();
    await aliceInput.fill("/header/title/text set ALICE-EDIT");
    await aliceInput.press("Enter");

    // Wait for sync — Bob should see Alice's edit
    await expect(bob.getByText("ALICE-EDIT")).toBeVisible({ timeout: 15_000 });

    // Verify Alice also sees it (use .first() since command output also contains the text)
    await expect(alice.getByText("ALICE-EDIT").first()).toBeVisible();

    await aliceCtx.close();
    await bobCtx.close();
  });
});
