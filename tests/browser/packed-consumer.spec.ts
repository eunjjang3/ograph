import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('playwright-core/lib/utilsBundle') as {
  PNG: {
    sync: {
      read(buffer: Buffer): { data: Uint8Array };
    };
  };
};

const BACKGROUND_RGB = [22, 22, 26] as const;
const NON_EMPTY_FIXTURES = [
  'single',
  'small',
  'medium',
  'dense',
  'disconnected',
  'invalid'
] as const;
// Removing this warning requires a native non-passive wheel listener and an
// explicit decision about whether graph zoom should suppress page scrolling.
const ALLOWED_CONSOLE_ERRORS = [
  'Unable to preventDefault inside passive event listener invocation.'
] as const;
// Canvas2D and WebGL rasterize curved borders with slightly different edge
// antialiasing. The dense fixture differs on 0.58% of pixels while preserving
// geometry, color, and layout, so retain the Canvas baseline with a narrow
// cross-backend tolerance instead of replacing it with a Pixi-only baseline.
const VISUAL_MAX_DIFF_PIXEL_RATIO = 0.007;
const unexpectedBrowserErrors = new WeakMap<Page, string[]>();

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

type RuntimeProbe = {
  webglAttempts: number;
  workerAttempts: number;
};

async function graphCanvas(page: Page) {
  const canvases = page.locator('canvas');
  await expect(canvases).toHaveCount(1);

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

async function changedCanvasPixels(page: Page) {
  const screenshot = await (await graphCanvas(page)).screenshot({ animations: 'disabled' });
  const pixels = PNG.sync.read(screenshot).data;
  let changedPixels = 0;

  for (let index = 0; index < pixels.length; index += 32) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const alpha = pixels[index + 3] ?? 0;
    const distanceFromBackground =
      Math.abs(red - BACKGROUND_RGB[0]) +
      Math.abs(green - BACKGROUND_RGB[1]) +
      Math.abs(blue - BACKGROUND_RGB[2]);

    if (alpha > 0 && distanceFromBackground > 12) {
      changedPixels += 1;
    }
  }

  return changedPixels;
}

async function installRuntimeProbe(
  page: Page,
  options: { failWebgl?: boolean; failWorker?: boolean } = {}
) {
  await page.addInitScript(({ failWebgl, failWorker }) => {
    const runtimeWindow = window as typeof window & { __ographRuntimeProbe: RuntimeProbe };
    runtimeWindow.__ographRuntimeProbe = {
      webglAttempts: 0,
      workerAttempts: 0
    };

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
      const contextId = String(args[0]);
      if (contextId === 'webgl' || contextId === 'webgl2') {
        runtimeWindow.__ographRuntimeProbe.webglAttempts += 1;
        if (failWebgl) return null;
      }
      return Reflect.apply(originalGetContext, this, args);
    } as typeof originalGetContext;

    const NativeWorker = window.Worker;
    class ProbedWorker extends NativeWorker {
      constructor(scriptURL: string | URL, workerOptions?: WorkerOptions) {
        runtimeWindow.__ographRuntimeProbe.workerAttempts += 1;
        if (failWorker) {
          throw new Error('Forced graph Worker construction failure.');
        }
        super(scriptURL, workerOptions);
      }
    }
    window.Worker = ProbedWorker;
  }, options);
}

async function readRuntimeProbe(page: Page): Promise<RuntimeProbe> {
  return page.evaluate(() => (
    window as typeof window & { __ographRuntimeProbe: RuntimeProbe }
  ).__ographRuntimeProbe);
}

async function expectCanvasHasGraphPixels(page: Page) {
  await expect.poll(() => changedCanvasPixels(page)).toBeGreaterThan(20);
}

async function expectCanvasIsBackgroundOnly(page: Page) {
  await expect.poll(() => changedCanvasPixels(page)).toBeLessThanOrEqual(2);
}

