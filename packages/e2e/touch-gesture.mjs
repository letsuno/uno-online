// 触屏手势测试：上滑出牌、滑动选牌、不可出牌弹回（CDP Input.dispatchTouchEvent）
import { launchBrowser, newAuthedPage, setupGame, dismissGameOverlays, emit } from '/root/uno-online/packages/e2e/lib/driver.mjs';

const browser = await launchBrowser();
const { page, errors } = await newAuthedPage(browser, { username: 'gesture-test', width: 390, height: 844 });
await setupGame(page, { botCount: 3 });
await page.waitForTimeout(2000);
await dismissGameOverlays(page);
await page.waitForTimeout(11000); // 等反作弊 toast 消失

const cdp = await page.context().newCDPSession(page);
let touchId = 0;
async function touch(type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: touchId + i })),
  });
  if (type === 'touchEnd') touchId++;
}
async function swipe(points, { holdMs = 0, stepMs = 16 } = {}) {
  await touch('touchStart', [points[0]]);
  if (holdMs) await page.waitForTimeout(holdMs);
  for (let i = 1; i < points.length; i++) {
    await touch('touchMove', [points[i]]);
    await page.waitForTimeout(stepMs);
  }
  await touch('touchEnd', [points[points.length - 1]]);
  await page.waitForTimeout(400);
}

// 等到我的回合
async function waitMyTurn() {
  await page.waitForFunction(() => {
    const s = window.__uno.useGameStore.getState();
    const me = s.players.find((p) => p.id === s.viewerId);
    return s.phase === 'playing' && s.players[s.currentPlayerIndex]?.id === me?.id;
  }, null, { timeout: 30000 });
  await page.waitForTimeout(600);
}

