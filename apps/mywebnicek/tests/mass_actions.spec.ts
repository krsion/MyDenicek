import { expect, test } from '@playwright/test';

test.describe('Mass Actions (Generalized Transformations)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Rename all - renames all li elements when selecting li items with Shift+click', async ({ page }) => {
    // Select first and second li elements with Shift+click to trigger generalized selection
    const item1 = page.locator('x-value', { hasText: 'Item A1' });
    const item2 = page.locator('x-value', { hasText: 'Item A2' });
    await expect(item1).toBeVisible();
    await expect(item2).toBeVisible();
    
    // Click on the li parents
    const li1 = item1.locator('xpath=..');
    const li2 = item2.locator('xpath=..');
    await li1.click();
    await li2.click({ modifiers: ['Shift'] }); // Shift+click triggers generalized selection
    
    // Click "Rename all" button (should now be visible)
    const renameAllBtn = page.getByLabel('Rename all matching', { exact: true });
    await expect(renameAllBtn).toBeEnabled();
    await renameAllBtn.click();
    
    // Wait for popover and enter new tag name - the input should have placeholder or initial value
    const popoverInput = page.locator('.fui-PopoverSurface input');
    await expect(popoverInput).toBeVisible();
    await popoverInput.fill('list-item');
    await popoverInput.press('Enter');
    
    // Wait for popover to close
    await expect(popoverInput).not.toBeVisible();
    
    // All li elements in the first ul should be renamed to list-item
    // There are 3 li items in Article A's ul
    await expect(page.locator('ul > list-item')).toHaveCount(3);
  });

  test('Regular click shows Rename button (not Rename all)', async ({ page }) => {
    // Select a single element with regular click
    const item1 = page.locator('x-value', { hasText: 'Item A1' });
    await expect(item1).toBeVisible();
    
    const li1 = item1.locator('xpath=..');
    await li1.click();
    
    // "Rename" button should be visible
    const renameBtn = page.getByLabel('Rename', { exact: true });
    await expect(renameBtn).toBeEnabled();
    
    // "Rename all" button should NOT be visible
    const renameAllBtn = page.getByLabel('Rename all matching', { exact: true });
    await expect(renameAllBtn).not.toBeVisible();
  });

  test('Ctrl+click multi-select shows Rename button (not Rename all)', async ({ page }) => {
    // Select two li items at same depth with Ctrl+click (regular multi-select, not generalized)
    const item1 = page.locator('x-value', { hasText: 'Item A1' });
    const item2 = page.locator('x-value', { hasText: 'Item A2' });
    
    await expect(item1).toBeVisible();
    await expect(item2).toBeVisible();
    
    const li1 = item1.locator('xpath=..');
    const li2 = item2.locator('xpath=..');
    
    // Multi-select with Ctrl+Click (not Shift)
    await li1.click();
    await li2.click({ modifiers: ['Control'] });
    
    // "Rename" button should be visible
    const renameBtn = page.getByLabel('Rename', { exact: true });
    await expect(renameBtn).toBeEnabled();
    
    // "Rename all" button should NOT be visible
    const renameAllBtn = page.getByLabel('Rename all matching', { exact: true });
    await expect(renameAllBtn).not.toBeVisible();
  });

  test('Wrap all - wraps li elements with Shift+click selection', async ({ page }) => {
    // Select two li elements with Shift+click to trigger generalized selection
    const item1 = page.locator('x-value', { hasText: 'Item A1' });
    const item2 = page.locator('x-value', { hasText: 'Item A2' });
    await expect(item1).toBeVisible();
    await expect(item2).toBeVisible();
    
    // Get the li parents and Shift+click
    const li1 = item1.locator('xpath=..');
    const li2 = item2.locator('xpath=..');
    await li1.click();
    await li2.click({ modifiers: ['Shift'] });
    
    // Click "Wrap all" button
    const wrapAllBtn = page.getByLabel('Wrap all matching', { exact: true });
    await expect(wrapAllBtn).toBeEnabled();
    await wrapAllBtn.click();
    
    // Enter wrapper tag name in the popover
    const popoverInput = page.locator('.fui-PopoverSurface input');
    await expect(popoverInput).toBeVisible();
    await popoverInput.fill('li-wrapper');
    await popoverInput.press('Enter');
    
    // Wait for popover to close
    await expect(popoverInput).not.toBeVisible();
    
    // All 3 li elements should now be wrapped
    await expect(page.locator('li-wrapper > li')).toHaveCount(3);
  });

  test('Wrap all - wraps h2 elements with Shift+click on two articles', async ({ page }) => {
    // Select h2 from first and second article with Shift+click
    const h2_articleA = page.locator('h2', { hasText: 'Article A' });
    const h2_articleB = page.locator('h2', { hasText: 'Article B' });
    await expect(h2_articleA).toBeVisible();
    await expect(h2_articleB).toBeVisible();
    await h2_articleA.click();
    await h2_articleB.click({ modifiers: ['Shift'] });
    
    // Click "Wrap all" button
    const wrapAllBtn = page.getByLabel('Wrap all matching', { exact: true });
    await expect(wrapAllBtn).toBeEnabled();
    await wrapAllBtn.click();
    
    // Enter wrapper tag name in popover
    const popoverInput = page.locator('.fui-PopoverSurface input');
    await expect(popoverInput).toBeVisible();
    await popoverInput.fill('heading-wrapper');
    await popoverInput.press('Enter');
    
    // Multiple h2 elements should be wrapped
    await expect(page.locator('article heading-wrapper > h2').first()).toBeVisible();
  });

  test.skip('Rename all shows initial value based on selected element tag', async ({ page }) => {
    // Select two p elements with Shift+click
    const paragraph1 = page.locator('p', { hasText: 'Lorem ipsum' });
    const paragraph2 = page.locator('p', { hasText: 'Sed do eiusmod' });
    await expect(paragraph1).toBeVisible();
    await expect(paragraph2).toBeVisible();
    await paragraph1.click();
    await paragraph2.click({ modifiers: ['Shift'] });
    
    // Click "Rename all" button
    const renameAllBtn = page.getByLabel('Rename all matching', { exact: true });
    await renameAllBtn.click();
    
    // The input should have "p" as initial value
    const popoverInput = page.locator('.fui-PopoverSurface input');
    await expect(popoverInput).toBeVisible();
    await expect(popoverInput).toHaveValue('p');
    
    // Press Escape to close
    await popoverInput.press('Escape');
  });

  test('Transformation is recorded and shown in transformations table', async ({ page }) => {
    // Select two li elements with Shift+click
    const item1 = page.locator('x-value', { hasText: 'Item A1' });
    const item2 = page.locator('x-value', { hasText: 'Item A2' });
    const li1 = item1.locator('xpath=..');
    const li2 = item2.locator('xpath=..');
    await li1.click();
    await li2.click({ modifiers: ['Shift'] });
    
    // Rename all
    const renameAllBtn = page.getByLabel('Rename all matching', { exact: true });
    await renameAllBtn.click();
    
    const popoverInput = page.locator('.fui-PopoverSurface input');
    await expect(popoverInput).toBeVisible();
    await popoverInput.fill('new-item');
    await popoverInput.press('Enter');
    
    // Check transformations table is visible
    const transformationsCard = page.locator('text=Transformations').first();
    await expect(transformationsCard).toBeVisible();
    
    // Should show the transformation with type, LCA, selector info
    const table = page.locator('table').filter({ hasText: 'Type' });
    await expect(table).toBeVisible();
    
    // Should have a row with 'rename' type
    await expect(table.locator('td', { hasText: 'rename' })).toBeVisible();
  });

  test('Rename all renames all boxes in grid with Shift+click', async ({ page }) => {
    // Shift+click two box divs to trigger generalized selection
    const box1 = page.locator('x-value', { hasText: 'Box 1' });
    const box3 = page.locator('x-value', { hasText: 'Box 3' });
    
    await expect(box1).toBeVisible();
    await expect(box3).toBeVisible();
    
    const div1 = box1.locator('xpath=..');
    const div3 = box3.locator('xpath=..');
    
    await div1.click();
    await div3.click({ modifiers: ['Shift'] });
    
    // Click "Rename all"
    const renameAllBtn = page.getByLabel('Rename all matching', { exact: true });
    await renameAllBtn.click();
    
    const popoverInput = page.locator('.fui-PopoverSurface input');
    await expect(popoverInput).toBeVisible();
    await popoverInput.fill('grid-cell');
    await popoverInput.press('Enter');
    
    // All 9 box divs should be renamed
    await expect(page.locator('grid-cell')).toHaveCount(9);
  });
});
