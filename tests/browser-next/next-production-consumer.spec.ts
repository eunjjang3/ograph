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

async function readTransparentCanvasPixels(page: Page) {
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
  let transparentPixels = 0;
  let graphPixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] ?? 0;
    if (alpha <= 4) transparentPixels += 1;
    if (alpha >= 16) graphPixels += 1;
  }

  return { graphPixels, transparentPixels };
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
  const pixels = await readTransparentCanvasPixels(page);
  expect(pixels.transparentPixels).toBeGreaterThan(1_000);
  expect(pixels.graphPixels).toBeGreaterThan(50);
});

test('retains exactly one consumer canvas through the StrictMode mount', async ({ page }) => {
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.waitForTimeout(250);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('event-errors')).toHaveText('none');
});
