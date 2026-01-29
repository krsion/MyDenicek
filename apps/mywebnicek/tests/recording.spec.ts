import { expect, test } from '@playwright/test';

test.describe('Recording and Replay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // TODO: This test is skipped due to DOM click selection issues.
  // When clicking on container elements like <ul>, child elements capture the click,
  // making it difficult to reliably select the parent container.
  // The core recording/replay functionality is tested in DenicekDocument.test.ts.
  test.skip('Record adding li with value to ul, then replay on same ul', async ({ page }) => {
    // Find and click directly on the ul element in the Todo List article
    // The ul is the list container with listStyle: 'none'
    const todoArticle = page.locator('article', { hasText: 'Todo List' });
    const ul = todoArticle.locator('ul');
    await expect(ul).toBeVisible();
    await ul.click();

    // Verify we selected the ul - look for "ul" in the Tag row of details table
    await expect(page.locator('td', { hasText: 'ul' }).first()).toBeVisible({ timeout: 5000 });

    // Clear any existing history first
    await page.getByLabel('Clear Actions').click();

    // Recording is always on - just perform actions

    // Add a new li child
    await page.getByRole('button', { name: 'Add element' }).click();
    await page.getByPlaceholder('Tag name (e.g. div)').fill('li');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Now we should have the new li selected, add a value child to it
    await page.getByRole('button', { name: 'Add element' }).click();
    await page.getByRole('radio', { name: 'Value' }).check();
    await page.getByPlaceholder('Value content (optional)').fill('New Todo Item');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Verify the new item exists
    await expect(page.locator('x-value', { hasText: 'New Todo Item' })).toBeVisible();

    // Check what was recorded - should have the script in the drawer
    await expect(page.locator('text=Recorded Actions')).toBeVisible();

    // Wait a moment for React state to update
    await page.waitForTimeout(100);

    // Check the recorded actions table - it now has "Details" column
    const actionTable = page.locator('table').filter({ hasText: 'Details' });
    const actionRows = actionTable.locator('tbody tr');
    const count = await actionRows.count();
    console.log(`Recorded ${count} actions:`);

    // Log each action for debugging
    for (let i = 0; i < count; i++) {
      const row = actionRows.nth(i);
      const text = await row.textContent();
      console.log(`  Row ${i}: ${text}`);
    }

    // Should have recorded at least the insert actions
    expect(count).toBeGreaterThan(0);

    // Click directly on the ul again to select it for replay
    await ul.click();

    // Verify we're at the ul
    await expect(page.locator('td', { hasText: 'ul' }).first()).toBeVisible({ timeout: 5000 });

    // The Apply button should be enabled (shows "Apply all" or "Apply (N)" based on selection)
    const applyButton = page.getByRole('button', { name: /Apply/ });
    await expect(applyButton).toBeEnabled();

    // Click Apply
    await applyButton.click();

    // After replay, we should have TWO "New Todo Item" values (original + replayed)
    await page.waitForTimeout(100);
    const itemCount = await page.locator('x-value', { hasText: 'New Todo Item' }).count();
    console.log(`Found ${itemCount} "New Todo Item" items after replay`);

    expect(itemCount).toBe(2);

    // Also verify both items are inside <li> elements, not <div>
    const liWithNewTodo = page.locator('li x-value', { hasText: 'New Todo Item' });
    const liCount = await liWithNewTodo.count();
    console.log(`Found ${liCount} "New Todo Item" items inside <li> elements`);
    expect(liCount).toBe(2);
  });
});
