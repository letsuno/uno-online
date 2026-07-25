// 对局中性能对比：autopilot 连续打 15s，采样主线程占用（dev vs prod）
import { launchBrowser, newAuthedPage, setupGame, dismissGameOverlays, emit } from '/root/uno-online/packages/e2e/lib/driver.mjs';

const W = Number(process.argv[2] ?? 390), H = Number(process.argv[3] ?? 844);
const browser = await launchBrowser();
const { page } = await newAuthedPage(browser, { username: 'perf-play', width: W, height: H });
await setupGame(page, { botCount: 3 });
await page.waitForTimeout(2500);
await dismissGameOverlays(page);
await page.waitForTimeout(11000); // toast 消失

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');

const m1 = await cdp.send('Performance.getMetrics');
// 连续打 15s：轮到我时 autopilot_once
const end = Date.now() + 15000;
while (Date.now() < end) {
  await emit(page, 'game:autopilot_once');
  await page.waitForTimeout(400);
}
const m2 = await cdp.send('Performance.getMetrics');
const get = (m, n) => m.metrics.find((x) => x.name === n)?.value ?? 0;
console.log(`对局 15s: RecalcStyle ${Math.round(get(m2, 'RecalcStyleCount') - get(m1, 'RecalcStyleCount'))}, Layout ${Math.round(get(m2, 'LayoutCount') - get(m1, 'LayoutCount'))}, Task ${(get(m2, 'TaskDuration') - get(m1, 'TaskDuration')).toFixed(2)}s, Process ${(get(m2, 'ProcessTime') - get(m1, 'ProcessTime')).toFixed(2)}s`);
await browser.close();
