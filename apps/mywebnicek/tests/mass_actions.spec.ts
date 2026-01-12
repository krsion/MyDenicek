import { expect, test } from '@playwright/test';

test.describe('Mass Actions (Generalized Transformations)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Rename all - renames all li elements when selecting li items', async ({ page }) => {
    // Select first li element in the first article
    const item1 = page.locator('x-value', { hasText: 'Item A1' });
    await expect(item1).toBeVisible();
    
    // Click on the li parent
    const li1 = item1.locator('xpath=..');
    await li1.click();
    
    // Click "Rename all" button
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

  test('Rename all - renames matching elements at same depth when multi-selecting', async ({ page }) => {
    // Select two li items at same depth (will generalize to all li at that depth)
    const item1 = page.locator('x-value', { hasText: 'Item A1' });
    const item2 = page.locator('x-value', { hasText: 'Item A2' });
    
    await expect(item1).toBeVisible();
    await expect(item2).toBeVisible();
    
    const li1 = item1.locator('xpath=..');
    const li2 = item2.locator('xpath=..');
    
    // Multi-select with Ctrl+Click
    await li1.click();
    await li2.click({ modifiers: ['Control'] });
    
    // Click "Rename all" button
    const renameAllBtn = page.getByLabel('Rename all matching', { exact: true });
    await expect(renameAllBtn).toBeEnabled();
    await renameAllBtn.click();
    
    // Enter new tag name in the popover
    const popoverInput = page.locator('.fui-PopoverSurface input');
    await expect(popoverInput).toBeVisible();
    await popoverInput.fill('renamed-li');
    await popoverInput.press('Enter');
    
    // All 3 li items in the ul should be renamed
    await expect(page.locator('ul > renamed-li')).toHaveCount(3);
  });

  test('Wrap all - wraps li elements', async ({ page }) => {
    // Select an li element
    const item1 = page.locator('x-value', { hasText: 'Item A1' });
    await expect(item1).toBeVisible();
    
    // Get the li parent and click it
    const li1 = item1.locator('xpath=..');
    await li1.click();
    
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

  test('Wrap all - wraps h2 elements', async ({ page }) => {
    // Select an h2 from first article
    const h2_articleA = page.locator('h2', { hasText: 'Article A' });
    await expect(h2_articleA).toBeVisible();
    await h2_articleA.click();
    
    // Click "Wrap all" button
    const wrapAllBtn = page.getByLabel('Wrap all matching', { exact: true });
    await expect(wrapAllBtn).toBeEnabled();
    await wrapAllBtn.click();
    
    // Enter wrapper tag name in popover
    const popoverInput = page.locator('.fui-PopoverSurface input');
    await expect(popoverInput).toBeVisible();
    await popoverInput.fill('heading-wrapper');
    await popoverInput.press('Enter');
    
    // The h2 should be wrapped
    await expect(page.locator('article heading-wrapper > h2').first()).toBeVisible();
  });

  test.skip('Rename all shows initial value based on selected element tag', async ({ page }) => {
    // Select a p element
    const paragraph = page.locator('p', { hasText: 'Lorem ipsum' });
    await expect(paragraph).toBeVisible();
    await paragraph.click();
    
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
    // Select an li element
    const item = page.locator('x-value', { hasText: 'Item A1' });
    const li = item.locator('xpath=..');
    await li.click();
    
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

  test('Rename all renames all boxes in grid', async ({ page }) => {
    // Multi-select two box divs at same depth
    const box1 = page.locator('x-value', { hasText: 'Box 1' });
    const box3 = page.locator('x-value', { hasText: 'Box 3' });
    
    await expect(box1).toBeVisible();
    await expect(box3).toBeVisible();
    
    const div1 = box1.locator('xpath=..');
    const div3 = box3.locator('xpath=..');
    
    await div1.click();
    await div3.click({ modifiers: ['Control'] });
    
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
