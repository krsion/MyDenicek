import { expect, test } from "@playwright/test";

/**
 * Regression tests: command bar must show real event IDs (not "undefined")
 * after successful edit operations.
 */

test.describe("command bar output shows event IDs", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await page.getByText("+ Empty").click();
    await expect(page).toHaveURL(/#.+/, { timeout: 5_000 });
    await expect(page.locator("text=root")).toBeVisible({ timeout: 10_000 });
  });

  /** Helper: run a command and return the output message text */
  async function runCommand(
    page: import("@playwright/test").Page,
    command: string,
  ): Promise<string> {
    const input = page.getByPlaceholder("/path command");
    await input.click();
    await input.fill(command);
    await input.press("Enter");
    // The output appears just above the command bar; grab the last status line
    // The output message container is the sibling element before the input bar
    const outputEl = page.locator("[data-testid='command-output']");
    await expect(outputEl).toBeVisible({ timeout: 5_000 });
    return (await outputEl.textContent()) ?? "";
  }

  // Event ID format: <peer-prefix>:<counter>  e.g. "abc1234:0"
  const EVENT_ID_RE = /[a-f0-9]+:\d+/;

  test("add command shows event ID", async ({ page }) => {
    const text = await runCommand(page, "/ add name hello");
    expect(text).toContain("Added");
    expect(text).toMatch(EVENT_ID_RE);
    expect(text).not.toContain("undefined");
  });

  test("set command shows value (no undefined)", async ({ page }) => {
    await runCommand(page, "/ add name hello");
    const text = await runCommand(page, "/name set world");
    expect(text).toContain("Set");
    expect(text).toContain("world");
    expect(text).not.toContain("undefined");
  });

  test("delete command shows event ID", async ({ page }) => {
    await runCommand(page, "/ add temp value");
    const text = await runCommand(page, "/ delete temp");
    expect(text).toContain("Deleted");
    expect(text).toMatch(EVENT_ID_RE);
    expect(text).not.toContain("undefined");
  });

  test("rename command shows event ID", async ({ page }) => {
    await runCommand(page, "/ add oldName hello");
    const text = await runCommand(page, "/ rename oldName newName");
    expect(text).toContain("Renamed");
    expect(text).toMatch(EVENT_ID_RE);
    expect(text).not.toContain("undefined");
  });

  test("undo command shows event ID", async ({ page }) => {
    await runCommand(page, "/ add name hello");
    const text = await runCommand(page, "undo");
    expect(text).toContain("Undone");
    expect(text).toMatch(EVENT_ID_RE);
    expect(text).not.toContain("undefined");
  });

  test("redo command shows event ID", async ({ page }) => {
    await runCommand(page, "/ add name hello");
    await runCommand(page, "undo");
    const text = await runCommand(page, "redo");
    expect(text).toContain("Redone");
    expect(text).toMatch(EVENT_ID_RE);
    expect(text).not.toContain("undefined");
  });
});
