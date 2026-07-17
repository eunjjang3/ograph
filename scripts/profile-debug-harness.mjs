import { chromium } from '@playwright/test';

const DEFAULT_URL = 'http://127.0.0.1:4435/';
const DEFAULT_TIMEOUT_MS = 30_000;

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const option = process.argv.find(argument => argument.startsWith(prefix));
  return option ? option.slice(prefix.length) : fallback;
}

function metricMap(metrics) {
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function readTelemetry(text) {
  const readNumber = label => {
    const match = text.match(new RegExp(`${label}:\\s+([0-9.]+)`));
    return match ? Number(match[1]) : 0;
  };
  const readText = label => {
    const match = text.match(new RegExp(`${label}:\\s+([^\\n]+)`));
    return match ? match[1].trim() : '';
  };

  return {
    graphDraws: readNumber('Graph Draws'),
    materializedNodes: readNumber('Materialized Nodes'),
    materializedLinks: readNumber('Materialized Links'),
    materializedLabels: readNumber('Materialized Labels'),
    topologySyncMs: readNumber('Topology Sync'),
    firstVisibleMs: readNumber('First Visible'),
    simulationState: readText('Simulation State'),
    frameReasons: readText('Frame Reasons')
  };
}

function summarizeProfile(profile) {
  const nodesById = new Map(profile.nodes.map(node => [node.id, node]));
  const parentById = new Map();
  for (const node of profile.nodes) {
    for (const childId of node.children ?? []) parentById.set(childId, node.id);
  }
  const selfMicrosByFrame = new Map();
  const inclusiveMicrosByFrame = new Map();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];

  for (let index = 0; index < samples.length; index += 1) {
    const node = nodesById.get(samples[index]);
    if (!node) continue;

    const frame = node.callFrame;
    const key = `${frame.functionName || '(anonymous)'}\n${frame.url || '(native)'}`;
    const delta = deltas[index] ?? 0;
    selfMicrosByFrame.set(key, (selfMicrosByFrame.get(key) ?? 0) + delta);

    let ancestor = node;
    while (ancestor) {
      const ancestorFrame = ancestor.callFrame;
      const ancestorKey = `${ancestorFrame.functionName || '(anonymous)'}\n${ancestorFrame.url || '(native)'}`;
      inclusiveMicrosByFrame.set(
        ancestorKey,
        (inclusiveMicrosByFrame.get(ancestorKey) ?? 0) + delta
      );
      ancestor = nodesById.get(parentById.get(ancestor.id));
    }
  }

  const totalMicros = deltas.reduce((total, value) => total + value, 0);
  return [...selfMicrosByFrame.entries()]
    .map(([key, selfMicros]) => {
      const [functionName, url] = key.split('\n');
      return {
        functionName,
        url,
        selfMs: round(selfMicros / 1000),
        inclusiveMs: round((inclusiveMicrosByFrame.get(key) ?? 0) / 1000),
        percent: totalMicros > 0 ? round((selfMicros / totalMicros) * 100, 1) : 0
      };
    })
    .filter(frame => !['(program)', '(idle)'].includes(frame.functionName))
    .sort((left, right) => right.selfMs - left.selfMs)
    .slice(0, 20);
}

function summarizeHeapProfile(profile) {
  const bytesByFrame = new Map();
  const visit = node => {
    const frame = node.callFrame;
    const key = `${frame.functionName || '(anonymous)'}\n${frame.url || '(native)'}`;
    bytesByFrame.set(key, (bytesByFrame.get(key) ?? 0) + (node.selfSize ?? 0));
    for (const child of node.children ?? []) visit(child);
  };
  visit(profile.head);

  return [...bytesByFrame.entries()]
    .map(([key, bytes]) => {
      const [functionName, url] = key.split('\n');
      return { functionName, url, retainedMiB: round(bytes / 1024 / 1024) };
    })
    .filter(frame => frame.retainedMiB > 0)
    .sort((left, right) => right.retainedMiB - left.retainedMiB)
    .slice(0, 20);
}

function summarizeDurations(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = value => sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)] ?? 0;
  return {
    count: sorted.length,
    totalMs: round(sorted.reduce((total, value) => total + value, 0)),
    p95Ms: round(percentile(0.95)),
    maxMs: round(sorted.at(-1) ?? 0)
  };
}

async function waitForTelemetry(page, predicate) {
  const locator = page.getByTestId('runtime-performance-telemetry');
  await locator.waitFor({ state: 'visible' });
  await page.waitForFunction(
    ({ testId, predicateSource }) => {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      if (!element) return false;
      return Function('text', `return (${predicateSource})(text)`)(element.textContent ?? '');
    },
    {
      testId: 'runtime-performance-telemetry',
      predicateSource: predicate.toString()
    },
    { timeout: DEFAULT_TIMEOUT_MS }
  );
  return readTelemetry(await locator.innerText());
}

