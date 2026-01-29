import { expect, test } from '@playwright/test';

test.describe('Recording and Replay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Record adding li with value to ul, then replay on same ul', async ({ page }) => {
    // Select an li element first from the Todo List, then navigate to parent (ul)
    const li = page.locator('li', { hasText: 'Learn CRDTs' });
    await expect(li).toBeVisible();
    await li.click();

    // Navigate to parent (ul)
    await page.locator('text=Parent').click();

    // Verify we selected the ul
    await expect(page.getByRole('cell', { name: 'ul', exact: true })).toBeVisible();

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
    await page.getByPlaceholder('Value content').fill('New Todo Item');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Verify the new item exists
    await expect(page.locator('x-value', { hasText: 'New Todo Item' })).toBeVisible();

    // Check what was recorded - should have the script in the drawer
    await expect(page.locator('text=Recorded Actions')).toBeVisible();

    // Log the recorded actions for debugging
    const actionCells = page.locator('table').filter({ hasText: 'Action' }).locator('tbody tr');
    const count = await actionCells.count();
    console.log(`Recorded ${count} actions:`);
    for (let i = 0; i < count; i++) {
      const row = actionCells.nth(i);
      // With checkboxes, the column indices shift by 1
      const action = await row.locator('td').nth(1).textContent();
      const path = await row.locator('td').nth(2).textContent();
      const value = await row.locator('td').nth(3).textContent();
      console.log(`  ${action} | ${path} | ${value}`);
    }

    // Navigate back to the ul (parent of current selection)
    await page.locator('text=Parent').click();
    await page.locator('text=Parent').click();
    await expect(page.getByRole('cell', { name: 'ul', exact: true })).toBeVisible();

    // The Apply button should be enabled (shows "Apply all" or "Apply (N)" based on selection)
    const applyButton = page.getByRole('button', { name: /Apply/ });
    await expect(applyButton).toBeEnabled();

    // Click Apply
    await applyButton.click();

    // After replay, we should have TWO "New Todo Item" values (original + replayed)
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
