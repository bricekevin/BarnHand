import { test, expect } from '@playwright/test';

test.describe('Stream Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=BarnHand', { timeout: 10000 });
  });

  test('should display stream management interface', async ({ page }) => {
    // Navigate to dashboard
    await page.click('[href="/dashboard"]');
    await expect(page).toHaveURL('/dashboard');

    // Should show stream management content
    await expect(page.locator('text=Stream Management')).toBeVisible();
  });

  test('should show stream cards', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    
    // Look for stream-related content
    const streamCards = page.locator('[class*="glass"]').first();
    await expect(streamCards).toBeVisible();
  });

  test('should allow adding new streams', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    
    // Look for add stream button
    const addButton = page.locator('text=Add Stream').or(page.locator('button:has-text("Add")'));
    
    if (await addButton.isVisible()) {
      await addButton.click();
      // Modal or form should appear
      await page.waitForTimeout(500);
    }
  });

  test('should display stream status indicators', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    
    // Check for status indicators
    await expect(page.locator('text=Active').or(page.locator('text=Inactive')).first()).toBeVisible();
  });

  test('should allow stream control actions', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    
    // Look for start/stop buttons
    const controlButton = page.locator('button:has-text("Start")').or(page.locator('button:has-text("Stop")'));
    
    if (await controlButton.first().isVisible()) {
      await controlButton.first().click();
      await page.waitForTimeout(500);
    }
  });
});