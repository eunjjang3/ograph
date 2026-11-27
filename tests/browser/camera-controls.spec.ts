import { test, expect, type Page } from '@playwright/test';

async function viewport(page: Page) {
  return JSON.parse(await page.getByTestId('camera-viewport').innerText());
}

async function installProbe(page: Page, fallback = false) {
    await page.addInitScript((fallback) => {
      (window as any).__workerMessages = 0;
      (window as any).__workerProbe = { created: 0, terminated: 0, ready: 0, tick: 0, settled: 0, initializations: [], webgl: 0 };
      (window as any).__draws = 0;
      const WorkerBase = window.Worker;
      window.Worker = class extends WorkerBase {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (fallback) throw new Error('Test Worker fallback');
          super(url, options);
          (window as any).__workerProbe.created++;
          this.addEventListener('message', event => {
            (window as any).__workerMessages++;
            const probe = (window as any).__workerProbe;
            if (['ready', 'tick', 'settled'].includes(event.data.type)) probe[event.data.type]++;
          });
        }
        postMessage(message: any, transfer: any = []) {
          if (message.type === 'initialize') (window as any).__workerProbe.initializations.push(message);
          super.postMessage(message, transfer);
        }
        terminate() {
          (window as any).__workerProbe.terminated++;
          super.terminate();
        }
      };
      const original = HTMLCanvasElement.prototype.getContext;
      const seen = new WeakSet<object>();
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: any[]) {
        if (fallback && String(args[0]).startsWith('webgl')) return null;
        const context = Reflect.apply(original, this, args) as any;
        if (context && !seen.has(context)) {
          if (String(args[0]).startsWith('webgl')) (window as any).__workerProbe.webgl++;
          seen.add(context);
          for (const method of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'clearRect']) {
            if (typeof context[method] !== 'function') continue;
            const draw = context[method].bind(context);
            context[method] = (...values: any[]) => {
              (window as any).__draws++;
              return draw(...values);
            };
          }
        }
        return context;
      } as any;
    }, fallback);
}

async function workerProbe(page: Page) {
  return page.evaluate(() => (window as any).__workerProbe);
}

for (const fallback of [false, true]) {
  test(`camera controls preserve zoom and follow rendered nodes (${fallback ? 'Canvas/main' : 'Pixi/Worker'})`, async ({ page }) => {
    await installProbe(page, fallback);
    await page.goto('/?camera-controls');
    await expect(page.locator('canvas')).toBeVisible();
    if (!fallback) {
      await expect.poll(async () => (await workerProbe(page)).ready).toBeGreaterThan(0);
      await expect.poll(async () => (await workerProbe(page)).tick).toBeGreaterThan(1);
      expect((await workerProbe(page)).webgl).toBeGreaterThan(0);
    }
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await expect.poll(async () => (await viewport(page)).scale).toBe(1.75);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForTimeout(250);
    expect((await viewport(page)).scale).toBe(1.75);
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await page.waitForTimeout(500);
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 380, y: 260 } });
    await expect(page.getByTestId('camera-clicked')).toHaveText('target:Target:undefined');
    expect((await viewport(page)).scale).toBe(1.75);

    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const frozen = await viewport(page);
    await page.waitForTimeout(200);
    expect(await viewport(page)).toEqual(frozen);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    const stopped = await viewport(page);
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await page.waitForTimeout(250);
    expect(await viewport(page)).toEqual(stopped);

    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForTimeout(200);
    expect(await viewport(page)).toEqual({ x: 380, y: 260, scale: 1 });
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await page.getByRole('button', { name: 'Auto', exact: true }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(async () => (await viewport(page)).scale).not.toBe(1.75);
    await page.getByRole('button', { name: 'Auto', exact: true }).click();
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    expect((await viewport(page)).scale).not.toBe(1.75);
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    expect(await page.evaluate(() => (window as any).__draws)).toBeGreaterThan(0);
    await expect.poll(async () => {
      const before = await page.evaluate(() => (window as any).__draws);
      await page.waitForTimeout(300);
      return (await page.evaluate(() => (window as any).__draws)) - before;
    }, { timeout: 15_000 }).toBe(0);
  });
}


test('Worker retains settled physics across reference and payload updates without camera following', async ({ page }) => {
  await installProbe(page);
  await page.goto('/?camera-controls');
  await expect.poll(async () => (await workerProbe(page)).settled, { timeout: 10_000 }).toBeGreaterThan(0);
  const settled = await workerProbe(page);
  expect(settled.ready).toBeGreaterThan(0);
  expect(settled.tick).toBeGreaterThan(1);
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  for (let i = 0; i < 3; i++) await button('Rerender').click();
  await button('Rename').click();
  await page.waitForTimeout(300);
  const updated = await workerProbe(page);
  expect(updated.created).toBe(settled.created);
  expect(updated.terminated).toBe(settled.terminated);
  expect(updated.tick).toBe(settled.tick);
  await button('Focus').click();
  await page.locator('canvas').click({ position: { x: 380, y: 260 } });
  await expect(page.getByTestId('camera-clicked')).toHaveText('target:Target renamed:true');

  await button('Pause').click();
  await button('Resize nodes').click();
  await expect.poll(async () => (await workerProbe(page)).created).toBe(updated.created + 1);
  await expect.poll(async () => (await workerProbe(page)).ready).toBe(updated.ready + 1);
  const resized = await workerProbe(page);
  expect(resized.initializations.at(-1).nodes.every((node: any) => node.size === 2)).toBe(true);
  expect(resized.initializations.at(-1).config.paused).toBe(true);
  await page.waitForTimeout(250);
  expect((await workerProbe(page)).tick).toBe(resized.tick);

  await button('Physics').click();
  await expect.poll(async () => (await workerProbe(page)).ready).toBe(resized.ready + 1);
  const physics = await workerProbe(page);
  expect(physics.initializations.at(-1).config.chargeStrength).toBe(-60);
  await button('Link').click();
  await expect.poll(async () => (await workerProbe(page)).ready).toBe(physics.ready + 1);
  const linked = await workerProbe(page);
  expect(linked.initializations.at(-1).links).toHaveLength(1);
  await button('Pause').click();
  await expect.poll(async () => (await workerProbe(page)).tick).toBeGreaterThan(linked.tick);
  await button('Mount').click();
  await expect(page.locator('canvas')).toHaveCount(0);
  const unmounted = await workerProbe(page);
  expect(unmounted.terminated).toBe(unmounted.created);
  await page.waitForTimeout(250);
  expect((await workerProbe(page)).tick).toBe(unmounted.tick);
  await button('Mount').click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect.poll(async () => (await workerProbe(page)).ready).toBeGreaterThan(unmounted.ready);
});
