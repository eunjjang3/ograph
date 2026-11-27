import { expect, test, type Page } from '@playwright/test';

async function hoverCenter(page: Page) {
  const canvas = page.getByLabel('Packed browser graph');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = Number(await page.getByTestId('event-viewport-x').textContent());
  const y = Number(await page.getByTestId('event-viewport-y').textContent());
  await page.mouse.move(box!.x + x, box!.y + y);
  await expect(page.getByTestId('event-hover')).toHaveText('center');
}

// Change presentation without moving the pointer off the node: this catches
// stale hover UI and unintended physics restarts on a presentation-only update.
async function setTooltip(page: Page, mode: string) {
  await page.getByTestId(`tooltip-${mode}`).evaluate((button: HTMLButtonElement) => button.click());
}

for (const fallback of [false, true]) {
  test(`packed tooltip styles, replacement and hiding (${fallback ? 'Canvas/main fallback' : 'Pixi/Worker'})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(fail => {
      const probe = { initializes: 0, restarts: 0, ready: 0, ticks: 0, workerAttempts: 0, webglAttempts: 0 };
      (window as any).__tooltipProbe = probe;
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: any[]) {
        if (String(args[0]).startsWith('webgl')) {
          probe.webglAttempts++;
          if (fail) return null;
        }
        return Reflect.apply(original, this, args);
      } as typeof original;
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          probe.workerAttempts++;
          if (fail) throw new Error('Intentional tooltip fallback probe');
          super(url, options);
          this.addEventListener('message', event => {
            if (event.data.type === 'ready') probe.ready++;
            if (event.data.type === 'tick') probe.ticks++;
          });
        }
        postMessage(message: any, ...rest: any[]) {
          if (message.type === 'initialize') probe.initializes++;
          if (message.type === 'restart') probe.restarts++;
          return Reflect.apply(super.postMessage, this, [message, ...rest]);
        }
      };
    }, fallback);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?tooltip-test');
    await page.getByTestId('fixture-single').click();
    await expect(page.getByTestId('fixture-name')).toHaveText('single');
    await expect.poll(() => page.evaluate(() => (window as any).__tooltipProbe.webglAttempts)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (window as any).__tooltipProbe.workerAttempts)).toBeGreaterThan(0);
    if (!fallback) {
      await expect.poll(() => page.evaluate(() => (window as any).__tooltipProbe.ready)).toBeGreaterThan(0);
      await expect.poll(() => page.evaluate(() => (window as any).__tooltipProbe.ticks)).toBeGreaterThan(0);
    }
    await expect.poll(async () => Number(await page.getByTestId('event-viewport-x').textContent())).toBeGreaterThan(20);
    await page.getByTestId('fit').click();
    await hoverCenter(page);
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toHaveText('Center(hub)');
    await expect(tooltip).toHaveCSS('background-color', 'rgb(30, 30, 36)');
    await expect(tooltip).toHaveCSS('border-radius', '4px');
    await expect(tooltip).toHaveCSS('left', '16px');
    await expect(tooltip).toHaveCSS('pointer-events', 'none');
    const before = await page.evaluate(() => ({ ...(window as any).__tooltipProbe }));
    const viewportBefore = await page.getByTestId('event-viewport-scale').textContent();

    await setTooltip(page, 'styled');
    await expect(tooltip).toHaveClass('consumer-tooltip');
    await expect(tooltip).toHaveCSS('background-color', 'rgb(255, 247, 237)');
    await expect(tooltip).toHaveCSS('color', 'rgb(124, 45, 18)');
    await expect(tooltip).toHaveCSS('border-radius', '18px');
    await expect(tooltip).toHaveCSS('right', '24px');
    await expect(tooltip.locator('span').nth(0)).toHaveCSS('background-color', 'rgb(234, 88, 12)');
    await expect(tooltip.locator('span').nth(0)).toHaveCSS('border-radius', '2px');
    await expect(tooltip.locator('span').nth(1)).toHaveCSS('font-weight', '700');
    await expect(tooltip.locator('span').nth(2)).toHaveCSS('color', 'rgb(154, 52, 18)');

    await setTooltip(page, 'disabled');
    await expect(tooltip).toHaveCount(0);
    await expect(page.getByTestId('event-hover')).toHaveText('center');
    await setTooltip(page, 'custom');
    await expect(page.getByTestId('custom-tooltip')).toHaveText('CenterConsumer metadata');
    await expect(tooltip).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(tooltip).toHaveCSS('padding', '0px');
    await expect(tooltip.locator('span')).toHaveCount(0);
    await setTooltip(page, 'null');
    await expect(tooltip).toHaveCount(0);
    await setTooltip(page, 'true');
    await expect(tooltip).toHaveText('Center(hub)');
    await expect(tooltip).toHaveCSS('border-radius', '4px');

    const after = await page.evaluate(() => ({ ...(window as any).__tooltipProbe }));
    expect(after.initializes).toBe(before.initializes);
    expect(after.restarts).toBe(before.restarts);
    await expect(page.getByTestId('event-viewport-scale')).toHaveText(viewportBefore!);
    await setTooltip(page, 'disabled');
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId('event-click')).toHaveText('center');
    await setTooltip(page, 'custom');
    await page.mouse.move(5, 5);
    await expect(tooltip).toHaveCount(0);
    await expect(page.getByTestId('event-hover')).toHaveText('none');
    await page.getByTestId('fixture-empty').click();
    await expect(tooltip).toHaveCount(0);
    await expect(page.getByTestId('event-errors')).toHaveText('none');
    expect(errors).toEqual([]);
  });
}
