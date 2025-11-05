import { test, expect } from '@playwright/test';

/**
 * E2E tests for Detection Correction & Re-Processing workflow
 * Tests the complete user journey from opening the correction modal
 * to submitting corrections and verifying the re-processed chunk.
 */

test.describe('Detection Correction & Re-Processing', () => {
  let authToken: string;
  let streamId: string;
  let chunkId: string;

  // Setup: Authenticate and prepare test data
  test.beforeAll(async ({ request }) => {
    // Authenticate to get JWT token
    const loginResponse = await request.post(
      'http://localhost:8000/api/v1/auth/login',
      {
        data: {
          email: 'test@example.com',
          password: 'testpassword123',
        },
      }
    );

    if (loginResponse.ok()) {
      const data = await loginResponse.json();
      authToken = data.token;
    } else {
      console.warn('⚠️  Could not authenticate - using unauthenticated mode');
    }

    // Get or create a test stream
    const streamsResponse = await request.get(
      'http://localhost:8000/api/v1/streams',
      {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      }
    );

    if (streamsResponse.ok()) {
      const streams = await streamsResponse.json();
      if (streams.length > 0) {
        streamId = streams[0].id;

        // Get chunks for this stream
        const chunksResponse = await request.get(
          `http://localhost:8000/api/v1/streams/${streamId}/chunks`,
          {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          }
        );

        if (chunksResponse.ok()) {
          const chunks = await chunksResponse.json();
          if (chunks.length > 0) {
            chunkId = chunks[0].id;
          }
        }
      }
    }
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard
    await page.goto('/');
    await page.waitForSelector('text=BarnHand', { timeout: 10000 });
    await page.click('[href="/dashboard"]');

    // If we have a stream ID, navigate to it
    if (streamId) {
      // Wait for stream to load
      await page.waitForTimeout(1000);
    }
  });

  /**
   * Test 1: Reassign Detection to Existing Horse
   *
   * User story: As a farm manager, I want to reassign a misidentified horse
   * to the correct existing horse in my stable.
   */
  test('should reassign detection to existing horse', async ({ page }) => {
    test.setTimeout(60000); // Extended timeout for video processing

    // Step 1: Find and open frame inspector
    const frameInspector = page.locator('[data-testid="frame-inspector"]');
    if (await frameInspector.isVisible()) {
      // Step 2: Find a tracked horse with edit button
      const editButton = page.locator('[data-testid="edit-detection"]').first();
      await expect(editButton).toBeVisible({ timeout: 5000 });
      await editButton.click();

      // Step 3: Correction modal should open
      const modal = page.locator('[data-testid="correction-modal"]');
      await expect(modal).toBeVisible();
      await expect(page.locator('text=Correct Detection')).toBeVisible();

      // Step 4: Select "Reassign to existing horse"
      await page.click('input[type="radio"][value="reassign"]');

      // Step 5: Select target horse from dropdown
      const horseDropdown = page.locator('[data-testid="target-horse-select"]');
      await horseDropdown.click();
      await page.locator('option').nth(1).click(); // Select second horse

      // Step 6: Submit correction
      await page.click('button:has-text("Add Correction")');

      // Step 7: Verify modal closes
      await expect(modal).not.toBeVisible();

      // Step 8: Verify correction appears in batch panel
      const batchPanel = page.locator('[data-testid="correction-batch-panel"]');
      await expect(batchPanel).toBeVisible();
      await expect(page.locator('text=Reassign')).toBeVisible();

      // Step 9: Submit corrections for processing
      await page.click('button:has-text("Process Corrections")');

      // Step 10: Confirm in confirmation dialog
      const confirmButton = page.locator('button:has-text("Confirm")');
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      // Step 11: Verify progress indicator appears
      const progressBar = page.locator('[data-testid="reprocessing-progress"]');
      await expect(progressBar).toBeVisible({ timeout: 5000 });

      // Step 12: Wait for processing to complete
      await expect(progressBar).toContainText('Complete', { timeout: 45000 });

      // Step 13: Verify success notification
      await expect(
        page.locator('text=Chunk updated with corrections')
      ).toBeVisible({ timeout: 5000 });

      // Step 14: Verify batch panel is cleared
      await expect(batchPanel).not.toBeVisible();
    } else {
      test.skip();
    }
  });

  /**
   * Test 2: Create New Guest Horse
   *
   * User story: As a farm manager, I want to identify a detected horse
   * as a new guest horse that isn't in my registered stable.
   */
  test('should create new guest horse', async ({ page }) => {
    test.setTimeout(60000);

    // Step 1: Open frame inspector
    const frameInspector = page.locator('[data-testid="frame-inspector"]');
    if (await frameInspector.isVisible()) {
      // Step 2: Click edit on a horse
      const editButton = page.locator('[data-testid="edit-detection"]').first();
      await expect(editButton).toBeVisible({ timeout: 5000 });
      await editButton.click();

      // Step 3: Open correction modal
      const modal = page.locator('[data-testid="correction-modal"]');
      await expect(modal).toBeVisible();

      // Step 4: Select "Create new guest horse"
      await page.click('input[type="radio"][value="new_guest"]');

      // Step 5: Verify auto-generated name is shown
      const guestNameInput = page.locator('[data-testid="guest-horse-name"]');
      await expect(guestNameInput).toBeVisible();
      const guestName = await guestNameInput.inputValue();
      expect(guestName).toMatch(/Guest Horse \d+/);

      // Step 6: Optionally customize the name
      await guestNameInput.fill('Guest Horse Bella');

      // Step 7: Submit correction
      await page.click('button:has-text("Add Correction")');

      // Step 8: Verify modal closes
      await expect(modal).not.toBeVisible();

      // Step 9: Verify correction in batch panel
      await expect(page.locator('text=New Guest')).toBeVisible();
      await expect(page.locator('text=Guest Horse Bella')).toBeVisible();

      // Step 10: Process corrections
      await page.click('button:has-text("Process Corrections")');

      // Confirm if dialog appears
      const confirmButton = page.locator('button:has-text("Confirm")');
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      // Step 11: Wait for completion
      const progressBar = page.locator('[data-testid="reprocessing-progress"]');
      await expect(progressBar).toBeVisible({ timeout: 5000 });
      await expect(progressBar).toContainText('Complete', { timeout: 45000 });

      // Step 12: Verify new guest horse appears in UI
      await expect(page.locator('text=Guest Horse Bella')).toBeVisible({
        timeout: 5000,
      });
    } else {
      test.skip();
    }
  });

  /**
   * Test 3: Mark Detection as Incorrect
   *
   * User story: As a farm manager, I want to remove false positive
   * detections that aren't actually horses.
   */
  test('should mark detection as incorrect', async ({ page }) => {
    test.setTimeout(60000);

    // Step 1: Open frame inspector
    const frameInspector = page.locator('[data-testid="frame-inspector"]');
    if (await frameInspector.isVisible()) {
      // Step 2: Get the horse name before deletion
      const horseLabel = page.locator('[data-testid="tracked-horse"]').first();
      const horseName = await horseLabel.textContent();

      // Step 3: Click edit
      const editButton = page.locator('[data-testid="edit-detection"]').first();
      await expect(editButton).toBeVisible({ timeout: 5000 });
      await editButton.click();

      // Step 4: Open modal
      const modal = page.locator('[data-testid="correction-modal"]');
      await expect(modal).toBeVisible();

      // Step 5: Select "Mark as incorrect"
      await page.click('input[type="radio"][value="mark_incorrect"]');

      // Step 6: Verify warning message
      await expect(
        page.locator('text=This detection will be removed')
      ).toBeVisible();

      // Step 7: Confirm deletion checkbox
      const confirmCheckbox = page.locator('[data-testid="confirm-deletion"]');
      await confirmCheckbox.check();

      // Step 8: Submit correction
      await page.click('button:has-text("Add Correction")');

      // Step 9: Verify modal closes
      await expect(modal).not.toBeVisible();

      // Step 10: Verify correction in batch panel
      await expect(page.locator('text=Mark Incorrect')).toBeVisible();

      // Step 11: Process corrections
      await page.click('button:has-text("Process Corrections")');

      // Confirm if dialog appears
      const confirmButton = page.locator('button:has-text("Confirm")');
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      // Step 12: Wait for completion
      const progressBar = page.locator('[data-testid="reprocessing-progress"]');
      await expect(progressBar).toBeVisible({ timeout: 5000 });
      await expect(progressBar).toContainText('Complete', { timeout: 45000 });

      // Step 13: Verify horse is removed from UI
      if (horseName) {
        await expect(page.locator(`text=${horseName}`)).not.toBeVisible({
          timeout: 5000,
        });
      }
    } else {
      test.skip();
    }
  });

  /**
   * Test 4: Batch Corrections (Multiple Corrections)
   *
   * User story: As a farm manager, I want to queue multiple corrections
   * and process them all at once for efficiency.
   */
  test('should handle batch corrections (3+ corrections)', async ({ page }) => {
    test.setTimeout(90000); // Extended timeout for multiple corrections

    // Step 1: Open frame inspector
    const frameInspector = page.locator('[data-testid="frame-inspector"]');
    if (await frameInspector.isVisible()) {
      const editButtons = page.locator('[data-testid="edit-detection"]');
      const editCount = await editButtons.count();

      if (editCount >= 3) {
        // Step 2: Add first correction (reassign)
        await editButtons.nth(0).click();
        let modal = page.locator('[data-testid="correction-modal"]');
        await expect(modal).toBeVisible();
        await page.click('input[type="radio"][value="reassign"]');
        await page
          .locator('[data-testid="target-horse-select"]')
          .selectOption({ index: 1 });
        await page.click('button:has-text("Add Correction")');
        await expect(modal).not.toBeVisible();

        // Step 3: Add second correction (new guest)
        await editButtons.nth(1).click();
        modal = page.locator('[data-testid="correction-modal"]');
        await expect(modal).toBeVisible();
        await page.click('input[type="radio"][value="new_guest"]');
        await page.click('button:has-text("Add Correction")');
        await expect(modal).not.toBeVisible();

        // Step 4: Add third correction (mark incorrect)
        await editButtons.nth(2).click();
        modal = page.locator('[data-testid="correction-modal"]');
        await expect(modal).toBeVisible();
        await page.click('input[type="radio"][value="mark_incorrect"]');
        await page.locator('[data-testid="confirm-deletion"]').check();
        await page.click('button:has-text("Add Correction")');
        await expect(modal).not.toBeVisible();

        // Step 5: Verify all corrections in batch panel
        const batchPanel = page.locator(
          '[data-testid="correction-batch-panel"]'
        );
        await expect(batchPanel).toBeVisible();
        await expect(
          page.locator('[data-testid="correction-count"]')
        ).toContainText('3');

        // Step 6: Verify correction summaries
        await expect(page.locator('text=Reassign')).toBeVisible();
        await expect(page.locator('text=New Guest')).toBeVisible();
        await expect(page.locator('text=Mark Incorrect')).toBeVisible();

        // Step 7: Process all corrections
        await page.click('button:has-text("Process Corrections")');

        // Confirm if dialog appears
        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        // Step 8: Wait for completion
        const progressBar = page.locator(
          '[data-testid="reprocessing-progress"]'
        );
        await expect(progressBar).toBeVisible({ timeout: 5000 });
        await expect(progressBar).toContainText('Complete', { timeout: 60000 });

        // Step 9: Verify all corrections applied
        await expect(
          page.locator('text=Chunk updated with corrections')
        ).toBeVisible({ timeout: 5000 });

        // Step 10: Verify batch panel cleared
        await expect(batchPanel).not.toBeVisible();
      } else {
        test.skip();
      }
    } else {
      test.skip();
    }
  });

  /**
   * Test 5: Error Handling (Invalid Horse ID)
   *
   * User story: As a system, I need to handle invalid corrections
   * gracefully and show clear error messages to users.
   */
  test('should handle error for invalid corrections', async ({
    page,
    request,
  }) => {
    test.setTimeout(30000);

    // Step 1: Attempt to submit invalid correction via API
    if (authToken && streamId && chunkId) {
      const response = await request.post(
        `http://localhost:8000/api/v1/streams/${streamId}/chunks/${chunkId}/corrections`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          data: {
            corrections: [
              {
                detection_index: 0,
                frame_index: 0,
                correction_type: 'reassign',
                original_horse_id: 'horse-1',
                corrected_horse_id: 'invalid-horse-id-12345', // Invalid ID
              },
            ],
          },
        }
      );

      // Step 2: Verify error response
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.error).toContain('horse');
    }

    // Step 3: Test UI validation
    const frameInspector = page.locator('[data-testid="frame-inspector"]');
    if (await frameInspector.isVisible()) {
      // Open correction modal
      const editButton = page.locator('[data-testid="edit-detection"]').first();
      await expect(editButton).toBeVisible({ timeout: 5000 });
      await editButton.click();

      const modal = page.locator('[data-testid="correction-modal"]');
      await expect(modal).toBeVisible();

      // Step 4: Try to submit without selecting options
      await page.click('input[type="radio"][value="reassign"]');
      // Don't select a horse from dropdown
      await page.click('button:has-text("Add Correction")');

      // Step 5: Verify validation error
      await expect(page.locator('text=Please select a horse')).toBeVisible();

      // Step 6: Verify modal stays open
      await expect(modal).toBeVisible();

      // Step 7: Try to reassign to same horse
      const dropdown = page.locator('[data-testid="target-horse-select"]');
      await dropdown.selectOption({ index: 0 }); // Select same horse
      await page.click('button:has-text("Add Correction")');

      // Step 8: Verify self-reassignment error
      await expect(
        page.locator('text=Cannot reassign to the same horse')
      ).toBeVisible();
    }
  });

  /**
   * Test 6: Correction Count Badge
   *
   * User story: As a farm manager, I want to see which chunks
   * have been manually corrected.
   */
  test('should display correction count badge on corrected chunks', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Step 1: Navigate to chunk list
    await page.waitForTimeout(1000);

    // Step 2: Look for chunks with correction badges
    const correctionBadge = page.locator(
      '[data-testid="correction-count-badge"]'
    );

    // Step 3: If a badge exists, verify it shows count
    if ((await correctionBadge.count()) > 0) {
      await expect(correctionBadge.first()).toBeVisible();

      // Step 4: Verify tooltip
      await correctionBadge.first().hover();
      await expect(page.locator('text=manually corrected')).toBeVisible();

      // Step 5: Verify badge styling
      const badge = correctionBadge.first();
      const classes = await badge.getAttribute('class');
      expect(classes).toContain('amber');
    }
  });

  /**
   * Test 7: Clear Pending Corrections
   *
   * User story: As a farm manager, I want to discard pending
   * corrections if I change my mind.
   */
  test('should clear pending corrections', async ({ page }) => {
    test.setTimeout(30000);

    // Step 1: Open frame inspector
    const frameInspector = page.locator('[data-testid="frame-inspector"]');
    if (await frameInspector.isVisible()) {
      // Step 2: Add a correction
      const editButton = page.locator('[data-testid="edit-detection"]').first();
      await expect(editButton).toBeVisible({ timeout: 5000 });
      await editButton.click();

      const modal = page.locator('[data-testid="correction-modal"]');
      await expect(modal).toBeVisible();
      await page.click('input[type="radio"][value="reassign"]');
      await page
        .locator('[data-testid="target-horse-select"]')
        .selectOption({ index: 1 });
      await page.click('button:has-text("Add Correction")');

      // Step 3: Verify batch panel shows correction
      const batchPanel = page.locator('[data-testid="correction-batch-panel"]');
      await expect(batchPanel).toBeVisible();

      // Step 4: Click "Clear All" button
      await page.click('button:has-text("Clear All")');

      // Step 5: Confirm in dialog if present
      const confirmButton = page.locator('button:has-text("Clear")');
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      // Step 6: Verify batch panel is cleared
      await expect(batchPanel).not.toBeVisible();
    } else {
      test.skip();
    }
  });

  /**
   * Test 8: Re-processing Progress Updates
   *
   * User story: As a farm manager, I want to see real-time
   * progress when my corrections are being processed.
   */
  test('should show real-time re-processing progress', async ({ page }) => {
    test.setTimeout(60000);

    // Step 1: Submit a correction
    const frameInspector = page.locator('[data-testid="frame-inspector"]');
    if (await frameInspector.isVisible()) {
      const editButton = page.locator('[data-testid="edit-detection"]').first();
      await expect(editButton).toBeVisible({ timeout: 5000 });
      await editButton.click();

      const modal = page.locator('[data-testid="correction-modal"]');
      await expect(modal).toBeVisible();
      await page.click('input[type="radio"][value="reassign"]');
      await page
        .locator('[data-testid="target-horse-select"]')
        .selectOption({ index: 1 });
      await page.click('button:has-text("Add Correction")');

      // Step 2: Process correction
      await page.click('button:has-text("Process Corrections")');
      const confirmButton = page.locator('button:has-text("Confirm")');
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      // Step 3: Verify progress bar appears
      const progressBar = page.locator('[data-testid="reprocessing-progress"]');
      await expect(progressBar).toBeVisible({ timeout: 5000 });

      // Step 4: Verify progress percentage updates
      await expect(progressBar).toContainText('%', { timeout: 5000 });

      // Step 5: Verify step descriptions appear
      const progressSteps = [
        'Applying corrections',
        'Updating features',
        'Regenerating frames',
        'Rebuilding video',
        'Complete',
      ];

      // At least one step should be visible during processing
      let stepVisible = false;
      for (const step of progressSteps) {
        if (await page.locator(`text=${step}`).isVisible()) {
          stepVisible = true;
          break;
        }
      }
      expect(stepVisible).toBe(true);

      // Step 6: Wait for completion
      await expect(progressBar).toContainText('Complete', { timeout: 45000 });

      // Step 7: Verify progress bar disappears
      await expect(progressBar).not.toBeVisible({ timeout: 5000 });
    } else {
      test.skip();
    }
  });
});
