import { expect, test } from '@playwright/test';

test('history sidebar shows actions', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  await page.goto('');

  // Wait for document load
  await expect(page.locator('[data-node-guid]').first()).toBeVisible({ timeout: 10000 });

  // Select root node
  const rootNode = page.locator('[data-node-guid]').first();
  await rootNode.click();

  // Check if Sidebar is visible via content
  const sidebarHeader = page.getByText("Recorded Actions");

  if (!await sidebarHeader.isVisible()) {
      // Toggle it
       await page.getByRole('button', { name: "Actions", exact: true }).click();
  }
  await expect(sidebarHeader).toBeVisible();

  // Perform Rename Action
  // Rename button only active if selection is element (Root usually is)
  const renameButton = page.getByLabel("Rename");
  await expect(renameButton).toBeEnabled();
  await renameButton.click();

  // Popover should appear
  const input = page.getByPlaceholder("Tag name (e.g. div)");
  await input.fill('section-test');
  await input.press('Enter');

  // Verify History
  // It should be visible in the sidebar (which is open)
  // Look for "put" action and "section-test" value
  // Depending on RecordedScriptView implementation (Table cells)

  // Wait a bit for update
  await page.waitForTimeout(1000);

  // sidebar variable already defined above
  await expect(sidebarHeader).toBeVisible();

  // Check that the history table shows the action
  // The table has columns: Action, Path, Value
  // Use first() since there may be multiple 'put' actions from the initial document creation
  await expect(page.getByRole('cell', { name: 'put', exact: true }).first()).toBeVisible();
  // The value is JSON stringified, so it appears with quotes
  await expect(page.getByText('"section-test"')).toBeVisible();
});
