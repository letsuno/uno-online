// 渲染来源探针：统计各 zustand store 的 setState 频率 + rAF 回调计数
import { launchBrowser, newAuthedPage, setupGame, dismissGameOverlays } from '/root/uno-online/packages/e2e/lib/driver.mjs';

const browser = await launchBrowser();
const { page } = await newAuthedPage(browser, { username: 'perf-probe', width: 390, height: 844 });
await setupGame(page, { botCount: 3 });
await page.waitForTimeout(2000);
await dismissGameOverlays(page);
await page.waitForTimeout(500);

const result = await page.evaluate(() => new Promise((resolve) => {
  const uno = window.__uno;
  const counts = {};
  const origs = {};
  for (const [name, store] of Object.entries(uno)) {
    if (store && typeof store.setState === 'function') {
      origs[name] = store.setState;
      counts[name] = 0;
      store.setState = (...args) => { counts[name]++; return origs[name](...args); };
    }
  }
  // rAF 回调计数
  let rafCount = 0;
  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { rafCount++; return origRaf(cb); };
  // 全局 setInterval/setTimeout 速率
  let timeouts = 0;
  const origSt = window.setTimeout.bind(window);
  window.setTimeout = (cb, ms, ...r) => { timeouts++; return origSt(cb, ms, ...r); };

  setTimeout(() => {
    for (const [name, store] of Object.entries(uno)) {
      if (origs[name]) store.setState = origs[name];
    }
    window.requestAnimationFrame = origRaf;
    window.setTimeout = origSt;
    resolve({ seconds: 10, storeSetStates: counts, rafScheduled: rafCount, timeoutsScheduled: timeouts });
  }, 10000);
}));
console.log(JSON.stringify(result, null, 2));
await browser.close();
