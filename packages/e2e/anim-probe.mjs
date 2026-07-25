// 列出页面上所有正在运行的 CSS/Web 动画
import { launchBrowser, newAuthedPage, setupGame, dismissGameOverlays } from '/root/uno-online/packages/e2e/lib/driver.mjs';

const W = Number(process.argv[2] ?? 390), H = Number(process.argv[3] ?? 844);
const browser = await launchBrowser();
const { page } = await newAuthedPage(browser, { username: 'anim-probe', width: W, height: H });
await setupGame(page, { botCount: 3 });
await page.waitForTimeout(2500);
await dismissGameOverlays(page);
await page.waitForTimeout(11000); // 等反作弊 toast 消失

const anims = await page.evaluate(() => {
  const seen = new Map();
  for (const a of document.getAnimations({ subtree: true })) {
    const el = a.effect?.target;
    const cls = el?.className?.baseVal ?? el?.className ?? '';
    const pseudo = el?.pseudoElement ?? '';
    const key = `${a.constructor.name}|${a.animationName ?? ''}|${pseudo}|${String(cls).slice(0, 60)}|playState=${a.playState}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].map(([k, c]) => `${c}× ${k}`);
});
console.log(anims.join('\n'));
await browser.close();
