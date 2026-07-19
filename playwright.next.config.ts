import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser-next',
  timeout: 45_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: '.tmp/playwright-next-results',
  use: {
    baseURL: 'http://127.0.0.1:4310',
    trace: 'on-first-retry',
    viewport: {
      width: 900,
      height: 900
    }
  },
  webServer: {
    command: 'npm run start',
    cwd: './.tmp/next-browser-consumer',
    url: 'http://127.0.0.1:4310',
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ]
});
