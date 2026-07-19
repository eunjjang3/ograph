import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('playwright-core/lib/utilsBundle') as {
  PNG: {
    sync: {
      read(buffer: Buffer): { data: Uint8Array; height: number; width: number };
    };
  };
};

type RuntimeProbe = {
  cspViolations: Array<{ blockedURI: string; directive: string }>;
  workerAttempts: number;
  workerConstructionErrors: string[];
  workerErrors: string[];
  workerMessageTypes: string[];
  workerUrls: string[];
};

const unexpectedBrowserErrors = new WeakMap<Page, string[]>();

async function installRuntimeProbe(page: Page) {
  await page.addInitScript(() => {
    const runtimeWindow = window as typeof window & { __ographRuntimeProbe: RuntimeProbe };
    const probe: RuntimeProbe = {
      cspViolations: [],
      workerAttempts: 0,
      workerConstructionErrors: [],
      workerErrors: [],
      workerMessageTypes: [],
      workerUrls: []
    };
    runtimeWindow.__ographRuntimeProbe = probe;

    document.addEventListener('securitypolicyviolation', event => {
      probe.cspViolations.push({
        blockedURI: event.blockedURI,
        directive: event.effectiveDirective
      });
    });

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
      const context = Reflect.apply(originalGetContext, this, args);
      const contextId = String(args[0]);
      if (context && (contextId === '2d' || contextId === 'webgl' || contextId === 'webgl2')) {
        Object.defineProperty(this, '__ographProbeContextKind', {
          configurable: true,
          value: contextId
        });
      }
      return context;
    } as typeof originalGetContext;

    const NativeWorker = window.Worker;
    class ProbedWorker extends NativeWorker {
      constructor(scriptURL: string | URL, workerOptions?: WorkerOptions) {
        probe.workerAttempts += 1;
        probe.workerUrls.push(new URL(String(scriptURL), window.location.href).href);
        try {
          super(scriptURL, workerOptions);
        } catch (caught) {
          probe.workerConstructionErrors.push(
            caught instanceof Error ? caught.message : String(caught)
          );
          throw caught;
        }

        this.addEventListener('message', event => {
          const value = event.data;
          if (value && typeof value === 'object' && typeof value.type === 'string') {
            probe.workerMessageTypes.push(value.type);
          }
        });
        this.addEventListener('error', event => {
          probe.workerErrors.push(event.message || 'Worker error');
        });
      }
    }
    window.Worker = ProbedWorker;
  });
}

async function graphCanvas(page: Page) {
  const canvases = page.locator('canvas');
  await expect(canvases).toHaveCount(1);
  const canvas = page.getByLabel('Next production graph');
  await expect(canvas).toBeVisible();
  return canvas;
}

async function readRuntimeProbe(page: Page): Promise<RuntimeProbe> {
  return page.evaluate(() => (
    window as typeof window & { __ographRuntimeProbe: RuntimeProbe }
  ).__ographRuntimeProbe);
}

async function readVisibleCanvasContext(page: Page) {
  return (await graphCanvas(page)).evaluate(canvas => (
    (canvas as HTMLCanvasElement & { __ographProbeContextKind?: string })
      .__ographProbeContextKind ?? 'unknown'
  ));
}

async function readEffectiveRuntimeState(page: Page) {
  const probe = await readRuntimeProbe(page);
  const workerUrls = probe.workerUrls.map(value => new URL(value));
  const visibleContext = await readVisibleCanvasContext(page);

  return {
    browserErrorCount: (unexpectedBrowserErrors.get(page) ?? []).length,
    canvasCount: await page.locator('canvas').count(),
    cspViolationCount: probe.cspViolations.length,
    renderer: visibleContext.startsWith('webgl') ? 'webgl' : visibleContext,
    workerConstructionErrorCount: probe.workerConstructionErrors.length,
    workerErrorCount: probe.workerErrors.length,
    workerOrigins: [...new Set(workerUrls.map(url => url.origin))],
    workerProtocols: [...new Set(workerUrls.map(url => url.protocol))],
    workerReady: probe.workerMessageTypes.includes('ready'),
    workerTick: probe.workerMessageTypes.includes('tick')
  };
}

