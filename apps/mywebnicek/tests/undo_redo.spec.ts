import { expect, test } from '@playwright/test';

test('Undo/Redo adds and removes a node', async ({ page }) => {
  await page.goto('/');

  // Wait for document to load and select a node
  await expect(page.locator('[data-node-guid]').first()).toBeVisible({ timeout: 10000 });
  const rootNode = page.locator('[data-node-guid]').first();
  await rootNode.click();

  // Add a container tag node
  await page.getByLabel('Add child').click();
  await page.getByPlaceholder('Tag name (e.g. div)').fill('my-container');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // Add a child value node
  await page.getByLabel('Add child').click();
  await page.getByRole('radio', { name: 'Value' }).check();
  await page.getByPlaceholder('Value content (optional)').fill('test-value-content');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // Verify value exists
  await expect(page.locator('x-value').filter({ hasText: 'test-value-content' })).toBeVisible();

  // Undo (removes value node)
  await page.getByLabel('Undo').click();
  await expect(page.locator('x-value').filter({ hasText: 'test-value-content' })).not.toBeVisible();

  // Redo (adds value back)
  await page.getByLabel('Redo').click();
  await expect(page.locator('x-value').filter({ hasText: 'test-value-content' })).toBeVisible();
});
