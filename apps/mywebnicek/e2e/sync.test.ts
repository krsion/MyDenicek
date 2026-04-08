import { expect, test } from "@playwright/test";

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
    await alice.goto(`https://krsion.github.io/mydenicek/#${roomId}`);
    await alice.getByPlaceholder("e.g. Alice").fill("Alice");
    await alice.getByRole("button", { name: "Join" }).click();
    await expect(alice.locator("h2").first()).toBeVisible({ timeout: 10_000 });
    await expect(alice.getByText("connected")).toBeVisible({ timeout: 10_000 });

    // Bob joins the same room
    const bobCtx = await browser.newContext();
    const bob = await bobCtx.newPage();
    await bob.goto(`https://krsion.github.io/mydenicek/#${roomId}`);
    await bob.getByPlaceholder("e.g. Alice").fill("Bob");
    await bob.getByRole("button", { name: "Join" }).click();
    await expect(bob.locator("h2").first()).toBeVisible({ timeout: 10_000 });
    await expect(bob.getByText("connected")).toBeVisible({ timeout: 10_000 });

    // Alice makes an edit via the command bar
    const aliceInput = alice.getByPlaceholder("Type a command");
    await aliceInput.click();
    await aliceInput.fill("add / e2e-proof");
    await aliceInput.press("Enter");

    // Wait for sync — Bob should see Alice's edit
    await expect(bob.getByText("e2e-proof")).toBeVisible({ timeout: 15_000 });

    // Verify Alice also sees it
    await expect(alice.getByText("e2e-proof")).toBeVisible();

    await aliceCtx.close();
    await bobCtx.close();
  });
});