async function readCanvasPixels(
  page: Page,
  expectedBackground: [number, number, number] | null = null
) {
  await page.evaluate(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  });
  const canvas = await graphCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Graph canvas has no bounding box.');

  const screenshot = await page.screenshot({
    animations: 'disabled',
    clip: box,
    omitBackground: true
  });
  const pixels = PNG.sync.read(screenshot).data;
  let backgroundPixels = 0;
  let magentaLinkPixels = 0;
  let magentaTintPixels = 0;
  let nonMagentaGraphPixels = 0;
  let opaquePixels = 0;
  let transparentPixels = 0;
  let visibleGraphPixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const alpha = pixels[index + 3] ?? 0;
    const backgroundDistance = expectedBackground
      ? Math.abs(red - expectedBackground[0]) +
        Math.abs(green - expectedBackground[1]) +
        Math.abs(blue - expectedBackground[2])
      : null;
    const isMagentaLink = alpha >= 16 && red >= 180 && green <= 80 && blue >= 180;
    const hasMagentaTint = alpha >= 16 && red - green >= 12 && blue - green >= 12;
    const isVisibleGraph =
      alpha >= 16 &&
      (backgroundDistance === null ? red + green + blue >= 24 : backgroundDistance >= 24);
    if (alpha <= 4) transparentPixels += 1;
    if (alpha >= 250) opaquePixels += 1;
    if (backgroundDistance !== null && alpha >= 250 && backgroundDistance <= 6) {
      backgroundPixels += 1;
    }
    if (isMagentaLink) magentaLinkPixels += 1;
    if (hasMagentaTint) magentaTintPixels += 1;
    if (isVisibleGraph) {
      visibleGraphPixels += 1;
      if (!isMagentaLink) nonMagentaGraphPixels += 1;
    }
  }

  return {
    backgroundPixels,
    magentaLinkPixels,
    magentaTintPixels,
    nonMagentaGraphPixels,
    opaquePixels,
    transparentPixels,
    visibleGraphPixels
  };
}

async function readCanvasCenterPixels(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  });
  const canvas = await graphCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Graph canvas has no bounding box.');

  const screenshot = await page.screenshot({
    animations: 'disabled',
    clip: box,
    omitBackground: true
  });
  const png = PNG.sync.read(screenshot);
  const centerX = Math.floor(png.width / 2);
  const centerY = Math.floor(png.height / 2);
  const centerIndex = (centerY * png.width + centerX) * 4;
  const centerAlpha = png.data[centerIndex + 3] ?? 0;
  let linkTintPixels = 0;
  let neutralPixels = 0;

  for (let y = centerY - 5; y <= centerY + 5; y += 1) {
    for (let x = centerX - 5; x <= centerX + 5; x += 1) {
      const index = (y * png.width + x) * 4;
      const red = png.data[index] ?? 0;
      const green = png.data[index + 1] ?? 0;
      const blue = png.data[index + 2] ?? 0;
      const alpha = png.data[index + 3] ?? 0;
      if (alpha < 16) continue;
      if (red - green >= 12 && blue - green >= 12) linkTintPixels += 1;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) <= 12) {
        neutralPixels += 1;
      }
    }
  }

  return { centerAlpha, linkTintPixels, neutralPixels };
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  unexpectedBrowserErrors.set(page, errors);
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await installRuntimeProbe(page);
  await page.goto('/');
  await graphCanvas(page);
  await expect(page.getByTestId('event-errors')).toHaveText('none');
});

test.afterEach(async ({ page }) => {
  await expect(page.getByTestId('event-errors')).toHaveText('none');
});

