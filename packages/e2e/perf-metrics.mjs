// 性能基线/对比：CDP Performance metrics（样式重算、布局、任务时长）+ 截图场景
import { launchBrowser, newAuthedPage, setupGame, dismissGameOverlays } from '/root/uno-online/packages/e2e/lib/driver.mjs';

const W = Number(process.argv[2] ?? 390), H = Number(process.argv[3] ?? 844);

const browser = await launchBrowser();
const { page } = await newAuthedPage(browser, { username: 'perf-metrics', width: W, height: H });
await setupGame(page, { botCount: 3 });
await page.waitForTimeout(2000);
await dismissGameOverlays(page);
await page.waitForTimeout(1000);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');

async function sample(label, seconds) {
  const m1 = await cdp.send('Performance.getMetrics');
  const t1 = Date.now();
  await page.waitForTimeout(seconds * 1000);
  const m2 = await cdp.send('Performance.getMetrics');
  const t2 = Date.now();
  const get = (m, n) => m.metrics.find((x) => x.name === n)?.value ?? 0;
  const dt = (t2 - t1) / 1000;
  console.log(`[${label}] ${dt.toFixed(1)}s`);
  for (const n of ['RecalcStyleCount', 'LayoutCount', 'TaskDuration', 'TaskOtherDuration', 'ThreadTime', 'ProcessTime', 'JSHeapUsedSize', 'Nodes', 'JSEventListeners']) {
    const d = get(m2, n) - get(m1, n);
    console.log(`  ${n}: delta ${n.endsWith('Count') || n === 'Nodes' || n === 'JSEventListeners' ? Math.round(d) : (d / (n.includes('Duration') || n.includes('Time') ? 1 : 1)).toFixed(2)}${n.includes('Duration') || n.includes('Time') ? 's' : ''}`);
  }
}

// 场景1：静止（轮到我，什么都不动）
await sample('idle 静止', 12);
await browser.close();
