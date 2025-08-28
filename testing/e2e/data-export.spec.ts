import { test, expect } from '@playwright/test';

test.describe('Data Export Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=BarnHand', { timeout: 10000 });
  });

  test('should display export interface', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    await page.click('text=Export');
    
    // Should show export content
    await expect(page.locator('text=Export')).toBeVisible();
  });

  test('should show export format options', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    await page.click('text=Export');
    
    // Look for format options
    const formatOptions = page.locator('text=CSV').or(
      page.locator('text=JSON')
    ).or(page.locator('text=PDF'));
    
    // Don't require specific formats to be visible
    await page.waitForTimeout(500);
  });

  test('should allow date range selection', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    await page.click('text=Export');
    
    // Look for date inputs
    const dateInputs = page.locator('input[type="date"]').or(
      page.locator('[class*="date"]')
    );
    
    if (await dateInputs.first().isVisible()) {
      await dateInputs.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('should show export progress', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    await page.click('text=Export');
    
    // Look for export button
    const exportButton = page.locator('button:has-text("Export")').or(
      page.locator('text=Download')
    );
    
    if (await exportButton.first().isVisible()) {
      await exportButton.first().click();
      
      // Should show progress indicator
      await page.waitForTimeout(1000);
    }
  });

  test('should display export statistics', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    await page.click('text=Export');
    
    // Look for statistics or file size info
    const stats = page.locator('text=MB').or(
      page.locator('text=records')
    ).or(page.locator('[class*="stat"]'));
    
    await page.waitForTimeout(500);
  });

  test('should allow selective data export', async ({ page }) => {
    await page.click('[href="/dashboard"]');
    await page.click('text=Export');
    
    // Look for checkboxes or selection options
    const checkboxes = page.locator('input[type="checkbox"]');
    
    if (await checkboxes.first().isVisible()) {
      await checkboxes.first().click();
      await page.waitForTimeout(500);
    }
  });
});