test('keeps the packed Next production runtime on Pixi and Worker under strict CSP', async ({ page }) => {
  await expect.poll(async () => (await readRuntimeProbe(page)).workerAttempts).toBeGreaterThan(0);
  await expect.poll(() => readEffectiveRuntimeState(page)).toEqual({
    browserErrorCount: 0,
    canvasCount: 1,
    cspViolationCount: 0,
    renderer: 'webgl',
    workerConstructionErrorCount: 0,
    workerErrorCount: 0,
    workerOrigins: ['http://127.0.0.1:4310'],
    workerProtocols: ['http:'],
    workerReady: true,
    workerTick: true
  });
});

test('keeps a transparent theme transparent with visible graph pixels', async ({ page }) => {
  const pixels = await readCanvasPixels(page);
  expect(pixels.visibleGraphPixels).toBeGreaterThan(50);
  expect(pixels.transparentPixels).toBeGreaterThan(1_000);
});

test('keeps an opaque theme opaque without hiding graph pixels', async ({ page }) => {
  await page.getByTestId('toggle-link-probe').click();
  await expect(page.getByTestId('link-probe')).toHaveText('on');
  await page.getByTestId('toggle-background').click();
  await expect(page.getByTestId('background-mode')).toHaveText('opaque');

  const pixels = await readCanvasPixels(page, [22, 22, 26]);
  expect(pixels.opaquePixels).toBeGreaterThan(1_000);
  expect(pixels.backgroundPixels).toBeGreaterThan(1_000);
  expect(pixels.magentaTintPixels).toBeGreaterThan(50);
  expect(pixels.visibleGraphPixels).toBeGreaterThan(50);
  expect(pixels.transparentPixels).toBeLessThan(100);
});

test('renders the 5k fixture with and without selected/root focus', async ({ page }) => {
  const tickCountBefore = (await readRuntimeProbe(page)).workerMessageTypes
    .filter(type => type === 'tick').length;

  await page.getByTestId('fixture-5000').click();
  await expect(page.getByTestId('fixture-size')).toHaveText('5000');
  await expect.poll(async () => (
    (await readRuntimeProbe(page)).workerMessageTypes.filter(type => type === 'tick').length
  )).toBeGreaterThan(tickCountBefore);
  await expect.poll(async () => (await readCanvasPixels(page)).visibleGraphPixels)
    .toBeGreaterThan(50);

  await page.getByTestId('toggle-link-probe').click();
  await expect(page.getByTestId('link-probe')).toHaveText('on');
  await expect.poll(async () => (await readCanvasPixels(page)).magentaLinkPixels)
    .toBeGreaterThan(50);
  await expect.poll(async () => (await readCanvasPixels(page)).nonMagentaGraphPixels)
    .toBeGreaterThan(50);

  await page.getByTestId('toggle-focus').click();
  await expect(page.getByTestId('focus-mode')).toHaveText('none');
  await expect.poll(async () => (await readCanvasPixels(page)).visibleGraphPixels)
    .toBeGreaterThan(50);
  await expect.poll(async () => (await readCanvasPixels(page)).magentaLinkPixels)
    .toBeGreaterThan(50);
  await expect.poll(async () => (await readCanvasPixels(page)).nonMagentaGraphPixels)
    .toBeGreaterThan(50);
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('occludes links behind focus-dimmed nodes on a transparent canvas', async ({ page }) => {
  await page.getByTestId('toggle-occlusion-probe').click();
  await expect(page.getByTestId('occlusion-probe')).toHaveText('on');
  await expect.poll(async () => {
    await page.getByTestId('center-occlusion-probe').click();
    return page.getByTestId('camera-focused').textContent();
  }).toBe('true');

  await expect.poll(async () => (await readCanvasCenterPixels(page)).neutralPixels)
    .toBeGreaterThan(20);
  await expect.poll(async () => (await readCanvasCenterPixels(page)).centerAlpha)
    .toBeLessThan(220);
  const pixels = await readCanvasCenterPixels(page);
  expect(pixels.linkTintPixels).toBe(0);
});

test('retains exactly one consumer canvas through the StrictMode mount', async ({ page }) => {
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.waitForTimeout(250);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('event-errors')).toHaveText('none');
});