async function setFixture(page: Page, name: string) {
  await page.getByTestId(`fixture-${name}`).click();
  await expect(page.getByTestId('fixture-name')).toHaveText(name);
  await graphCanvas(page);
  await expectNoGraphErrors(page);
}

async function readViewport(page: Page): Promise<Viewport> {
  return {
    x: Number(await page.getByTestId('event-viewport-x').textContent()),
    y: Number(await page.getByTestId('event-viewport-y').textContent()),
    scale: Number(await page.getByTestId('event-viewport-scale').textContent())
  };
}

async function singleNodeTarget(page: Page) {
  await setFixture(page, 'single');
  await page.getByTestId('fit').click();
  await expectCanvasHasGraphPixels(page);

  const box = await canvasBox(page);
  await expect.poll(async () => (await readViewport(page)).x).toBeGreaterThan(20);
  await expect.poll(async () => (await readViewport(page)).y).toBeGreaterThan(20);
  const viewport = await readViewport(page);

  return {
    x: box.x + viewport.x,
    y: box.y + viewport.y
  };
}

async function readDiagnostics(page: Page) {
  return page.evaluate(() => {
    const diagnostics = (window as typeof window & {
      __ographDiagnostics: {
        activeAnimationFrameCount: () => number;
        activeGraphListenerCount: () => number;
        activeGraphListenerCounts: () => Record<string, number>;
      };
    }).__ographDiagnostics;

    return {
      frames: diagnostics.activeAnimationFrameCount(),
      listeners: diagnostics.activeGraphListenerCount(),
      listenersByType: diagnostics.activeGraphListenerCounts()
    };
  });
}

async function prepareVisualState(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await graphCanvas(page);
  await page.getByTestId('toggle-pause').click();
  await expect(page.getByTestId('graph-paused')).toHaveText('yes');
}

async function fitVisualFixture(page: Page) {
  await page.getByTestId('fit').click();
  await page.waitForTimeout(220);
  await expectCanvasHasGraphPixels(page);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  unexpectedBrowserErrors.set(page, errors);
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (
      message.type() === 'error' &&
      !ALLOWED_CONSOLE_ERRORS.some(allowed => message.text().includes(allowed))
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });

  await page.goto('/');
  await graphCanvas(page);
  await expectNoGraphErrors(page);
});

test.afterEach(async ({ page }) => {
  expect(unexpectedBrowserErrors.get(page) ?? []).toEqual([]);
  await expectNoGraphErrors(page);
});

test('mounts exactly one packed package canvas and renders the required fixture matrix safely', async ({ page }) => {
  await setFixture(page, 'empty');
  await expectCanvasIsBackgroundOnly(page);

  for (const fixture of NON_EMPTY_FIXTURES) {
    await setFixture(page, fixture);
    await expectCanvasHasGraphPixels(page);
  }
});

