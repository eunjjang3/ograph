import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('playwright-core/lib/utilsBundle');
const errors = new WeakMap<Page, string[]>();

async function graphPixelCount(page: Page, centerOnly = false) {
  const png = PNG.sync.read(await page.locator('canvas').screenshot());
  let visible = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const x = (i / 4) % png.width, y = Math.floor(i / 4 / png.width);
    if (centerOnly && (x < png.width / 4 || x > png.width * .75 || y < png.height / 4 || y > png.height * .75)) continue;
    if (png.data[i + 3] > 50 && Math.max(png.data[i], png.data[i + 1], png.data[i + 2]) > 75) visible++;
  }
  return visible;
}

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
  page.on('console', message => { if (message.type() === 'error') messages.push(message.text()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('production Pages path renders motion controls, exploration, and accurate copy examples', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const workers: string[] = [];
  page.on('worker', worker => workers.push(worker.url()));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Ideas move better together.' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect.poll(() => workers.some(url => url.includes('/ograph/assets/'))).toBe(true);
  await expect.poll(() => graphPixelCount(page)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Calm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calm', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('pre')).toContainText("physicsPreset: 'calm'");
  await page.getByRole('button', { name: 'Copy React example', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("physicsPreset: 'calm'");
  await page.getByLabel('Choose a node').selectOption({ label: 'Design' });
  await page.getByRole('button', { name: 'Explore neighborhood' }).click();
  await expect(page.getByText('Neighborhood view', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(page.getByRole('button', { name: 'Show all' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await expect(page.getByRole('button', { name: 'Replay motion' })).toBeDisabled();
  await page.getByRole('button', { name: 'Resume motion' }).click();
  await page.getByRole('button', { name: 'Replay motion' }).click();
  await page.getByLabel('Sample graph').selectOption('250');
  await expect(page.getByRole('region', { name: 'Interactive graph preview' }).getByText('250 nodes', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Choose a node')).toHaveValue('');
  await expect.poll(() => graphPixelCount(page)).toBeGreaterThan(100);
});

test('debug lab loads from the Pages subpath and browser back returns to the playground', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Debug lab' }).click();
  await expect(page.getByRole('heading', { name: 'Ograph Debug Suite' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Ideas move better together.' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('mobile layout keeps graph and controls usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect.poll(() => graphPixelCount(page)).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Paper', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Paper', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Lively', exact: true }).click();
  await expect(page.locator('pre')).toContainText("physicsPreset: 'lively'");
  await page.getByLabel('Choose a node').selectOption({ label: 'React' });
  await page.getByRole('button', { name: 'Explore neighborhood' }).click();
  await expect(page.getByRole('button', { name: 'Show all' })).toBeVisible();
});


test('resizing refits the preview while preserving the chosen motion', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Calm', exact: true }).click();
  for (const width of [390, 1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => graphPixelCount(page, true)).toBeGreaterThan(100);
    await expect(page.getByRole('button', { name: 'Calm', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
});
