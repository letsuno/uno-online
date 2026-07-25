// 拟人交互测试：全部通过 page.mouse / touchscreen 在元素屏幕坐标上操作，
// 不使用 socket emit、不使用 elementHandle.click() 的 actionability 豁免。
// 事件命中被遮挡/坐标在屏幕外的操作会像真人一样失败，从而暴露"自动化能做人做不了"的问题。
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServices, CLIENT_URL, devLogin } from './lib/harness.mjs';
import { launchBrowser } from './lib/driver.mjs';

const CLIENT_VERSION = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../client/package.json'), 'utf8'),
).version;

/** 建一个干净 context（可选预置登录态），不预置时登录流程走真实 UI */
async function newHumanContext(browser, { width, height, touch = false, token = null }) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
  });
  await context.addInitScript((t) => {
    if (t) localStorage.setItem('token', t);
    sessionStorage.setItem('start-screen-passed', '1');
    localStorage.setItem('tutorialShown', 'true');
    localStorage.setItem('notificationPromptDismissed', 'true');
  }, token);
  await context.addInitScript((v) => localStorage.setItem('app-last-seen-version', v), CLIENT_VERSION);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (text.includes('64737') || (text.includes('404') && (m.location()?.url ?? '').includes('/api/profile'))) return;
    errors.push(`console.error: ${text}`);
  });
  return { page, context, errors };
}

const services = await startServices();
const browser = await launchBrowser();
let failures = 0;
const shots = [];

/** 取元素屏幕中心坐标（boundingBox，即人眼看到的位置；支持 playwright 选择器引擎） */
async function centerOf(page, selector, { timeout = 8000 } = {}) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout });
  const box = await loc.boundingBox();
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2, w: box.width, h: box.height } : null;
}

/** 拟人点击：移动到坐标 → 按下 → 抬起（真实 pointer 事件链） */
async function humanClick(page, point, label) {
  if (!point) throw new Error(`找不到可点击目标: ${label}`);
  const vw = page.viewportSize().width;
  const vh = page.viewportSize().height;
  if (point.x < 0 || point.y < 0 || point.x > vw || point.y > vh) {
    throw new Error(`${label} 中心坐标 (${Math.round(point.x)},${Math.round(point.y)}) 超出屏幕 ${vw}x${vh}——真人无法点击`);
  }
  await page.mouse.move(point.x, point.y, { steps: 6 });
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.up();
}

/** 点页面空白处关闭残留浮层（座位菜单等），并等其消失 */
async function dismissFloating(page, touch) {
  const vw = page.viewportSize().width;
  const vh = page.viewportSize().height;
  if (touch) await page.touchscreen.tap(Math.round(vw / 2), Math.round(vh * 0.08));
  else await page.mouse.click(Math.round(vw / 2), Math.round(vh * 0.08));
  await page.waitForTimeout(400);
}

const roomState = (page) => page.evaluate(() => {
  const r = window.__uno.useRoomStore.getState();
  const seated = r.seats.filter(Boolean);
  return { seated: seated.length, allReady: seated.length >= 2 && seated.every((p) => p.ready) };
});

async function shot(page, name) {
  const file = `output/human-${name}.png`;
  await page.screenshot({ path: file });
  shots.push(file);
}

const state = (page) => page.evaluate(() => {
  const s = window.__uno.useGameStore.getState();
  const me = s.players.find((p) => p.id === s.viewerId);
  return {
    phase: s.phase,
    isMyTurn: s.players[s.currentPlayerIndex]?.id === s.viewerId,
    handCount: me?.handCount ?? 0,
    hand: (me?.hand ?? []).map((c) => c.id),
    hasDrawnThisTurn: s.hasDrawnThisTurn,
    currentColor: s.currentColor,
    topCard: s.discardPile[s.discardPile.length - 1] ?? null,
    drawStack: (s.drawStack ?? 0) + (s.pendingPenaltyDraws ?? 0),
  };
});

const pickPlayableId = (page) => page.evaluate(() => {
  const s = window.__uno.useGameStore.getState();
  const me = s.players.find((p) => p.id === s.viewerId);
  const top = s.discardPile[s.discardPile.length - 1];
  const stack = (s.drawStack ?? 0) + (s.pendingPenaltyDraws ?? 0);
  const playable = (me?.hand ?? []).filter((c) => {
    if (stack > 0) return c.type === 'draw_two' || c.type === 'wild_draw_four';
    return c.type === 'wild' || c.type === 'wild_draw_four' ||
      c.color === s.currentColor ||
      (top && c.type === 'number' && top.type === 'number' && c.value === top.value) ||
      (top && c.type === top.type && c.type !== 'number');
  });
  return playable[0]?.id ?? null;
});

/** 等某个 store 条件成立 */
async function waitState(page, desc, fn, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const st = await state(page);
    if (fn(st)) return st;
    if (Date.now() > deadline) throw new Error(`等待超时: ${desc}（当前 phase=${st.phase} isMyTurn=${st.isMyTurn}）`);
    await page.waitForTimeout(300);
  }
}