test('uses the packaged Pixi/Worker runtime by default without public API opt-in', async ({ page }) => {
  await installRuntimeProbe(page);
  await page.reload();
  await setFixture(page, 'medium');
  await expectCanvasHasGraphPixels(page);
  await expect.poll(async () => (await readRuntimeProbe(page)).webglAttempts).toBeGreaterThan(0);
  await expect.poll(async () => (await readRuntimeProbe(page)).workerAttempts).toBeGreaterThan(0);
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('falls back to one Canvas 2D graph when WebGL initialization is unavailable', async ({ page }) => {
  await installRuntimeProbe(page, { failWebgl: true });
  await page.reload();
  await setFixture(page, 'medium');
  await expectCanvasHasGraphPixels(page);
  await expect.poll(async () => (await readRuntimeProbe(page)).webglAttempts).toBeGreaterThan(0);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expectNoGraphErrors(page);
});

test('falls back to main-thread simulation when Worker construction fails', async ({ page }) => {
  await installRuntimeProbe(page, { failWorker: true });
  await page.reload();
  await setFixture(page, 'medium');
  await expectCanvasHasGraphPixels(page);
  await expect.poll(async () => (await readRuntimeProbe(page)).workerAttempts).toBeGreaterThan(0);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expectNoGraphErrors(page);
});

test('supports node hover, click, double-click, drag, and terminal pointer-loss release', async ({ page }) => {
  const target = await singleNodeTarget(page);

  await page.mouse.move(target.x, target.y);
  await expect(page.getByTestId('event-hover')).toHaveText('center');

  await page.mouse.click(target.x, target.y);
  await expect(page.getByTestId('event-click')).toHaveText('center');
  await expect(page.getByTestId('selected-node')).toHaveText('center');

  await page.waitForTimeout(300);
  await page.mouse.dblclick(target.x, target.y, { delay: 40 });
  await expect(page.getByTestId('event-double-click')).toHaveText('center');

  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x + 90, target.y + 36, { steps: 8 });
  await expect(page.getByTestId('event-drag-start')).toHaveText('center');
  await expect.poll(async () => Number(await page.getByTestId('event-drag-count').textContent()))
    .toBeGreaterThan(0);
  await page.mouse.up();
  await expect(page.getByTestId('event-drag-end')).toHaveText('center');

  const dragStartsBeforeMissedEnd = Number(
    await page.getByTestId('event-drag-start-count').textContent()
  );
  const dragEndsBeforeMissedEnd = Number(
    await page.getByTestId('event-drag-end-count').textContent()
  );
  const movedTarget = { x: target.x + 90, y: target.y + 36 };

  await page.mouse.move(movedTarget.x, movedTarget.y);
  await page.mouse.down();
  await page.mouse.move(movedTarget.x + 42, movedTarget.y + 24, { steps: 5 });
  await expect.poll(async () => Number(await page.getByTestId('event-drag-start-count').textContent()))
    .toBeGreaterThan(dragStartsBeforeMissedEnd);

  await page.evaluate(() => {
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect.poll(async () => Number(await page.getByTestId('event-drag-end-count').textContent()))
    .toBeGreaterThan(dragEndsBeforeMissedEnd);
  await page.mouse.up();

  const dragStartsAfterMissedEnd = Number(
    await page.getByTestId('event-drag-start-count').textContent()
  );
  await page.mouse.move(movedTarget.x + 42, movedTarget.y + 24);
  await page.mouse.down();
  await page.mouse.move(movedTarget.x + 70, movedTarget.y + 48, { steps: 5 });
  await expect.poll(async () => Number(await page.getByTestId('event-drag-start-count').textContent()))
    .toBeGreaterThan(dragStartsAfterMissedEnd);
  await page.mouse.up();
  await expectNoGraphErrors(page);
});

test('keeps pan usable and preserves the wheel pointer anchor within tolerance', async ({ page }) => {
  await setFixture(page, 'empty');
  const box = await canvasBox(page);
  const startViewportEvents = Number(await page.getByTestId('event-viewport-count').textContent());

  await page.mouse.move(box.x + 80, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 120, { steps: 4 });
  await page.mouse.up();

  await expect.poll(async () => Number(await page.getByTestId('event-viewport-count').textContent()))
    .toBeGreaterThan(startViewportEvents);

  const anchor = { x: 260, y: 220 };
  const beforeWheel = await readViewport(page);
  const beforeWorld = {
    x: (anchor.x - beforeWheel.x) / beforeWheel.scale,
    y: (anchor.y - beforeWheel.y) / beforeWheel.scale
  };

  await page.mouse.move(box.x + anchor.x, box.y + anchor.y);
  await page.mouse.wheel(0, -180);
  await expect.poll(async () => (await readViewport(page)).scale).toBeGreaterThan(beforeWheel.scale);
  await page.waitForTimeout(450);

  const afterWheel = await readViewport(page);
  const afterWorld = {
    x: (anchor.x - afterWheel.x) / afterWheel.scale,
    y: (anchor.y - afterWheel.y) / afterWheel.scale
  };

  expect(Math.abs(afterWorld.x - beforeWorld.x)).toBeLessThan(1.5);
  expect(Math.abs(afterWorld.y - beforeWorld.y)).toBeLessThan(1.5);
  await expectNoGraphErrors(page);
});

test('focuses the camera by controlled prop and ref without erroring on unavailable nodes', async ({ page }) => {
  await page.getByTestId('toggle-pause').click();
  await expect(page.getByTestId('graph-paused')).toHaveText('yes');
  await setFixture(page, 'disconnected');
  await page.waitForTimeout(220);

  await page.getByTestId('reset').click();
  await page.getByTestId('focus-prop').click();
  await expect.poll(async () => (await readViewport(page)).scale).toBeCloseTo(1.25, 2);
  const controlledFocus = await readViewport(page);
  expect(Math.abs(controlledFocus.x - 217.5)).toBeLessThan(2);
  expect(Math.abs(controlledFocus.y - 222.5)).toBeLessThan(2);

  await page.getByTestId('focus-missing-ref').click();
  await expect(page.getByTestId('event-camera-focus')).toHaveText('false');
  await page.waitForTimeout(80);
  const afterMissing = await readViewport(page);
  expect(Math.abs(afterMissing.x - controlledFocus.x)).toBeLessThan(0.2);
  expect(Math.abs(afterMissing.y - controlledFocus.y)).toBeLessThan(0.2);
  expect(Math.abs(afterMissing.scale - controlledFocus.scale)).toBeLessThan(0.001);

  await page.getByTestId('focus-ref').click();
  await expect(page.getByTestId('event-camera-focus')).toHaveText('true');
  await expect.poll(async () => (await readViewport(page)).scale).toBeCloseTo(1.5, 2);
  const refFocus = await readViewport(page);
  expect(Math.abs(refFocus.x - 650)).toBeLessThan(2);
  expect(Math.abs(refFocus.y - 350)).toBeLessThan(2);
  await expectNoGraphErrors(page);
});

test('redraws after resize without resetting the user viewport', async ({ page }) => {
  await setFixture(page, 'local');
  await page.getByTestId('fit').click();
  await expectCanvasHasGraphPixels(page);
  await page.waitForTimeout(180);

  const beforeBox = await canvasBox(page);
  await page.mouse.move(beforeBox.x + 80, beforeBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(beforeBox.x + 140, beforeBox.y + 115, { steps: 5 });
  await page.mouse.up();
  const beforeResize = await readViewport(page);

  await page.getByTestId('toggle-size').click();
  await expect.poll(async () => (await canvasBox(page)).width).toBeLessThan(beforeBox.width);
  await expectCanvasHasGraphPixels(page);
  await page.waitForTimeout(180);

  const afterResize = await readViewport(page);
  expect(Math.abs(afterResize.x - beforeResize.x)).toBeLessThan(0.1);
  expect(Math.abs(afterResize.y - beforeResize.y)).toBeLessThan(0.1);
  expect(Math.abs(afterResize.scale - beforeResize.scale)).toBeLessThan(0.001);
  await expectNoGraphErrors(page);
});

test('clears inaccessible hover and consumer-controlled selection across local/global transitions', async ({ page }) => {
  await page.getByTestId('toggle-pause').click();
  await expect(page.getByTestId('graph-paused')).toHaveText('yes');
  await setFixture(page, 'local');
  await page.getByTestId('fit').click();
  await page.getByTestId('select-first').click();
  await expect(page.getByTestId('selected-node')).toHaveText('local-root');

  const box = await canvasBox(page);
  const viewport = await readViewport(page);
  const outsideTarget = {
    x: box.x + viewport.x + 240 * viewport.scale,
    y: box.y + viewport.y + 160 * viewport.scale
  };

  await page.mouse.move(outsideTarget.x, outsideTarget.y);
  await expect(page.getByTestId('event-hover')).toHaveText('local-outside');

  await page.getByTestId('mode-local').click();
  await expect(page.getByTestId('mode-name')).toHaveText('local');
  await expect(page.getByTestId('event-hover')).toHaveText('none');
  await expect(page.getByTestId('selected-node')).toHaveText('none');
  await expectCanvasHasGraphPixels(page);

  await page.getByTestId('mode-global').click();
  await expect(page.getByTestId('mode-name')).toHaveText('global');
  await expect(page.getByTestId('event-hover')).toHaveText('none');
  await expect(page.getByTestId('selected-node')).toHaveText('none');
  await expectCanvasHasGraphPixels(page);
  await expectNoGraphErrors(page);
});

test('StrictMode unmount and remount leave no duplicate listeners or animation frames', async ({ page }) => {
  // Six listeners belong to GraphView itself; the seventh confirms that the
  // asynchronously loaded Pixi backend has finished installing its event
  // system. Waiting for that stable state avoids comparing a half-initialized
  // mount with a settled remount.
  await expect.poll(async () => (await readDiagnostics(page)).listeners).toBe(7);
  const mountedDiagnostics = await readDiagnostics(page);

  await page.getByTestId('toggle-mount').click();
  await expect(page.getByTestId('graph-mounted')).toHaveText('no');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect.poll(async () => (await readDiagnostics(page)).listeners).toBe(0);
  await expect.poll(async () => (await readDiagnostics(page)).frames).toBe(0);

  await page.getByTestId('toggle-mount').click();
  await expect(page.getByTestId('graph-mounted')).toHaveText('yes');
  await graphCanvas(page);
  await expect.poll(async () => (await readDiagnostics(page)).listeners)
    .toBe(mountedDiagnostics.listeners);

  await page.getByTestId('toggle-mount').click();
  await expect.poll(async () => (await readDiagnostics(page)).listeners).toBe(0);
  await expect.poll(async () => (await readDiagnostics(page)).frames).toBe(0);
  await expectNoGraphErrors(page);
});

test('captures deterministic visual smoke states', async ({ page }) => {
  await prepareVisualState(page);

  await setFixture(page, 'empty');
  await expectCanvasIsBackgroundOnly(page);
  await expect(await graphCanvas(page)).toHaveScreenshot('empty.png', {
    animations: 'disabled',
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO
  });

  await setFixture(page, 'local');
  await fitVisualFixture(page);
  await expect(await graphCanvas(page)).toHaveScreenshot('basic.png', {
    animations: 'disabled',
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO
  });

  await setFixture(page, 'local');
  await fitVisualFixture(page);
  await page.getByTestId('select-first').click();
  await expect(page.getByTestId('selected-node')).toHaveText('local-root');
  await expectCanvasHasGraphPixels(page);
  await expect(await graphCanvas(page)).toHaveScreenshot('selected-node.png', {
    animations: 'disabled',
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO
  });

  await setFixture(page, 'disconnected');
  await setFixture(page, 'local');
  await fitVisualFixture(page);
  const hoverBox = await canvasBox(page);
  const hoverViewport = await readViewport(page);
  await page.mouse.move(hoverBox.x + hoverViewport.x, hoverBox.y + hoverViewport.y);
  await expect(page.getByTestId('event-hover')).toHaveText('local-root');
  await expectCanvasHasGraphPixels(page);
  await expect(await graphCanvas(page)).toHaveScreenshot('hovered-node.png', {
    animations: 'disabled',
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO
  });

  await page.getByTestId('mode-local').click();
  await expect(page.getByTestId('mode-name')).toHaveText('local');
  await expectCanvasHasGraphPixels(page);
  await expect(await graphCanvas(page)).toHaveScreenshot('local-lens.png', {
    animations: 'disabled',
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO
  });

  await page.getByTestId('mode-global').click();
  await setFixture(page, 'dense');
  await fitVisualFixture(page);
  await expect(await graphCanvas(page)).toHaveScreenshot('dense.png', {
    animations: 'disabled',
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO
  });
});
