import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser-demo',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: '.tmp/playwright-demo-results',
  use: { baseURL: 'http://127.0.0.1:4437/ograph/', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4437 --strictPort --outDir dist/demo --base /ograph/',
    url: 'http://127.0.0.1:4437/ograph/',
    reuseExistingServer: false
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
