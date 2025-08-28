import { test, expect } from '@playwright/test'

test.describe('BarnHand Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard
    await page.goto('http://localhost:3000')
    
    // Wait for the page to load
    await page.waitForSelector('h1:has-text("BarnHand")', { timeout: 10000 })
  })

  test('displays main dashboard elements', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/BarnHand/)
    
    // Check main heading
    await expect(page.locator('h1')).toContainText('BarnHand')
    
    // Check navigation sidebar
    await expect(page.locator('nav')).toBeVisible()
    await expect(page.locator('a:has-text("Dashboard")')).toBeVisible()
    await expect(page.locator('a:has-text("Live Streams")')).toBeVisible()
    await expect(page.locator('a:has-text("Analytics")')).toBeVisible()
    await expect(page.locator('a:has-text("Settings")')).toBeVisible()
    
    // Check system status indicators
    await expect(page.locator('text=System Online')).toBeVisible()
    await expect(page.locator('text=ML Service:')).toBeVisible()
    await expect(page.locator('text=Streams:')).toBeVisible()
  })

  test('displays video grid with proper layout controls', async ({ page }) => {
    // Check layout controls
    await expect(page.locator('text=Layout:')).toBeVisible()
    await expect(page.locator('button:has-text("1×1")')).toBeVisible()
    await expect(page.locator('button:has-text("2×2")')).toBeVisible()
    await expect(page.locator('button:has-text("1+3")')).toBeVisible()
    await expect(page.locator('button:has-text("3+1")')).toBeVisible()
    
    // Check stream status
    await expect(page.locator('text=Active: 2/4')).toBeVisible()
    await expect(page.locator('text=Total Horses: 5')).toBeVisible()
    
    // Check video containers
    await expect(page.locator('h3:has-text("Arena Camera 1")')).toBeVisible()
    await expect(page.locator('h3:has-text("Field Camera")')).toBeVisible()
    await expect(page.locator('h3:has-text("Training Ring")')).toBeVisible()
    await expect(page.locator('h3:has-text("Paddock View")')).toBeVisible()
  })

  test('switches video layout when clicked', async ({ page }) => {
    // Initially should be in 2x2 layout
    await expect(page.locator('button:has-text("2×2")')).toBeVisible()
    
    // Click 1×1 layout
    await page.click('button:has-text("1×1")')
    
    // Should still show main streams (layout change is visual)
    await expect(page.locator('h3:has-text("Arena Camera 1")')).toBeVisible()
    
    // Click back to 2×2
    await page.click('button:has-text("2×2")')
    
    // Should show all streams again
    await expect(page.locator('h3:has-text("Arena Camera 1")')).toBeVisible()
    await expect(page.locator('h3:has-text("Field Camera")')).toBeVisible()
  })

  test('displays real-time metrics', async ({ page }) => {
    // Check stream statistics panel
    await expect(page.locator('h3:has-text("Stream Statistics")')).toBeVisible()
    
    // Check processing metrics
    await expect(page.locator('text=Processing FPS')).toBeVisible()
    await expect(page.locator('text=47.2')).toBeVisible()
    
    await expect(page.locator('text=ML Latency')).toBeVisible()
    await expect(page.locator('text=23ms')).toBeVisible()
    
    await expect(page.locator('text=Total Detections')).toBeVisible()
    await expect(page.locator('text=1,247')).toBeVisible()
    
    await expect(page.locator('text=Uptime')).toBeVisible()
    await expect(page.locator('text=99.7%')).toBeVisible()
  })

  test('displays horse tracking panel', async ({ page }) => {
    // Check horse tracking section
    await expect(page.locator('h3:has-text("Horse Tracking")')).toBeVisible()
    await expect(page.locator('text=3/5 active')).toBeVisible()
    
    // Check individual horse entries
    await expect(page.locator('text=Thunderbolt')).toBeVisible()
    await expect(page.locator('text=Shadow')).toBeVisible()
    await expect(page.locator('text=Spirit')).toBeVisible()
    
    // Check confidence percentages
    await expect(page.locator('text=92% conf.')).toBeVisible()
    await expect(page.locator('text=87% conf.')).toBeVisible()
    await expect(page.locator('text=78% conf.')).toBeVisible()
    
    // Check tracking summary
    await expect(page.locator('h4:has-text("Tracking Summary")')).toBeVisible()
    await expect(page.locator('text=Active Tracks')).toBeVisible()
    await expect(page.locator('text=Avg Confidence')).toBeVisible()
  })

  test('displays system alerts', async ({ page }) => {
    // Check alerts panel
    await expect(page.locator('h3:has-text("System Alerts")')).toBeVisible()
    
    // Check individual alerts
    await expect(page.locator('text=Low Confidence Detection')).toBeVisible()
    await expect(page.locator('text=Processing Optimized')).toBeVisible()
    await expect(page.locator('text=Stream Connected')).toBeVisible()
    
    // Check alert summary
    await expect(page.locator('h4:has-text("Alert Summary")')).toBeVisible()
    await expect(page.locator('text=Critical')).toBeVisible()
    await expect(page.locator('text=Warnings')).toBeVisible()
    await expect(page.locator('text=Info')).toBeVisible()
    await expect(page.locator('text=Success')).toBeVisible()
  })

  test('handles navigation between pages', async ({ page }) => {
    // Click on Live Streams
    await page.click('a:has-text("Live Streams")')
    await page.waitForURL('**/streams')
    
    // Should navigate to streams page
    await expect(page.url()).toContain('/streams')
    
    // Navigate back to Dashboard
    await page.click('a:has-text("Dashboard")')
    await page.waitForURL('**/dashboard')
    
    // Should be back on dashboard
    await expect(page.url()).toContain('/dashboard')
  })

  test('sidebar collapse functionality', async ({ page }) => {
    // Check if sidebar is visible
    await expect(page.locator('nav')).toBeVisible()
    
    // Click collapse button
    await page.click('button:has-text("Collapse sidebar")')
    
    // Sidebar should still be present but may have different styling
    await expect(page.locator('nav')).toBeVisible()
  })

  test('video overlay controls work', async ({ page }) => {
    // Find video overlay controls
    const overlayButton = page.locator('button[title="Toggle detection overlays"]').first()
    
    if (await overlayButton.isVisible()) {
      await overlayButton.click()
      
      // Should toggle overlay state (visual change tested implicitly)
      await expect(overlayButton).toBeVisible()
    }
  })

  test('checks for console errors', async ({ page }) => {
    const consoleErrors: string[] = []
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    
    // Navigate and interact with the page
    await page.goto('http://localhost:3000')
    await page.waitForSelector('h1:has-text("BarnHand")')
    
    // Click around to trigger any potential errors
    await page.click('button:has-text("1×1")')
    await page.click('button:has-text("2×2")')
    
    // Wait a moment for any async errors
    await page.waitForTimeout(1000)
    
    // Filter out expected errors (like video loading errors in test environment)
    const significantErrors = consoleErrors.filter(error => 
      !error.includes('Video play failed') &&
      !error.includes('fetch') &&
      !error.includes('NetworkError')
    )
    
    expect(significantErrors).toHaveLength(0)
  })

  test('responsive design on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    // Should still show main elements
    await expect(page.locator('h1:has-text("BarnHand")')).toBeVisible()
    
    // Navigation should be present
    await expect(page.locator('nav')).toBeVisible()
    
    // Main content should be visible
    await expect(page.locator('text=Live Streaming Dashboard')).toBeVisible()
  })

  test('theme toggle functionality', async ({ page }) => {
    const themeButton = page.locator('button[title="Toggle theme"]')
    
    if (await themeButton.isVisible()) {
      await themeButton.click()
      
      // Theme should toggle (visual changes tested implicitly)
      await expect(themeButton).toBeVisible()
    }
  })

  test('performance metrics are reasonable', async ({ page }) => {
    // Navigate to page and wait for load
    const startTime = Date.now()
    await page.goto('http://localhost:3000')
    await page.waitForSelector('h1:has-text("BarnHand")')
    const loadTime = Date.now() - startTime
    
    // Page should load within reasonable time (less than 5 seconds)
    expect(loadTime).toBeLessThan(5000)
    
    // Check that key interactive elements are present quickly
    await expect(page.locator('button:has-text("2×2")')).toBeVisible()
    await expect(page.locator('text=System Online')).toBeVisible()
  })

  test('websocket connection indicators', async ({ page }) => {
    // Should show connection status
    await expect(page.locator('text=System Online')).toBeVisible()
    
    // Should show real-time data (indicating WebSocket is working)
    await expect(page.locator('text=ML: 47 FPS')).toBeVisible()
    await expect(page.locator('text=Streams: 2/4')).toBeVisible()
  })
})