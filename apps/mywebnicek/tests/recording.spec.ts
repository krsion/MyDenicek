import { expect, test } from '@playwright/test';

test.describe('Recording and Replay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Record adding li with value to ul, then replay on same ul', async ({ page }) => {
    // Select an li element first, then navigate to parent (ul)
    const li = page.locator('li', { hasText: 'Item A1' });
    await expect(li).toBeVisible();
    await li.click();

    // Navigate to parent (ul)
    await page.locator('text=Parent').click();
    
    // Verify we selected the ul
    await expect(page.getByRole('cell', { name: 'ul', exact: true })).toBeVisible();

    // Start recording
    await page.getByRole('button', { name: 'Record' }).click();
    await expect(page.getByRole('button', { name: 'Stop Recording' })).toBeVisible();

    // Add a new li child
    await page.getByRole('button', { name: 'Add element' }).click();
    await page.getByPlaceholder('Tag name (e.g. div)').fill('li');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Now we should have the new li selected, add a value child to it
    await page.getByRole('button', { name: 'Add element' }).click();
    await page.getByRole('radio', { name: 'Value' }).check();
    await page.getByPlaceholder('Value content').fill('Item A xx');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Verify the new item exists
    await expect(page.locator('x-value', { hasText: 'Item A xx' })).toBeVisible();

    // Stop recording
    await page.getByRole('button', { name: 'Stop Recording' }).click();

    // Check what was recorded - should have the script in the drawer
    await expect(page.locator('text=Recorded Script')).toBeVisible();
    
    // Log the recorded actions for debugging
    const actionCells = page.locator('table').filter({ hasText: 'Action' }).locator('tbody tr');
    const count = await actionCells.count();
    console.log(`Recorded ${count} actions:`);
    for (let i = 0; i < count; i++) {
      const row = actionCells.nth(i);
      const action = await row.locator('td').nth(0).textContent();
      const path = await row.locator('td').nth(1).textContent();
      const value = await row.locator('td').nth(2).textContent();
      console.log(`  ${action} | ${path} | ${value}`);
    }

    // Navigate back to the ul (parent of current selection)
    await page.locator('text=Parent').click();
    await page.locator('text=Parent').click();
    await expect(page.getByRole('cell', { name: 'ul', exact: true })).toBeVisible();
    
    // The replay button should be enabled
    await expect(page.getByRole('button', { name: 'Replay' })).toBeEnabled();
    
    // Click Replay
    await page.getByRole('button', { name: 'Replay' }).click();

    // After replay, we should have TWO "Item A xx" values (original + replayed)
    // But this will likely fail due to the $1 mapping issue
    const itemCount = await page.locator('x-value', { hasText: 'Item A xx' }).count();
    console.log(`Found ${itemCount} "Item A xx" items after replay`);
    
    expect(itemCount).toBe(2);
    
    // Also verify both items are inside <li> elements, not <div>
    const liWithItemAxx = page.locator('li x-value', { hasText: 'Item A xx' });
    const liCount = await liWithItemAxx.count();
    console.log(`Found ${liCount} "Item A xx" items inside <li> elements`);
    expect(liCount).toBe(2);
  });
});
