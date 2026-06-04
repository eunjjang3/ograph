import { expect, test, type Page } from '@playwright/test';

const BACKGROUND_RGB = [22, 22, 26] as const;

async function graphCanvas(page: Page) {
  const canvas = page.getByLabel('Packed browser graph');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('role', 'img');
  return canvas;
}

async function canvasBox(page: Page) {
  const canvas = await graphCanvas(page);
  const box = await canvas.boundingBox();

  if (!box) {
    throw new Error('Graph canvas has no bounding box.');
  }

  return box;
}

async function expectNoGraphErrors(page: Page) {
  await expect(page.getByTestId('event-errors')).toHaveText('none');
}

async function expectCanvasHasGraphPixels(page: Page) {
  await expect.poll(async () => page.evaluate((backgroundRgb) => {
    const canvas = document.querySelector('canvas');

    if (!canvas) {
      return 0;
    }

    const context = canvas.getContext('2d');

    if (!context || canvas.width === 0 || canvas.height === 0) {
      return 0;
    }

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let changedPixels = 0;

    for (let index = 0; index < pixels.length; index += 32) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      const distanceFromBackground =
        Math.abs(red - backgroundRgb[0]) +
        Math.abs(green - backgroundRgb[1]) +
        Math.abs(blue - backgroundRgb[2]);

      if (alpha > 0 && distanceFromBackground > 12) {
        changedPixels += 1;
      }
    }

    return changedPixels;
  }, BACKGROUND_RGB)).toBeGreaterThan(20);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await graphCanvas(page);
  await expectNoGraphErrors(page);
});

test('mounts the packed package canvas and renders empty graphs safely', async ({ page }) => {
  await page.getByTestId('fixture-empty').click();
  await graphCanvas(page);
  await expect(page.getByTestId('fixture-name')).toHaveText('empty');
  await expectNoGraphErrors(page);
});

test('renders medium and invalid graph fixtures with non-background pixels', async ({ page }) => {
  await page.getByTestId('fixture-medium').click();
  await expect(page.getByTestId('fixture-name')).toHaveText('medium');
  await expectCanvasHasGraphPixels(page);
  await expectNoGraphErrors(page);

  await page.getByTestId('fixture-invalid').click();
  await expect(page.getByTestId('fixture-name')).toHaveText('invalid');
  await expectCanvasHasGraphPixels(page);
  await expectNoGraphErrors(page);
});

test('supports node hover, click, drag, and drag release from the packed package', async ({ page }) => {
  await page.getByTestId('fixture-single').click();
  await expect(page.getByTestId('fixture-name')).toHaveText('single');
  await page.getByTestId('fit').click();
  await expectCanvasHasGraphPixels(page);

  const box = await canvasBox(page);
  await expect.poll(async () => Number(await page.getByTestId('event-viewport-x').textContent()))
    .toBeGreaterThan(20);
  await expect.poll(async () => Number(await page.getByTestId('event-viewport-y').textContent()))
    .toBeGreaterThan(20);

  const target = {
    x: box.x + Number(await page.getByTestId('event-viewport-x').textContent()),
    y: box.y + Number(await page.getByTestId('event-viewport-y').textContent())
  };

  await page.mouse.move(target.x, target.y);
  await expect(page.getByTestId('event-hover')).toHaveText('center');

  await page.mouse.click(target.x, target.y);
  await expect(page.getByTestId('event-click')).toHaveText('center');

  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x + 90, target.y + 36, { steps: 8 });

  await expect(page.getByTestId('event-drag-start')).toHaveText('center');
  await expect.poll(async () => Number(await page.getByTestId('event-drag-count').textContent()))
    .toBeGreaterThan(0);

  await page.mouse.up();
  await expect(page.getByTestId('event-drag-end')).toHaveText('center');
  await expectNoGraphErrors(page);
});

test('updates viewport through pan and anchored wheel zoom', async ({ page }) => {
  await page.getByTestId('fixture-empty').click();
  const box = await canvasBox(page);
  const startViewportEvents = Number(await page.getByTestId('event-viewport-count').textContent());

  await page.mouse.move(box.x + 80, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 120, { steps: 4 });
  await page.mouse.up();

  await expect.poll(async () => Number(await page.getByTestId('event-viewport-count').textContent()))
    .toBeGreaterThan(startViewportEvents);

  const beforeWheelScale = Number(await page.getByTestId('event-viewport-scale').textContent());
  await page.mouse.wheel(0, -180);
  await expect.poll(async () => Number(await page.getByTestId('event-viewport-scale').textContent()))
    .toBeGreaterThan(beforeWheelScale);
  await expectNoGraphErrors(page);
});

test('switches local and global graph modes without stale interaction errors', async ({ page }) => {
  await page.getByTestId('fixture-local').click();
  await page.getByTestId('mode-local').click();

  await expect(page.getByTestId('fixture-name')).toHaveText('local');
  await expect(page.getByTestId('mode-name')).toHaveText('local');
  await expectCanvasHasGraphPixels(page);
  await expectNoGraphErrors(page);

  await page.getByTestId('mode-global').click();
  await expect(page.getByTestId('mode-name')).toHaveText('global');
  await expectCanvasHasGraphPixels(page);
  await expectNoGraphErrors(page);
});