async function runScenario(browser, { tag, width, height, touch }) {
  console.log(`\n=== ${tag} ${width}x${height}${touch ? ' (触屏)' : ''} ===`);
  const { page: p, context: ctx, errors } = await newHumanContext(browser, { width, height, touch });
  const tap = touch
    ? async (pt, label) => {
        if (!pt) throw new Error(`找不到可点击目标: ${label}`);
        const vw = p.viewportSize().width;
        const vh = p.viewportSize().height;
        if (pt.x < 0 || pt.y < 0 || pt.x > vw || pt.y > vh) throw new Error(`${label} 中心坐标超出屏幕——真人无法点击`);
        await p.touchscreen.tap(pt.x, pt.y);
      }
    : (pt, label) => humanClick(p, pt, label);

  // ── 1. 登录页：真人输入用户名 + 点击登录（无预置 token，走真实 UI） ──
  await p.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const input = await centerOf(p, 'input:not([type="file"])');
  await tap(input, '用户名输入框');
  await p.keyboard.type(`拟人${tag}`, { delay: 20 });
  await shot(p, `${tag}-1-login`);
  await tap(await centerOf(p, 'button:has-text("登录"), button:has-text("登 录")'), '登录按钮');
  // 登录后回到大厅（重新注入 token 的 context 已在站内，等大厅出现）
  await p.waitForSelector('text=创建房间', { timeout: 10000 });
  await p.waitForTimeout(800);
  await shot(p, `${tag}-2-lobby`);
  console.log('  ✓ 登录 → 大厅');

  // ── 2. 大厅：点击创建房间 ──
  await tap(await centerOf(p, 'button:has-text("创建房间")'), '创建房间按钮');
  await p.waitForSelector('text=准备', { timeout: 10000 });
  await p.waitForTimeout(800);
  await shot(p, `${tag}-3-room`);
  console.log('  ✓ 创建房间 → 房间页');

  // ── 3. 房间：点空座位入座 → 准备（加 Bot 仍是 socket，因为加 Bot 是房主菜单操作，另行覆盖） ──
  const seat = await centerOf(p, 'button[title="座位 2"]');
  await tap(seat, '空座位');
  await p.waitForTimeout(600);
  // 空座位点击后可能弹菜单（已入座/房主视角），若有菜单则点「入座」
  const sitBtn = await centerOf(p, 'text=入座', { timeout: 1500 }).catch(() => null);
  if (sitBtn) await tap(sitBtn, '入座菜单项');
  await p.waitForTimeout(600);
  await shot(p, `${tag}-4-seated`);
  await tap(await centerOf(p, 'button:has-text("准备")'), '准备按钮');
  await p.waitForTimeout(600);
  console.log('  ✓ 入座 + 准备');

  // ── 4. 加两个 Bot（走 UI：点空座位 → 菜单 → 添加人机；每步后关闭残留菜单） ──
  for (const seatTitle of ['座位 3', '座位 4']) {
    await dismissFloating(p, touch);
    await tap(await centerOf(p, `button[title="${seatTitle}"]`), seatTitle);
    await p.waitForTimeout(500);
    await tap(await centerOf(p, 'div.glass-panel-sm >> text=简单', { timeout: 3000 }), 'Bot 难度-简单');
    await p.waitForTimeout(800);
  }
  await dismissFloating(p, touch);
  // 校验 3 人入座且全部 ready（ Bot 自动 ready）
  {
    const deadline = Date.now() + 8000;
    for (;;) {
      const rs = await roomState(p);
      if (rs.seated >= 3 && rs.allReady) break;
      if (Date.now() > deadline) throw new Error(`入座/准备状态异常: ${JSON.stringify(rs)}`);
      await p.waitForTimeout(300);
    }
  }
  await shot(p, `${tag}-5-bots`);
  console.log('  ✓ 通过座位菜单添加 2 个 Bot');

  // ── 5. 开始游戏 ──
  await dismissFloating(p, touch);
  await tap(await centerOf(p, 'button:has-text("开始游戏")'), '开始游戏按钮');
  await waitState(p, '进入对局', (s) => s.phase === 'playing' || s.phase === 'choosing_color');
  await p.waitForTimeout(1200);
  // 关闭「本局规则已载入」弹窗（点其主按钮）
  const rulesBtn = await centerOf(p, 'div.glass-panel button:has-text("开始游戏")', { timeout: 2500 }).catch(() => null);
  if (rulesBtn) await tap(rulesBtn, '规则弹窗-开始游戏');
  await p.waitForTimeout(600);
  await shot(p, `${tag}-6-game`);
  console.log('  ✓ 开始游戏（含关闭开局规则弹窗）');

  // ── 5.5 strip 模式追加：点对手 → 互动面板 → 发表情 ──
  if (touch) {
    const opp = await centerOf(p, '.overflow-x-auto button', { timeout: 4000 }).catch(() => null);
    await tap(opp, '对手卡片');
    await p.waitForTimeout(700);
    const hasSheet = await p.evaluate(() => document.body.textContent.includes('快捷表情'));
    if (!hasSheet) throw new Error('对手互动面板未打开');
    await shot(p, `${tag}-6b-opponent`);
    await tap(await centerOf(p, 'button:has-text("👍")'), '表情👍');
    await p.waitForTimeout(500);
    console.log('  ✓ 对手互动面板打开并发送表情');
  }

  // ── 6. 对局：真人出牌 / 摸牌 / 选色，打 6 个动作 ──
  let actions = 0;
  const deadline = Date.now() + 90_000;
  while (actions < 6 && Date.now() < deadline) {
    const st = await state(p);
    if (st.phase === 'choosing_color') {
      // 点选色按钮（ColorPicker 里的红色）
      const red = await centerOf(p, '[data-color="red"], button:has-text("红")', { timeout: 4000 }).catch(() => null);
      if (red) {
        await tap(red, '选色-红');
        actions++;
        console.log('  ✓ 选色（坐标点击）');
        await p.waitForTimeout(600);
        continue;
      }
      await p.waitForTimeout(500);
      continue;
    }
    if (st.phase === 'challenging') {
      const accept = await centerOf(p, 'button:has-text("接受")', { timeout: 3000 }).catch(() => null);
      if (accept) {
        await tap(accept, '接受按钮');
        console.log('  ✓ 坐标点击接受质疑');
        await p.waitForTimeout(700);
        continue;
      }
      await p.waitForTimeout(500);
      continue;
    }
    if (st.phase !== 'playing') break;
    if (!st.isMyTurn) { await p.waitForTimeout(400); continue; }

    const cardId = await pickPlayableId(p);
    if (cardId) {
      const pt = await centerOf(p, `[data-card-id="${cardId}"]`).catch(() => null);
      await tap(pt, `手牌 ${cardId}`);
      await p.waitForTimeout(800);
      // 验证状态真的推进（手牌减少 / 阶段变化 / 回合易主），否则视为无效点击
      const after = await state(p);
      const progressed = after.handCount < st.handCount || after.phase !== st.phase || !after.isMyTurn;
      if (progressed) {
        actions++;
        console.log(`  ✓ 坐标点击出牌（剩 ${after.handCount} 张）`);
      } else {
        console.log('  … 出牌未生效（可能被拒），下轮改摸牌');
      }
    } else if (!st.hasDrawnThisTurn) {
      const pile = await centerOf(p, '[data-draw-pile="left"]').catch(() => null);
      await tap(pile, '左牌堆摸牌');
      await p.waitForTimeout(800);
      const afterDraw = await state(p);
      if (afterDraw.handCount > st.handCount || afterDraw.hasDrawnThisTurn) {
        actions++;
        console.log('  ✓ 坐标点击摸牌');
      } else {
        console.log('  … 摸牌未生效');
      }
    } else {
      // 跳过按钮（GameActions）
      const pass = await centerOf(p, 'button:has-text("跳过")', { timeout: 1500 }).catch(() => null);
      if (pass) {
        await tap(pass, '跳过按钮');
        actions++;
        console.log('  ✓ 坐标点击跳过');
        await p.waitForTimeout(700);
      } else {
        await p.waitForTimeout(600);
      }
    }
  }
  if (actions < 3) throw new Error(`对局动作过少（${actions}），拟人交互未正常推进`);
  await shot(p, `${tag}-7-played`);
  console.log(`  ✓ 完成 ${actions} 个对局动作`);

  // ── 7. strip 模式追加：打开菜单 BottomSheet 并关闭 ──
  if (touch) {
    await tap(await centerOf(p, 'button[title="菜单"]'), '菜单按钮');
    await p.waitForTimeout(700);
    await shot(p, `${tag}-8-menu`);
    const hasSheet = await p.evaluate(() => document.body.textContent.includes('色盲模式'));
    if (!hasSheet) throw new Error('菜单 BottomSheet 未打开');
    await tap(await centerOf(p, 'button:has-text("开启音效"), button:has-text("关闭音效")'), '音效开关');
    await p.waitForTimeout(400);
    console.log('  ✓ 菜单 BottomSheet 打开并切换音效');
  }

  const realErrors = errors.filter((e) => !e.includes('64737') && !e.includes('/api/profile'));
  if (realErrors.length > 0) throw new Error(`console 错误: ${realErrors[0]}`);
  await ctx.close();
}

try {
  await runScenario(browser, { tag: 'desktop', width: 1920, height: 1080, touch: false });
  await runScenario(browser, { tag: 'short', width: 844, height: 390, touch: false });
  await runScenario(browser, { tag: 'mobile', width: 390, height: 844, touch: true });
} catch (e) {
  failures++;
  console.error(`\n✗ 拟人测试失败: ${e.message ?? e}`);
} finally {
  await browser.close();
  await services.stop();
}

if (failures > 0) process.exit(1);
console.log('\n✓ 拟人交互测试全部通过');
