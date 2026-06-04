import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: '.tmp/playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    trace: 'on-first-retry',
    viewport: {
      width: 900,
      height: 700
    }
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4179',
    cwd: './.tmp/browser-consumer',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: !process.env.CI,
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
