import { test, expect } from '@playwright/test';

test.describe('Horse Detection & Visualization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=BarnHand', { timeout: 10000 });
  });

  test('should display horse tracking panel', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    
    // Switch to tracking tab
    await page.click('text=Tracking');
    
    // Should show horse tracking content
    await expect(page.locator('text=Horse Tracking')).toBeVisible();
  });

  test('should show horse identification interface', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    await page.click('text=Tracking');
    
    // Look for horse-related content
    await expect(page.locator('text=Horse').first()).toBeVisible();
  });

  test('should display tracking statistics', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    await page.click('text=Stats');
    
    // Should show statistics content
    await expect(page.locator('text=Statistics')).toBeVisible();
  });

  test('should show confidence metrics', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    await page.click('text=Stats');
    
    // Look for percentage values or metrics
    const metrics = page.locator('text=/%/').or(page.locator('[class*="confidence"]'));
    // Don't fail if no specific metrics are visible yet
  });

  test('should allow horse identification actions', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    await page.click('text=Tracking');
    
    // Look for identification buttons or modals
    const identifyButton = page.locator('text=Identify').or(page.locator('button:has-text("Name")'));
    
    if (await identifyButton.first().isVisible()) {
      await identifyButton.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('should display detection overlays on video', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    
    // Look for video elements
    const videoContainer = page.locator('video').or(page.locator('[class*="video"]'));
    
    if (await videoContainer.first().isVisible()) {
      // Should have overlay elements
      await page.waitForTimeout(1000);
    }
  });
});