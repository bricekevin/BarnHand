# BarnHand E2E Tests

End-to-end tests for BarnHand using Playwright.

## Prerequisites

1. **Docker Desktop** - Must be running
2. **Node.js 18+** - For running Playwright
3. **Backend Services** - API Gateway, ML Service, Database, Redis
4. **Frontend** - React development server

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Playwright Browsers

```bash
npx playwright install
```

### 3. Start Backend Services

```bash
# Start all backend services with Docker Compose
docker compose up -d postgres redis api-gateway ml-service video-streamer

# Verify services are healthy
docker compose ps
docker compose logs -f api-gateway ml-service
```

### 4. Start Frontend

```bash
# In a separate terminal
npm run frontend:dev
```

The frontend should be running on `http://localhost:5173`.

## Running Tests

### Run All E2E Tests

```bash
npm run test:e2e
```

Or directly with Playwright:

```bash
npx playwright test
```

### Run Specific Test File

```bash
npx playwright test detection-correction
```

### Run in UI Mode (Interactive)

```bash
npx playwright test --ui
```

### Run in Headed Mode (See Browser)

```bash
npx playwright test --headed
```

### Debug a Test

```bash
npx playwright test --debug
```

## Test Files

### Detection Correction Tests

**File**: `detection-correction.spec.ts`

Comprehensive tests for the Phase 4 Detection Correction & Re-Processing workflow:

1. **Test 1: Reassign Detection** - Reassign a misidentified horse to an existing horse
2. **Test 2: Create New Guest Horse** - Create a new guest horse from a detection
3. **Test 3: Mark as Incorrect** - Remove false positive detections
4. **Test 4: Batch Corrections** - Process 3+ corrections in one batch
5. **Test 5: Error Handling** - Validate error messages for invalid corrections
6. **Test 6: Correction Count Badge** - Verify correction badges on chunk cards
7. **Test 7: Clear Pending Corrections** - Discard pending corrections
8. **Test 8: Re-processing Progress** - Real-time progress updates

**Estimated Runtime**: 8-12 minutes (all tests)

### Other Test Files

- `horse-detection.spec.ts` - Horse detection and visualization
- `dashboard.spec.ts` - Dashboard navigation and stats
- `data-export.spec.ts` - Data export functionality
- `stream-management.spec.ts` - Stream creation and management

## Test Data Requirements

The tests require:

1. **Test User Account**:
   - Email: `test@example.com`
   - Password: `testpassword123`
   - Role: FARM_ADMIN or FARM_USER

2. **Active Video Stream**:
   - At least 1 active stream with processed chunks
   - Chunks should have 2+ tracked horses for comprehensive testing

3. **Database Seeding** (Optional):

```bash
npm run db:seed
```

## Debugging Failed Tests

### Check Services

```bash
# API Gateway health
curl http://localhost:8000/api/v1/health

# ML Service health
curl http://localhost:8002/health

# Frontend
curl http://localhost:5173
```

### View Test Results

```bash
# HTML report
npx playwright show-report

# Screenshots and videos (only created on failure)
ls -la test-results/
```

### Check Logs

```bash
# API Gateway
docker compose logs -f api-gateway

# ML Service
docker compose logs -f ml-service

# Database
docker compose logs -f postgres
```

### Common Issues

#### 1. Services Not Running

**Error**: `Connection refused` or timeout errors

**Solution**:

```bash
docker compose up -d
docker compose ps  # Verify all services are "Up"
```

#### 2. Frontend Not Accessible

**Error**: `net::ERR_CONNECTION_REFUSED` to localhost:5173

**Solution**:

```bash
npm run frontend:dev
# Wait for "Local: http://localhost:5173"
```

#### 3. Authentication Failed

**Error**: Test user not found

**Solution**:

```bash
# Create test user via API or database seed
npm run db:seed
```

#### 4. No Test Data

**Error**: Tests skip due to missing streams/chunks

**Solution**:

1. Start a video stream from the UI
2. Wait for chunks to be processed
3. Re-run tests

#### 5. Re-processing Timeout

**Error**: Test times out waiting for re-processing

**Solution**:

- Check ML service logs: `docker compose logs -f ml-service`
- Verify Redis is running: `docker compose ps redis`
- Increase test timeout if processing is slow

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Start Docker services
        run: docker compose up -d

      - name: Wait for services
        run: |
          npx wait-on http://localhost:8000/api/v1/health
          npx wait-on http://localhost:8002/health

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## Test Configuration

Configuration is in `playwright.config.ts`:

- **Browsers**: Chrome, Firefox, Safari, Mobile Chrome, Mobile Safari
- **Timeout**: 30 seconds per test
- **Retries**: 2 on CI, 0 locally
- **Trace**: On first retry
- **Screenshots**: On failure
- **Video**: On failure

## Writing New Tests

### Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
    await page.goto('/');
  });

  test('should do something', async ({ page }) => {
    // Test steps
    await page.click('button');
    await expect(page.locator('text=Success')).toBeVisible();
  });
});
```

### Best Practices

1. **Use data-testid attributes** for reliable selectors:

   ```tsx
   <button data-testid="submit-button">Submit</button>
   ```

2. **Wait for elements** before interacting:

   ```typescript
   await expect(modal).toBeVisible({ timeout: 5000 });
   await modal.click();
   ```

3. **Handle async operations** with proper timeouts:

   ```typescript
   test.setTimeout(60000); // Extend for long operations
   ```

4. **Clean up test data** in teardown:

   ```typescript
   test.afterEach(async ({ request }) => {
     await request.delete(`/api/v1/test-data/${testId}`);
   });
   ```

5. **Use descriptive test names**:
   ```typescript
   test('should reassign detection to existing horse and verify update');
   ```

## Coverage

E2E tests cover:

- ✅ User authentication flows
- ✅ Stream management
- ✅ Horse detection and tracking
- ✅ Detection correction workflow (Phase 4)
- ✅ Re-processing with progress tracking
- ✅ Error handling and validation
- ✅ Real-time WebSocket updates
- ✅ Data export

Target: 80%+ coverage of critical user journeys.

## Support

For issues with E2E tests:

1. Check this README
2. Review test logs in `test-results/`
3. Run in UI mode for interactive debugging: `npx playwright test --ui`
4. Check GitHub Issues: https://github.com/bricekevin/BarnHand/issues
