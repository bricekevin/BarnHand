import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  // Start services needed for E2E testing
  console.log('🚀 Starting E2E test environment setup...');
  
  // Check if backend services are running
  try {
    const response = await fetch('http://localhost:8000/api/v1/health');
    if (!response.ok) {
      console.warn('⚠️  Backend API Gateway not running on port 8000');
      console.log('Please ensure the backend services are started before running E2E tests');
    }
  } catch (error) {
    console.warn('⚠️  Backend services not accessible');
    console.log('Please start backend services: npm run api:dev');
  }

  // Check if frontend is running
  try {
    const response = await fetch('http://localhost:3000');
    if (!response.ok) {
      console.warn('⚠️  Frontend not running on port 3000');
      console.log('Please ensure the frontend is started: npm run dev');
    }
  } catch (error) {
    console.warn('⚠️  Frontend not accessible');
    console.log('Please start frontend: npm run dev');
  }

  console.log('✅ E2E test environment setup complete');
  return true;
}

export default globalSetup;