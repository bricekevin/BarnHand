import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 E2E test environment teardown...');
  
  // Clean up any test data or processes if needed
  // For now, we'll just log completion
  
  console.log('✅ E2E test environment teardown complete');
}

export default globalTeardown;