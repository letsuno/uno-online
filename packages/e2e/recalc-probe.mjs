// 定位 style recalc 来源：逐一禁用动画对比 RecalcStyleCount
import { launchBrowser, newAuthedPage, setupGame, dismissGameOverlays } from '/root/uno-online/packages/e2e/lib/driver.mjs';

const W = Number(process.argv[2] ?? 390), H = Number(process.argv[3] ?? 844);
const browser = await launchBrowser();
const { page } = await newAuthedPage(browser, { username: 'recalc-probe', width: W, height: H });
await setupGame(page, { botCount: 3 });
await page.waitForTimeout(2500);
await dismissGameOverlays(page);
await page.waitForTimeout(11000); // 等反作弊 toast 自行消失

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');

async function measure(label, seconds = 6) {
  const m1 = await cdp.send('Performance.getMetrics');
  await page.waitForTimeout(seconds * 1000);
  const m2 = await cdp.send('Performance.getMetrics');
  const get = (m, n) => m.metrics.find((x) => x.name === n)?.value ?? 0;
  console.log(`${label}: RecalcStyle ${Math.round(get(m2, 'RecalcStyleCount') - get(m1, 'RecalcStyleCount'))}, Layout ${Math.round(get(m2, 'LayoutCount') - get(m1, 'LayoutCount'))}, Task ${(get(m2, 'TaskDuration') - get(m1, 'TaskDuration')).toFixed(2)}s`);
}

await measure('baseline(无干预)');

await page.addStyleTag({ content: '.animate-draw-pulse::after { display: none !important; }' });
await measure('禁用 drawReadyPulse');
await page.removeStyleTag?.();

await page.addStyleTag({ content: '.animate-dash-march-cw, .animate-dash-march-ccw { animation: none !important; }' });
await measure('再禁用 dash-march');

await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' });
await measure('再禁用全部动画');

await browser.close();
