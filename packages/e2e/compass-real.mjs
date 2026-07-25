// 真实对局验证：autopilot 打完一整局 → round_end → 投票开新局 → 对比罗盘间距
import { launchBrowser, newAuthedPage, setupGame, waitGamePhase, dismissGameOverlays, emit } from '/root/uno-online/packages/e2e/lib/driver.mjs';

const browser = await launchBrowser();
const { page, errors } = await newAuthedPage(browser, { username: 'compass-real', width: 390, height: 844 });
await setupGame(page, { botCount: 3 });
await dismissGameOverlays(page);

async function measure(page) {
  return page.evaluate(() => {
    const compass = document.querySelector('[data-allow-overflow]');
    if (!compass) return null;
    const nodes = [...compass.querySelectorAll('[data-player-id]')].map((el) => {
      const r = el.getBoundingClientRect();
      return Math.round(r.x + r.width / 2); // 中心 x
    }).sort((a, b) => a - b);
    const gaps = nodes.slice(1).map((x, i) => x - nodes[i]);
    return { containerW: compass.clientWidth, nodes, gaps };
  });
}

await page.waitForTimeout(1200);
const r1 = await measure(page);
console.log('round1:', JSON.stringify(r1));
await page.screenshot({ path: 'output/compass-real-r1.png' });

// 全程 autopilot 打完这一局
await emit(page, 'game:autopilot_once'); // 兜底：autopilot_once 只打一手，循环打
for (let i = 0; i < 400; i++) {
  const phase = await page.evaluate(() => window.__uno.useGameStore.getState().phase);
  if (phase === 'round_end' || phase === 'game_over') break;
  await emit(page, 'game:autopilot_once');
  await page.waitForTimeout(700);
}
const endPhase = await page.evaluate(() => window.__uno.useGameStore.getState().phase);
console.log('end phase:', endPhase);
if (endPhase !== 'round_end' && endPhase !== 'game_over') {
  console.log('FAIL: 对局未结束');
  await browser.close();
  process.exit(1);
}

// 投票开新局（房主需重复投票：第一次计票，再次投票触发开始；开局有冷却，轮询直到 started）
let started = false;
for (let i = 0; i < 20 && !started; i++) {
  const res = await emit(page, 'game:next_round');
  started = res?.started === true;
  if (!started) await page.waitForTimeout(2000);
}
console.log('next round started:', started);
await waitGamePhase(page, 'playing', 20000);
await page.waitForTimeout(1500);
const r2 = await measure(page);
console.log('round2:', JSON.stringify(r2));
await page.screenshot({ path: 'output/compass-real-r2.png' });

// 间距多重集一致即修复（绝对位置会随当前玩家旋转，排序后比较）
const sorted = (a) => [...(a ?? [])].sort((x, y) => x - y);
console.log(JSON.stringify(sorted(r1?.gaps)) === JSON.stringify(sorted(r2?.gaps)) ? 'OK: 间距一致' : 'CHECK: 间距不同');
console.log('console errors:', errors.length ? errors : '无');
await browser.close();
