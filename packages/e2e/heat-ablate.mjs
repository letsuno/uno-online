// 消融实验：逐个「摘掉」可疑特效，量出各自对 raster / CPU 的真实贡献
// 用法: ABLATE='<css selector>' node heat-ablate.mjs   (空 = 基线)
import { launchBrowser, newAuthedPage, setupGame, dismissGameOverlays, emit } from './lib/driver.mjs';

const ABLATE = process.env.ABLATE ?? '';
const SECS = Number(process.env.SECS ?? 15);
const LABEL = process.env.LABEL ?? (ABLATE || 'baseline');

const browser = await launchBrowser();
const { page } = await newAuthedPage(browser, { username: 'heat-abl', width: 390, height: 844 });

// 在任何渲染前挂上 observer：匹配到的节点一出现就摘掉，等价于该特效不存在
if (ABLATE) {
  await page.addInitScript((sel) => {
    const kill = (root) => {
      for (const el of root.querySelectorAll?.(sel) ?? []) el.remove();
    };
    const start = () => {
      kill(document);
      new MutationObserver((recs) => {
        for (const r of recs)
          for (const n of r.addedNodes) {
            if (n.nodeType !== 1) continue;
            if (n.matches?.(sel)) { n.remove(); continue; }
            kill(n);
          }
      }).observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }, ABLATE);
}

await setupGame(page, { botCount: 3 });
await page.waitForTimeout(2000);
await dismissGameOverlays(page);
await page.waitForTimeout(11000);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const get = (m, n) => m.metrics.find((x) => x.name === n)?.value ?? 0;
const snap = async () => {
  const m = await cdp.send('Performance.getMetrics');
  return { recalc: get(m, 'RecalcStyleCount'), layout: get(m, 'LayoutCount'), task: get(m, 'TaskDuration'), proc: get(m, 'ProcessTime') };
};

let raster = 0;
let rasterMs = 0;
let paintFull = 0;
cdp.on('Tracing.dataCollected', (d) => {
  for (const e of d.value) {
    if (e.name === 'RasterTask' && e.ph === 'X') { raster++; rasterMs += (e.dur ?? 0) / 1000; }
    if (e.name === 'Paint' && e.ph === 'X') paintFull++;
  }
});

const before = await snap();
await cdp.send('Tracing.start', {
  traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'toplevel'] },
  transferMode: 'ReportEvents',
});

const end = Date.now() + SECS * 1000;
let plays = 0;
while (Date.now() < end) {
  await emit(page, 'game:autopilot_once');
  plays++;
  await page.waitForTimeout(400);
}

const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.end');
await done;
const after = await snap();

// 摘掉的节点数（确认消融真的生效）
console.log(JSON.stringify({
  实验: LABEL,
  秒数: SECS,
  出牌次数: plays,
  RasterTask次数: raster,
  RasterTask每秒: +(raster / SECS).toFixed(1),
  Raster线程耗时秒: +(rasterMs / 1000).toFixed(2),
  Paint次数: paintFull,
  渲染进程CPU秒: +(after.proc - before.proc).toFixed(2),
  渲染进程CPU核数: +((after.proc - before.proc) / SECS).toFixed(2),
  主线程Task秒: +(after.task - before.task).toFixed(2),
  RecalcStyle每秒: +((after.recalc - before.recalc) / SECS).toFixed(1),
  Layout次数: Math.round(after.layout - before.layout),
}));
await browser.close();
