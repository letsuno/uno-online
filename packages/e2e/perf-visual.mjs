// 视觉验证：脉冲辉光/虚线行进/待选色 渲染正常（两张不同时刻截图对比辉光强度变化）
import { launchBrowser, newAuthedPage, setupGame, dismissGameOverlays } from '/root/uno-online/packages/e2e/lib/driver.mjs';

const W = Number(process.argv[2] ?? 390), H = Number(process.argv[3] ?? 844);
const tag = process.argv[4] ?? 'mobile';
const browser = await launchBrowser();
const { page } = await newAuthedPage(browser, { username: 'visual-perf', width: W, height: H });
await setupGame(page, { botCount: 3 });
await page.waitForTimeout(2500);
await dismissGameOverlays(page);
await page.waitForTimeout(11000);

// 量一下 active 头像的辉光亮度随时间变化（证明脉冲在动且合成）
const glow = await page.evaluate(() => new Promise((resolve) => {
  const el = document.querySelector('.animate-draw-pulse');
  if (!el) return resolve('没有 .animate-draw-pulse 元素');
  const samples = [];
  let n = 0;
  const iv = setInterval(() => {
    const opacity = getComputedStyle(el, '::after').opacity;
    samples.push(opacity);
    if (++n >= 6) { clearInterval(iv); resolve(samples.join(' → ')); }
  }, 250);
}));
console.log('draw-pulse ::after opacity 采样:', glow);

await page.screenshot({ path: `output/perf-visual-${tag}-1.png` });
await page.waitForTimeout(500);
await page.screenshot({ path: `output/perf-visual-${tag}-2.png` });
await browser.close();