async function runProfile(url, cycles) {
  const headed = process.argv.includes('--headed');
  const heapProfileEnabled = process.argv.includes('--heap-profile');
  const browser = await chromium.launch({
    headless: !headed,
    channel: headed ? 'chrome' : undefined,
    args: [
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows'
    ]
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await page.addInitScript(() => {
    window.__ographProfile = { active: true, longTasks: [], rafGaps: [], lastRaf: 0 };
    new PerformanceObserver(list => {
      if (!window.__ographProfile.active) return;
      for (const entry of list.getEntries()) {
        window.__ographProfile.longTasks.push({
          startTime: entry.startTime,
          duration: entry.duration
        });
      }
    }).observe({ type: 'longtask', buffered: true });

    const sampleRaf = timestamp => {
      const profile = window.__ographProfile;
      if (profile.active && profile.lastRaf > 0) {
        const gap = timestamp - profile.lastRaf;
        if (gap > 20) profile.rafGaps.push(gap);
      }
      profile.lastRaf = timestamp;
      requestAnimationFrame(sampleRaf);
    };
    requestAnimationFrame(sampleRaf);
  });

  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Pixi WebGL', exact: true }).click();
    await page.getByRole('button', { name: 'Worker', exact: true }).click();
    await waitForTelemetry(page, text => (
      text.includes('Materialized Nodes: 1000') &&
      text.includes('Simulation: worker')
    ));

    await cdp.send('HeapProfiler.collectGarbage');
    const beforeMetrics = metricMap((await cdp.send('Performance.getMetrics')).metrics);
    const beforeDom = await cdp.send('Memory.getDOMCounters');

    await page.evaluate(() => {
      window.__ographProfile.longTasks = [];
      window.__ographProfile.rafGaps = [];
      window.__ographProfile.active = true;
      performance.mark('ograph-profile-start');
    });
    if (heapProfileEnabled) {
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
    }
    await cdp.send('Profiler.start');

    const startedAt = performance.now();
    await page.getByRole('button', { name: '10000', exact: true }).click();
    const materializedTelemetry = await waitForTelemetry(page, text => (
      text.includes('Materialized Nodes: 10000') &&
      text.includes('Materialized Links: 17500')
    ));
    const materializedElapsedMs = performance.now() - startedAt;
    const profile = (await cdp.send('Profiler.stop')).profile;
    const coldWindowSamples = await page.evaluate(() => {
      const samples = {
        longTasks: [...window.__ographProfile.longTasks],
        rafGaps: [...window.__ographProfile.rafGaps]
      };
      window.__ographProfile.active = false;
      window.__ographProfile.longTasks = [];
      window.__ographProfile.rafGaps = [];
      return samples;
    });

    const idleTelemetry = await waitForTelemetry(page, text => (
      text.includes('Simulation State: idle') && text.includes('Frame Reasons: idle')
    ));
    const idleElapsedMs = performance.now() - startedAt;

    await cdp.send('HeapProfiler.collectGarbage');
    const heapProfile = heapProfileEnabled
      ? (await cdp.send('HeapProfiler.stopSampling')).profile
      : null;
    const afterMetrics = metricMap((await cdp.send('Performance.getMetrics')).metrics);
    const afterDom = await cdp.send('Memory.getDOMCounters');
    const dataAttributes = await page.getByTestId('runtime-performance-telemetry').evaluate(element => (
      Object.fromEntries([...element.attributes]
        .filter(attribute => attribute.name.startsWith('data-'))
        .map(attribute => [attribute.name, Number(attribute.value) || attribute.value]))
    ));
    const cycleHeap = [];

    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      await page.getByRole('button', { name: '1000', exact: true }).click();
      await waitForTelemetry(page, text => (
        /Materialized Nodes:\s+1000(?:\D|$)/.test(text) &&
        /Materialized Links:\s+1750(?:\D|$)/.test(text)
      ));
      await cdp.send('HeapProfiler.collectGarbage');
      const smallMetrics = metricMap((await cdp.send('Performance.getMetrics')).metrics);
      cycleHeap.push({
        cycle,
        nodes: 1000,
        jsHeapUsedMiB: round((smallMetrics.JSHeapUsedSize ?? 0) / 1024 / 1024)
      });

      await page.getByRole('button', { name: '10000', exact: true }).click();
      await waitForTelemetry(page, text => (
        /Materialized Nodes:\s+10000(?:\D|$)/.test(text) &&
        /Materialized Links:\s+17500(?:\D|$)/.test(text)
      ));
      await cdp.send('HeapProfiler.collectGarbage');
      const largeMetrics = metricMap((await cdp.send('Performance.getMetrics')).metrics);
      cycleHeap.push({
        cycle,
        nodes: 10000,
        jsHeapUsedMiB: round((largeMetrics.JSHeapUsedSize ?? 0) / 1024 / 1024)
      });
    }

    return {
      url,
      materializedElapsedMs: round(materializedElapsedMs),
      idleElapsedMs: round(idleElapsedMs),
      materializedTelemetry,
      idleTelemetry,
      runtimeDataAttributes: dataAttributes,
      memory: {
        jsHeapUsedBeforeMiB: round((beforeMetrics.JSHeapUsedSize ?? 0) / 1024 / 1024),
        jsHeapUsedAfterMiB: round((afterMetrics.JSHeapUsedSize ?? 0) / 1024 / 1024),
        jsHeapDeltaMiB: round(((afterMetrics.JSHeapUsedSize ?? 0) - (beforeMetrics.JSHeapUsedSize ?? 0)) / 1024 / 1024),
        domNodesBefore: beforeDom.nodes,
        domNodesAfter: afterDom.nodes,
        documentsAfter: afterDom.documents,
        listenersAfter: afterDom.jsEventListeners
      },
      coldLongTasks: summarizeDurations(coldWindowSamples.longTasks.map(entry => entry.duration)),
      coldRafGaps: summarizeDurations(coldWindowSamples.rafGaps),
      topCpuFrames: summarizeProfile(profile),
      topRetainedAllocations: heapProfile ? summarizeHeapProfile(heapProfile) : [],
      cycleHeap
    };
  } finally {
    await browser.close();
  }
}

const url = readOption('url', DEFAULT_URL);
const runs = Math.max(1, Number(readOption('runs', '1')) || 1);
const cycles = Math.max(0, Number(readOption('cycles', '0')) || 0);
const results = [];

for (let index = 0; index < runs; index += 1) {
  results.push(await runProfile(url, cycles));
}

console.log(JSON.stringify({ runs: results }, null, 2));
