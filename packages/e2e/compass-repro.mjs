// 复现：一局结束→新一局开始后移动端玩家环变挤
// 手法：进入对局后量一次罗盘节点位置，再模拟 phase: playing → round_end → playing，量第二次对比
import { launchBrowser, newAuthedPage, setupGame, waitGamePhase, dismissGameOverlays } from './lib/driver.mjs';

const W = 390, H = 844;

async function measureCompass(page) {
  return page.evaluate(() => {
    const compass = document.querySelector('[data-allow-overflow]');
    if (!compass) return null;
    const nodes = [...compass.querySelectorAll('[data-player-id]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute('data-player-id'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
    });
    return { containerW: compass.clientWidth, nodes };
  });
}

const browser = await launchBrowser();
const { page, errors } = await newAuthedPage(browser, { username: 'compass-repro', width: W, height: H });

await setupGame(page, { botCount: 3 });
await dismissGameOverlays(page);
await page.waitForTimeout(1500); // 等弹簧动画稳定

const before = await measureCompass(page);
await page.screenshot({ path: 'output/compass-round1.png' });
console.log('round1:', JSON.stringify(before));

// 模拟一局结束（罗盘 return null）再开新局（重新渲染）
await page.evaluate(() => window.__uno.useGameStore.setState({ phase: 'round_end' }));
await page.waitForTimeout(800);
await page.evaluate(() => window.__uno.useGameStore.setState({ phase: 'playing', roundNumber: 2 }));
await page.waitForTimeout(1500);

const after = await measureCompass(page);
await page.screenshot({ path: 'output/compass-round2.png' });
console.log('round2:', JSON.stringify(after));

if (before && after) {
  const xs1 = before.nodes.map((n) => n.x).join(',');
  const xs2 = after.nodes.map((n) => n.x).join(',');
  console.log(xs1 === xs2 ? 'OK: 位置一致' : `BUG: 位置不一致 ${xs1} -> ${xs2}`);
}
console.log('console errors:', errors.length ? errors : '无');
await browser.close();