const state = () => page.evaluate(() => {
  const s = window.__uno.useGameStore.getState();
  const me = s.players.find((p) => p.id === s.viewerId);
  return { handCount: me?.hand.length ?? -1, phase: s.phase, current: s.players[s.currentPlayerIndex]?.id, me: s.viewerId };
});
const cardCenter = (id) => page.evaluate((cid) => {
  const el = document.querySelector(`[data-card-id="${cid}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, id);
// 等手牌停止滚动/动画（坐标连续 3 次稳定）
async function waitHandStable() {
  await page.waitForFunction(() => {
    const els = [...document.querySelectorAll('[data-card-id]')];
    if (els.length === 0) return false;
    const key = els.map((el) => Math.round(el.getBoundingClientRect().x)).join(',');
    if (window.__handKey === key) {
      window.__handStable = (window.__handStable ?? 0) + 1;
    } else {
      window.__handKey = key;
      window.__handStable = 0;
    }
    return window.__handStable >= 3;
  }, null, { timeout: 10000, polling: 150 }).catch(() => {});
}
// 可出牌（带金色 drop-shadow 的）
const playableCardIds = () => page.evaluate(() =>
  [...document.querySelectorAll('[data-card-id]')]
    .filter((el) => el.querySelector('span')?.style.filter.includes('drop-shadow'))
    .map((el) => el.getAttribute('data-card-id')));
const raisedCardId = () => page.evaluate(() => {
  for (const el of document.querySelectorAll('[data-card-id]')) {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    if (m.m42 < -20) return el.getAttribute('data-card-id'); // translateY < -20px = 抬起
  }
  return null;
});

let pass = 0, fail = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); ok ? pass++ : fail++; };

// ---------- 1. 上滑出牌 ----------
await waitMyTurn();
await waitHandStable();
const before1 = await state();
const playable1 = await playableCardIds();
check(playable1.length > 0, `轮到我且有 ${playable1.length} 张可出牌`);
if (playable1.length > 0) {
  const target = playable1[Math.floor(playable1.length / 2)];
  await page.evaluate((cid) => {
    document.querySelector(`[data-card-id="${cid}"]`)?.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' });
  }, target);
  await waitHandStable();
  const c = await cardCenter(target);
  console.log(`  [debug] 目标牌 ${target} 中心 (${Math.round(c.x)},${Math.round(c.y)})`);
  const path = [];
  for (let i = 1; i <= 8; i++) path.push({ x: c.x, y: c.y - i * 18 }); // 上滑 144px
  await swipe([c, ...path]);
  const after1 = await state();
  if (!(after1.handCount === before1.handCount - 1 || after1.current !== before1.me || after1.phase !== 'playing')) {
    const dbg = await page.evaluate(() => {
      let raised = null;
      for (const el of document.querySelectorAll('[data-card-id]')) {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        if (m.m42 < -20) raised = el.getAttribute('data-card-id');
      }
      return { raised, overlays: [...document.querySelectorAll('body > div')].length };
    });
    console.log('  [debug] 上滑未生效:', JSON.stringify({ target, ...dbg }));
  }
  check(after1.handCount === before1.handCount - 1 || after1.current !== before1.me || after1.phase !== 'playing',
    `上滑出牌生效（手牌 ${before1.handCount} → ${after1.handCount}）`);
}

// ---------- 2. 滑动选牌 ----------
await waitMyTurn().catch(() => {});
await waitHandStable();
const all = await page.evaluate(() =>
  [...document.querySelectorAll('[data-card-id]')].map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.getAttribute('data-card-id'), cx: r.x + r.width / 2 };
  }).sort((a, b) => a.cx - b.cx));
check(all.length >= 3, `手牌 ${all.length} 张足以滑选`);
if (all.length >= 3) {
  const visible = all.filter((c) => c.cx > 20 && c.cx < 370);
  const from = visible[0] ?? all[0];
  const to = visible[Math.min(visible.length - 1, 3)] ?? from; // 滑到右侧第 4 张可见牌附近
  const y = (await cardCenter(from.id)).y;
  console.log(`  [debug] 滑选 from ${from.id}(${Math.round(from.cx)},${Math.round(y)}) → ${to.id}(${Math.round(to.cx)})`);
  const path = [];
  const steps = 10;
  for (let i = 1; i <= steps; i++) path.push({ x: from.cx + ((to.cx - from.cx) * i) / steps, y });
  await swipe([{ x: from.cx, y }, ...path], { holdMs: 300, stepMs: 30 });
  const raised = await raisedCardId();
  const raisedX = all.find((c) => c.id === raised)?.cx ?? -999;
  check(raised !== null && Math.abs(raisedX - to.cx) < 60,
    `滑动选牌：期望选中 x≈${Math.round(to.cx)} 的牌，实际 ${raised} x≈${Math.round(raisedX)}`);
  // 点空白取消选中
  await touch('touchStart', [{ x: 195, y: 400 }]);
  await page.waitForTimeout(40);
  await touch('touchEnd', [{ x: 195, y: 400 }]);
  await page.waitForTimeout(300);
}

// ---------- 3. 上滑未过打出线：可出牌也不打出（防误触） ----------
await waitMyTurn().catch(() => {});
await waitHandStable();
const before25 = await state();
const playable25 = await playableCardIds();
if (playable25.length > 0) {
  const target = playable25[0];
  await page.evaluate((cid) => {
    document.querySelector(`[data-card-id="${cid}"]`)?.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' });
  }, target);
  await waitHandStable();
  const c = await cardCenter(target);
  const path = [];
  for (let i = 1; i <= 4; i++) path.push({ x: c.x, y: c.y - i * 18 }); // 只上滑 72px，不过打出线
  await swipe([c, ...path]);
  const after25 = await state();
  check(after25.handCount === before25.handCount && after25.current === before25.current,
    `上滑未过线不打出（手牌仍 ${after25.handCount} 张）`);
} else {
  console.log('… 无可出牌，跳过未过线用例');
}

// ---------- 4. 不可出牌上滑弹回 ----------
await waitMyTurn().catch(() => {});
await waitHandStable();
const before3 = await state();
const playable3 = await playableCardIds();
const allIds = (await page.evaluate(() => [...document.querySelectorAll('[data-card-id]')].map((el) => el.getAttribute('data-card-id'))));
const unplayable = allIds.filter((id) => !playable3.includes(id));
if (unplayable.length > 0) {
  const c = await cardCenter(unplayable[0]);
  const path = [];
  for (let i = 1; i <= 8; i++) path.push({ x: c.x, y: c.y - i * 18 });
  await swipe([c, ...path]);
  const after3 = await state();
  check(after3.handCount === before3.handCount, `不可出牌上滑弹回（手牌仍 ${after3.handCount} 张）`);
} else {
  console.log('… 全部可出，跳过弹回用例');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
console.log('console errors:', errors.length ? errors : '无');
await browser.close();
process.exit(fail > 0 ? 1 : 0);
