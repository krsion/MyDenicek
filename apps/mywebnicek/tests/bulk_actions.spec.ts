import { expect, test } from '@playwright/test';

test('Bulk Rename elements', async ({ page }) => {
  await page.goto('/');

  // Wait for the page to fully render (webkit is slower)
  await page.waitForLoadState('networkidle');

  // Use the Hello World list - find the <li> elements directly
  // The li elements contain x-value children with "Hello", "World", "Denicek"
  const helloLi = page.locator('li').filter({ has: page.locator('x-value', { hasText: 'Hello' }) });
  const worldLi = page.locator('li').filter({ has: page.locator('x-value', { hasText: 'World' }) });

  await expect(helloLi).toBeVisible({ timeout: 10000 });
  await expect(worldLi).toBeVisible();

  // Click on the li elements themselves (not the x-value children) to select element nodes
  await helloLi.click();
  await worldLi.click({ modifiers: ['Control'] });

  // Use exact match for label
  const renameBtn = page.getByLabel('Rename', { exact: true });
  await expect(renameBtn).toBeEnabled();
  await renameBtn.click();

  await page.getByPlaceholder('Tag name (e.g. div)').fill('new-item-tag');
  await page.getByPlaceholder('Tag name (e.g. div)').press('Enter');

  await expect(page.locator('new-item-tag')).toHaveCount(2);
});

test('Bulk Edit values', async ({ page }) => {
  await page.goto('/');

  // Use the Hello World list values - they contain text "Hello" and "World"
  // Find the specific x-value elements
  const helloValue = page.locator('li x-value').filter({ hasText: 'Hello' });
  const worldValue = page.locator('li x-value').filter({ hasText: 'World' });

  await expect(helloValue).toBeVisible();
  await expect(worldValue).toBeVisible();

  // Click on value nodes (not their parent elements)
  await helloValue.click();
  await worldValue.click({ modifiers: ['Control'] });

  // Wait for Edit button to appear (it shows for value nodes)
  const editBtn = page.getByLabel('Edit', { exact: true });
  await expect(editBtn).toBeVisible({ timeout: 10000 });
  await expect(editBtn).toBeEnabled();
  await editBtn.click();

  const input = page.getByPlaceholder('Value content');
  await expect(input).toBeVisible();
  await input.fill('UpdatedValue');
  await input.press('Enter');

  // After bulk edit, both values should be updated
  await expect(page.locator('li x-value', { hasText: 'UpdatedValue' })).toHaveCount(2, { timeout: 10000 });
});
