import { expect, test } from '@playwright/test';

test('Undo/Redo adds and removes a node', async ({ page }) => {
  await page.goto('http://localhost:5173/');

  // Wait for initial content and select a container (article)
  const article = page.locator('article').first();
  await expect(article).toBeVisible();
  await article.click();

  // Add a container tag node
  await page.getByRole('button', { name: 'Add element' }).click();
  await page.getByPlaceholder('Tag name (e.g. div)').fill('my-container');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // Add a child value node
  await page.getByRole('button', { name: 'Add element' }).click();
  await page.getByLabel('Value').check();
  await page.getByPlaceholder('Value content').fill('test-value-content');
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
