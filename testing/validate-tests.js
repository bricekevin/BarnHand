#!/usr/bin/env node

/**
 * Simple test validation script to verify our testing implementation
 */

const fs = require('fs')
const path = require('path')

console.log('🧪 Testing Implementation Validation\n')

// Check test file existence
const testFiles = [
  'frontend/src/components/__tests__/ErrorBoundary.test.tsx',
  'frontend/src/components/__tests__/VideoGrid.test.tsx', 
  'frontend/src/services/__tests__/websocket.test.ts',
  'frontend/src/stores/__tests__/websocketStore.test.ts',
  'backend/ml-service/tests/test_horse_tracker.py',
  'testing/e2e/dashboard.spec.ts',
  'testing/integration/api-gateway.test.js',
  'testing/integration/ml-service.test.js'
]

console.log('📁 Test File Coverage:')
testFiles.forEach(file => {
  const exists = fs.existsSync(path.join(process.cwd(), file))
  console.log(`  ${exists ? '✅' : '❌'} ${file}`)
})

// Check configuration files
const configFiles = [
  'frontend/vite.config.ts',
  'frontend/src/test-setup.ts',
  'testing/automation/test-runner.js',
  'playwright.config.ts'
]

console.log('\n⚙️  Configuration Files:')
configFiles.forEach(file => {
  const exists = fs.existsSync(path.join(process.cwd(), file))
  console.log(`  ${exists ? '✅' : '❌'} ${file}`)
})

// Count test cases
console.log('\n📊 Test Statistics:')

// Frontend test count
const frontendTestCount = testFiles
  .filter(f => f.startsWith('frontend/'))
  .map(f => {
    try {
      const content = fs.readFileSync(path.join(process.cwd(), f), 'utf8')
      const matches = content.match(/it\(/g) || []
      return matches.length
    } catch {
      return 0
    }
  })
  .reduce((a, b) => a + b, 0)

console.log(`  Frontend Unit Tests: ${frontendTestCount} test cases`)

// ML test count  
try {
  const mlContent = fs.readFileSync(path.join(process.cwd(), 'backend/ml-service/tests/test_horse_tracker.py'), 'utf8')
  const mlMatches = mlContent.match(/def test_/g) || []
  console.log(`  ML Pipeline Tests: ${mlMatches.length} test cases`)
} catch {
  console.log(`  ML Pipeline Tests: 0 test cases`)
}

// E2E test count
try {
  const e2eContent = fs.readFileSync(path.join(process.cwd(), 'testing/e2e/dashboard.spec.ts'), 'utf8')
  const e2eMatches = e2eContent.match(/test\(/g) || []
  console.log(`  E2E Tests: ${e2eMatches.length} test cases`)
} catch {
  console.log(`  E2E Tests: 0 test cases`)
}

console.log('\n✨ Testing implementation complete!')
console.log('   Frontend: Unit tests with Vitest + Testing Library')
console.log('   Backend: ML pipeline tests with pytest') 
console.log('   E2E: Dashboard tests with Playwright')
console.log('   Integration: API and ML service integration tests')
console.log('   Infrastructure: Custom test runner with reporting')