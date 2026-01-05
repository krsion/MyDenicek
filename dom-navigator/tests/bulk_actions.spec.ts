import { expect, test } from '@playwright/test';

test('Bulk Rename elements', async ({ page }) => {
  await page.goto('http://localhost:5173/');

  const box1Value = page.locator('x-value', { hasText: 'Box 1' });
  const box2Value = page.locator('x-value', { hasText: 'Box 2' });
  
  await expect(box1Value).toBeVisible();
  await expect(box2Value).toBeVisible();

  const box1 = box1Value.locator('xpath=..');
  const box2 = box2Value.locator('xpath=..');

  await box1.click();
  await box2.click({ modifiers: ['Control'] });

  // Use exact match for label
  const renameBtn = page.getByLabel('Rename', { exact: true });
  await expect(renameBtn).toBeEnabled();
  await renameBtn.click();
  
  await page.getByPlaceholder('Tag name (e.g. div)').fill('new-box-tag');
  await page.getByPlaceholder('Tag name (e.g. div)').press('Enter');

  await expect(page.locator('new-box-tag')).toHaveCount(2);
});

test('Bulk Edit values', async ({ page }) => {
  await page.goto('http://localhost:5173/');

  const text1 = page.locator('x-value', { hasText: 'Box 1' });
  const text2 = page.locator('x-value', { hasText: 'Box 2' });

  await text1.click();
  await text2.click({ modifiers: ['Control'] });

  const editBtn = page.getByLabel('Edit', { exact: true });
  await expect(editBtn).toBeVisible();
  await expect(editBtn).toBeEnabled();
  await editBtn.click();

  const input = page.getByPlaceholder('Value content');
  await expect(input).toBeVisible();
  await input.fill('Updated Box');
  await input.press('Enter');

  await expect(page.locator('x-value', { hasText: 'Updated Box' })).toHaveCount(2);
});
