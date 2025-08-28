#!/usr/bin/env node

/**
 * Automated Test Runner for Claude Code projects
 * Integrates with development workflow and CI/CD
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestRunner {
  constructor() {
    this.config = this.loadConfig();
    this.results = {
      unit: null,
      integration: null,
      e2e: null,
      coverage: null,
      performance: null
    };
  }

  loadConfig() {
    const defaultConfig = {
      unit: {
        enabled: true,
        command: 'npm run test:unit',
        threshold: 80,
        parallel: true
      },
      integration: {
        enabled: true,
        command: 'npm run test:integration',
        setup: 'npm run test:setup',
        teardown: 'npm run test:teardown'
      },
      e2e: {
        enabled: true,
        command: 'npm run test:e2e',
        browsers: ['chromium', 'firefox', 'webkit'],
        mobile: true
      },
      performance: {
        enabled: false,
        command: 'npm run test:lighthouse',
        thresholds: {
          performance: 90,
          accessibility: 95,
          bestPractices: 90,
          seo: 90
        }
      },
      coverage: {
        enabled: true,
        threshold: {
          global: 80,
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80
        }
      }
    };

    try {
      const userConfig = require(path.join(process.cwd(), 'test.config.js'));
      return { ...defaultConfig, ...userConfig };
    } catch {
      return defaultConfig;
    }
  }

  async runCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`🚀 Running: ${command}`);
      
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        stdio: 'pipe',
        shell: true,
        ...options
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        if (options.verbose !== false) {
          process.stdout.write(output);
        }
      });

      child.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        if (options.verbose !== false) {
          process.stderr.write(output);
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ code, stdout, stderr });
        } else {
          reject({ code, stdout, stderr, command });
        }
      });

      child.on('error', (error) => {
        reject({ error, command });
      });
    });
  }

  async runUnitTests() {
    if (!this.config.unit.enabled) {
      console.log('⏭️  Unit tests disabled');
      return { status: 'skipped' };
    }

    console.log('🧪 Running unit tests...');
    
    try {
      const result = await this.runCommand(this.config.unit.command);
      
      // Parse coverage from output
      const coverageMatch = result.stdout.match(/All files[^\n]*\|\s*(\d+\.?\d*)/);
      const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : 0;
      
      const success = coverage >= this.config.unit.threshold;
      
      this.results.unit = {
        status: success ? 'passed' : 'failed',
        coverage,
        threshold: this.config.unit.threshold,
        output: result.stdout
      };

      if (success) {
        console.log(`✅ Unit tests passed (Coverage: ${coverage}%)`);
      } else {
        console.log(`❌ Unit tests failed (Coverage: ${coverage}% < ${this.config.unit.threshold}%)`);
      }

      return this.results.unit;
    } catch (error) {
      console.log(`❌ Unit tests failed: ${error.command}`);
      this.results.unit = {
        status: 'failed',
        error: error.stderr || error.error?.message
      };
      return this.results.unit;
    }
  }

  async runIntegrationTests() {
    if (!this.config.integration.enabled) {
      console.log('⏭️  Integration tests disabled');
      return { status: 'skipped' };
    }

    console.log('🔗 Running integration tests...');

    try {
      // Setup
      if (this.config.integration.setup) {
        await this.runCommand(this.config.integration.setup);
      }

      // Run tests
      const result = await this.runCommand(this.config.integration.command);

      this.results.integration = {
        status: 'passed',
        output: result.stdout
      };

      console.log('✅ Integration tests passed');
      return this.results.integration;
    } catch (error) {
      console.log(`❌ Integration tests failed: ${error.command}`);
      this.results.integration = {
        status: 'failed',
        error: error.stderr || error.error?.message
      };
      return this.results.integration;
    } finally {
      // Teardown
      if (this.config.integration.teardown) {
        try {
          await this.runCommand(this.config.integration.teardown);
        } catch (error) {
          console.log('⚠️  Integration test teardown failed');
        }
      }
    }
  }

  async runE2ETests() {
    if (!this.config.e2e.enabled) {
      console.log('⏭️  E2E tests disabled');
      return { status: 'skipped' };
    }

    console.log('🎭 Running E2E tests...');

    try {
      const result = await this.runCommand(this.config.e2e.command);

      // Parse test results from Playwright output
      const testMatch = result.stdout.match(/(\d+) passed.*?(\d+) failed/);
      const passed = testMatch ? parseInt(testMatch[1]) : 0;
      const failed = testMatch ? parseInt(testMatch[2]) : 0;

      this.results.e2e = {
        status: failed === 0 ? 'passed' : 'failed',
        passed,
        failed,
        output: result.stdout
      };

      if (failed === 0) {
        console.log(`✅ E2E tests passed (${passed} tests)`);
      } else {
        console.log(`❌ E2E tests failed (${failed} failed, ${passed} passed)`);
      }

      return this.results.e2e;
    } catch (error) {
      console.log(`❌ E2E tests failed: ${error.command}`);
      this.results.e2e = {
        status: 'failed',
        error: error.stderr || error.error?.message
      };
      return this.results.e2e;
    }
  }

  async runPerformanceTests() {
    if (!this.config.performance.enabled) {
      console.log('⏭️  Performance tests disabled');
      return { status: 'skipped' };
    }

    console.log('⚡ Running performance tests...');

    try {
      const result = await this.runCommand(this.config.performance.command);
      
      // Parse Lighthouse scores
      const scores = this.parseLighthouseScores(result.stdout);
      const thresholds = this.config.performance.thresholds;
      
      const failed = Object.entries(thresholds).filter(([key, threshold]) => 
        scores[key] < threshold
      );

      this.results.performance = {
        status: failed.length === 0 ? 'passed' : 'failed',
        scores,
        thresholds,
        failed: failed.map(([key, threshold]) => ({
          metric: key,
          score: scores[key],
          threshold
        }))
      };

      if (failed.length === 0) {
        console.log('✅ Performance tests passed');
      } else {
        console.log(`❌ Performance tests failed (${failed.length} metrics below threshold)`);
      }

      return this.results.performance;
    } catch (error) {
      console.log(`❌ Performance tests failed: ${error.command}`);
      this.results.performance = {
        status: 'failed',
        error: error.stderr || error.error?.message
      };
      return this.results.performance;
    }
  }

  parseLighthouseScores(output) {
    // Simple regex parsing - would be more robust with JSON output
    const scores = {};
    const patterns = {
      performance: /Performance:\s*(\d+)/,
      accessibility: /Accessibility:\s*(\d+)/,
      bestPractices: /Best Practices:\s*(\d+)/,
      seo: /SEO:\s*(\d+)/
    };

    Object.entries(patterns).forEach(([key, pattern]) => {
      const match = output.match(pattern);
      scores[key] = match ? parseInt(match[1]) : 0;
    });

    return scores;
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      },
      details: this.results
    };

    Object.values(this.results).forEach(result => {
      if (result) {
        report.summary.total++;
        if (result.status === 'passed') report.summary.passed++;
        else if (result.status === 'failed') report.summary.failed++;
        else if (result.status === 'skipped') report.summary.skipped++;
      }
    });

    // Write report
    const reportPath = path.join(process.cwd(), 'test-results', 'test-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 Test Summary:');
    console.log(`  Total Suites: ${report.summary.total}`);
    console.log(`  ✅ Passed: ${report.summary.passed}`);
    console.log(`  ❌ Failed: ${report.summary.failed}`);
    console.log(`  ⏭️  Skipped: ${report.summary.skipped}`);
    console.log(`\n📄 Report saved to: ${reportPath}`);

    return report;
  }

  async runAll() {
    console.log('🚀 Starting automated test runner...\n');

    const startTime = Date.now();

    // Run test suites
    await this.runUnitTests();
    await this.runIntegrationTests();
    await this.runE2ETests();
    await this.runPerformanceTests();

    // Generate report
    const report = await this.generateReport();

    const duration = (Date.now() - startTime) / 1000;
    console.log(`\n⏱️  Total time: ${duration}s`);

    // Exit with appropriate code
    const hasFailures = report.summary.failed > 0;
    process.exit(hasFailures ? 1 : 0);
  }
}

// CLI interface
if (require.main === module) {
  const runner = new TestRunner();
  
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  switch (command) {
    case 'unit':
      runner.runUnitTests().then(() => process.exit(0)).catch(() => process.exit(1));
      break;
    case 'integration':
      runner.runIntegrationTests().then(() => process.exit(0)).catch(() => process.exit(1));
      break;
    case 'e2e':
      runner.runE2ETests().then(() => process.exit(0)).catch(() => process.exit(1));
      break;
    case 'performance':
      runner.runPerformanceTests().then(() => process.exit(0)).catch(() => process.exit(1));
      break;
    case 'all':
    default:
      runner.runAll();
      break;
  }
}

module.exports = TestRunner;