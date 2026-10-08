// Playwright configuration. `npm test` builds the site first and the tests run
// against dist/ served by scripts/serve.mjs (a plain static file server).
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.TEST_PORT || 4173);

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'es-ES',
  },
  projects: [
    { name: 'functional', testDir: 'tests/functional', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'visual', testDir: 'tests/visual', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node scripts/serve.mjs --port ${PORT}`,
    url: `http://localhost:${PORT}/es/`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
});
