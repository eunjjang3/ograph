import { defineConfig, devices } from '@playwright/test';

const consumerPort = Number(process.env.OGRAPH_BROWSER_PORT ?? 4179);

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
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  use: {
    baseURL: `http://127.0.0.1:${consumerPort}`,
    trace: 'on-first-retry',
    viewport: {
      width: 900,
      height: 700
    }
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${consumerPort} --strictPort`,
    cwd: './.tmp/browser-consumer',
    url: `http://127.0.0.1:${consumerPort}`,
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
