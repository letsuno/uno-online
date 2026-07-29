// UNO Flip 模式演示：开一局 Flip 对局，真实打到翻面发生，截图取证
import { startServices, CLIENT_URL } from './lib/harness.mjs';
import { launchBrowser, newAuthedPage, emit, waitSocketConnected, waitGamePhase } from './lib/driver.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
const services = await startServices();
const browser = await launchBrowser();
let failures = 0;
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);

try {
  const { page, errors } = await newAuthedPage(browser, { username: 'Flip演示', width: 1440, height: 900 });

  // ── 建房 + 切到 Flip 模式 ──
  await page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
  await waitSocketConnected(page);
  const created = await emit(page, 'room:create', {});
  if (!created.success) throw new Error(`room:create 失败: ${created.error}`);
  const roomCode = created.roomCode;

  await page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await emit(page, 'seat:take', 0);
  for (let i = 0; i < 2; i++) await emit(page, 'room:add_bot', { difficulty: 'easy' });

  const modeRes = await emit(page, 'room:update_settings', { gameMode: 'flip', targetScore: 500 });
  if (!modeRes.success) fail(`切换 Flip 模式失败: ${modeRes.error}`);

  await page.waitForTimeout(500);

  const roomMode = await page.evaluate(() => window.__uno.useRoomStore.getState().room?.settings?.gameMode);
  roomMode === 'flip' ? pass('房间已切到 flip 模式') : fail(`房间模式是 ${roomMode}`);

  // 装饰牌：左半屏亮面 / 右半屏暗面
  const deco = await page.evaluate(() => {
    // 装饰牌带 rotate，getBoundingClientRect 会返回旋转后的外接框，这里用 offsetWidth
    const nodes = [...document.querySelectorAll('div.absolute')].filter(
      (el) => el.offsetWidth === 78 && el.offsetHeight === 112,
    );
    return nodes.map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim(), left: r.left + r.width / 2 < window.innerWidth / 2 };
    });
  });
  const leftFaces = deco.filter((d) => d.left).map((d) => d.text);
  const rightFaces = deco.filter((d) => !d.left).map((d) => d.text);
  console.log(`  装饰牌 左半屏=${JSON.stringify(leftFaces)} 右半屏=${JSON.stringify(rightFaces)}`);
  if (leftFaces.length === 3 && rightFaces.length === 3) pass('装饰牌左右各 3 张');
  else fail(`装饰牌分布异常: 左 ${leftFaces.length} / 右 ${rightFaces.length}`);
  if (rightFaces.some((t) => t === '+5' || t === '⊘⊘')) pass('右半屏出现暗面专属牌面');
  else fail('右半屏没有暗面牌面');
  if (leftFaces.includes('0') || rightFaces.includes('0')) fail('装饰牌里仍有 0 牌（Flip 无 0 牌）');
  else pass('装饰牌不含 0 牌');

  await page.screenshot({ path: resolve(outDir, 'flip-room.png') });

  // ── 房间设置抽屉：Flip 村规组要渲染出来，且不能有行重叠 ──
  await page.click('[title="房间设置"]');
  await page.waitForTimeout(600);
  const drawer = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')].filter(
      (el) => el.className.includes?.('border-b border-white/5') && el.className.includes?.('justify-between'),
    );
    const boxes = rows.map((el) => ({ t: el.textContent.trim().slice(0, 12), r: el.getBoundingClientRect() }));
    const bad = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
          && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2) {
          bad.push(`${boxes[i].t} ⟂ ${boxes[j].t}`);
        }
      }
    }
    const text = document.body.innerText;
    return {
      rowCount: boxes.length,
      bad: bad.slice(0, 5),
      hasFlipGroup: text.includes('UNO Flip 村规') && text.includes('摸色上限') && text.includes('暗面结算翻倍'),
      // Flip 下不适用的经典村规应被隐藏而不是置灰
      hidesIncompatible: !text.includes('0 牌交换手牌') && !text.includes('+4 叠加') && text.includes('7 牌交换'),
    };
  });
  drawer.bad.length === 0 ? pass(`设置抽屉 ${drawer.rowCount} 行无重叠`) : fail(`设置抽屉有重叠: ${drawer.bad.join('; ')}`);
  drawer.hasFlipGroup ? pass('Flip 专属村规组已渲染') : fail('没找到 Flip 专属村规组');
  drawer.hidesIncompatible ? pass('不兼容的经典村规已隐藏') : fail('不兼容村规没被隐藏');

  // Flip 下点「疯狂」预设应开出 Flip 版规则，而不是经典的 +2/+4
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === '疯狂')?.click();
  });
  await page.waitForTimeout(700);
  const preset = await page.evaluate(() => window.__uno.useRoomStore.getState().room?.settings?.houseRules ?? {});
  const presetOk = preset.flipStackDrawFive === true && preset.flipStackWildDraw === true
    && preset.stackDrawTwo !== true && preset.zeroRotateHands !== true;
  presetOk ? pass('「疯狂」预设开出的是 Flip 版村规')
    : fail(`预设不对: ${JSON.stringify({ d5: preset.flipStackDrawFive, wild: preset.flipStackWildDraw, s2: preset.stackDrawTwo, z: preset.zeroRotateHands })}`);

  // 保持「疯狂」预设打完整局——20+ 条村规全开是最容易压出死锁的组合
  const activeRules = await page.evaluate(() => {
    const hr = window.__uno.useRoomStore.getState().room?.settings?.houseRules ?? {};
    return { d1: hr.flipStackDrawOne, d5: hr.flipStackDrawFive, wf: hr.flipWildFlip, swap: hr.sevenSwapHands, multi: hr.multiplePlaySameNumber };
  });
  (activeRules.d1 && activeRules.d5 && activeRules.wf && activeRules.swap && activeRules.multi)
    ? pass('实战开着全套疯狂村规')
    : fail(`实战村规不对: ${JSON.stringify(activeRules)}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(outDir, 'flip-settings.png') });
  await page.click('[title="关闭"]');
  await page.waitForTimeout(400);

  // ── 开局 ──
  await emit(page, 'room:ready', true);
  await emit(page, 'game:start').catch((e) => {
    if (!String(e).includes('Execution context')) throw e;
  });
  await waitGamePhase(page, 'playing', 20000);
  pass('Flip 对局已开始');

  // 开局规则弹窗：确认写的是 Flip 而不是「经典规则」，然后关掉以便截图看到牌桌
  await page.waitForTimeout(800);
  const startModalText = await page.evaluate(() => document.body.innerText);
  startModalText.includes('UNO Flip') ? pass('开局弹窗标明 UNO Flip 模式') : fail('开局弹窗没提到 Flip 模式');
  // 开了 Flip 村规就不该再显示「无额外村规」
  const listsFlipRules = startModalText.includes('+5 叠加') || startModalText.includes('+1 叠加') || startModalText.includes('Flip 万能出');
  const saysNone = startModalText.includes('无额外村规') || startModalText.includes('未启用额外村规');
  (listsFlipRules && !saysNone)
    ? pass('开局弹窗列出了已启用的 Flip 村规')
    : fail(`开局弹窗没算上 Flip 村规（列出=${listsFlipRules} 显示无村规=${saysNone}）`);
  const startBtn = page.locator('button', { hasText: '开始游戏' });
  if (await startBtn.count()) await startBtn.first().click();
  await page.waitForTimeout(400);

  const snapshot = () => page.evaluate(() => {
    const s = window.__uno.useGameStore.getState();
    const me = s.players.find((p) => p.id === s.viewerId);
    const others = s.players.filter((p) => p.id !== s.viewerId);
    return {
      phase: s.phase,
      flipSide: s.flipSide,
      gameMode: s.settings?.gameMode,
      currentColor: s.currentColor,
      currentPlayerIndex: s.currentPlayerIndex,
      isMyTurn: s.players[s.currentPlayerIndex]?.id === s.viewerId,
      viewerId: s.viewerId,
      pendingDrawPlayerId: s.pendingDrawPlayerId,
      pendingPenaltyDraws: s.pendingPenaltyDraws ?? 0,
      drawStack: s.drawStack ?? 0,
      hasDrawnThisTurn: s.hasDrawnThisTurn,
      myHand: (me?.hand ?? []).map((c) => ({ id: c.id, type: c.type, color: c.color, value: c.value, hasBack: c.back !== undefined })),
      myHandCount: me?.handCount ?? 0,
      topCard: s.discardPile[s.discardPile.length - 1] ?? null,
      opponents: others.map((p) => ({
        id: p.id, handCount: p.handCount,
        backs: (p.handBacks ?? []).length,
        backSample: (p.handBacks ?? [])[0] ?? null,
        backColors: (p.handBacks ?? []).map((b) => b.color),
        backTypes: (p.handBacks ?? []).map((b) => b.type),
        handLeak: p.hand.length,
      })),
      roundNumber: s.roundNumber,
      winnerId: s.winnerId,
    };
  });

  let st = await snapshot();
  console.log(`  开局：flipSide=${st.flipSide} 顶牌=${st.topCard?.type}/${st.topCard?.color} 当前色=${st.currentColor}`);

  // ── 可见性不变量 ──
  // 首张弃牌若是 Draw One/Draw Five，首家会先摸牌，因此手牌可能多于 7 张
  if (st.myHand.length >= 7) pass(`自己手牌 ${st.myHand.length} 张`);
  else fail(`自己手牌只有 ${st.myHand.length} 张`);

  if (st.myHand.every((c) => !c.hasBack)) pass('自己手牌不含背面（未泄露）');
  else fail('自己手牌带了 back 字段——泄露了本人看不到的信息');

  if (st.opponents.every((o) => o.backs === o.handCount && o.handCount > 0)) pass('对手手牌背面可见且数量对齐 handCount');
  else fail(`对手背面数量不匹配: ${JSON.stringify(st.opponents)}`);

  if (st.opponents.every((o) => o.handLeak === 0)) pass('对手手牌正面不可见');
  else fail('对手手牌正面泄露了');

  console.log(`  对手背面样例: ${JSON.stringify(st.opponents[0]?.backSample)}`);

  // ── 打到翻面发生 ──
  const WILD = ['wild', 'wild_draw_four', 'wild_draw_two', 'wild_draw_color'];

  const decide = () => page.evaluate((wildTypes) => {
    const s = window.__uno.useGameStore.getState();
    const me = s.players.find((p) => p.id === s.viewerId);
    const top = s.discardPile[s.discardPile.length - 1];
    const hand = me?.hand ?? [];
    const sym = (c) => (c.type === 'number' ? `n${c.value}` : c.type);

    if ((s.pendingPenaltyDraws ?? 0) > 0) return { kind: 'draw' };
    if (s.phase === 'challenging' && s.pendingDrawPlayerId === s.viewerId) return { kind: 'accept' };
    // 出万能牌后紧跟着查 phase 有竞态，这里在主循环里兜底：轮到我且在选色阶段就选色
    if (s.phase === 'choosing_color' && s.players[s.currentPlayerIndex]?.id === s.viewerId) {
      return { kind: 'color' };
    }
    // 疯狂预设开了 7 牌交换：出 7 之后要选交换目标，不选就一直卡着
    if (s.phase === 'choosing_swap_target' && s.players[s.currentPlayerIndex]?.id === s.viewerId) {
      const target = s.players.find((p) => p.id !== s.viewerId);
      if (target) return { kind: 'swap', targetId: target.id };
    }
    if (s.phase !== 'playing') return { kind: 'wait' };

    // 开了叠加村规时罚摸走 drawStack。本演示只开了 +1/+5 同型叠加，
    // 因此只尝试与顶牌同型的罚摸牌，否则认罚摸牌。
    if ((s.drawStack ?? 0) > 0) {
      const stackable = hand.filter((c) => top && c.type === top.type);
      if (stackable.length > 0) {
        const c = stackable[0];
        return { kind: 'play', cardId: c.id, type: c.type, needColor: wildTypes.includes(c.type) };
      }
      return { kind: 'draw' };
    }

    const playable = hand.filter((c) => wildTypes.includes(c.type) || c.color === s.currentColor || sym(c) === sym(top));
    if (playable.length > 0) {
      // 优先打 Flip 卡，让演示尽快翻面
      const card = playable.find((c) => c.type === 'flip') ?? playable[0];
      return { kind: 'play', cardId: card.id, type: card.type, needColor: wildTypes.includes(card.type) };
    }
    // 「摸到能出为止」开着时，没牌可出就必须继续摸，PASS 会被引擎拒绝
    if (s.settings?.houseRules?.drawUntilPlayable) return { kind: 'draw' };
    if (!s.hasDrawnThisTurn) return { kind: 'draw' };
    return { kind: 'pass' };
  }, WILD);

  const playOnce = async () => {
    const d = await decide();
    if (d.kind === 'play') {
      await emit(page, 'game:play_card', { cardId: d.cardId });
      const phase = await page.evaluate(() => window.__uno.useGameStore.getState().phase);
      if (phase === 'choosing_color') {
        const color = await page.evaluate(() =>
          (window.__uno.useGameStore.getState().flipSide === 'dark' ? 'pink' : 'red'));
        await emit(page, 'game:choose_color', { color });
      }
      return `play:${d.type}`;
    }
    if (d.kind === 'color') {
      const color = await page.evaluate(() =>
        (window.__uno.useGameStore.getState().flipSide === 'dark' ? 'pink' : 'red'));
      await emit(page, 'game:choose_color', { color });
      return 'choose_color';
    }
    if (d.kind === 'swap') {
      await emit(page, 'game:choose_swap_target', { targetId: d.targetId });
      return 'swap';
    }
    if (d.kind === 'draw') { await emit(page, 'game:draw_card', { side: 'left' }); return 'draw'; }
    if (d.kind === 'pass') { await emit(page, 'game:pass'); return 'pass'; }
    if (d.kind === 'accept') { await emit(page, 'game:accept'); return 'accept'; }
    return 'wait';
  };

  const DARK_ONLY = ['draw_five', 'skip_everyone', 'wild_draw_color'];
  const LIGHT_ONLY = ['draw_one', 'wild_draw_two'];
  const DARK_COLORS = ['pink', 'teal', 'orange', 'purple'];

  let sawLight = false;
  let sawDark = false;
  const seenDarkOnly = new Set();
  const seenLightOnly = new Set();
  let crossSideBacksOk = null;
  let darkShotTaken = false;
  let roundFinished = false;
  const sideLog = [];
  let turns = 0;
  const actionLog = [];

  const deadline = Date.now() + 4 * 60 * 1000;
  let lastProgressAt = Date.now();
  let lastFingerprint = '';
  let stalled = false;

  let roundsPlayed = 0;
  let noopStreak = 0;
  const actionFp = async () => page.evaluate(() => {
    const s = window.__uno.useGameStore.getState();
    const me = s.players.find((p) => p.id === s.viewerId);
    return `${s.phase}|${s.currentPlayerIndex}|${me?.handCount}|${s.discardPile[s.discardPile.length - 1]?.id}`;
  });
  let lastActionFp = '';

  while (Date.now() < deadline) {
    st = await snapshot();
    if (st.phase === 'round_end' || st.phase === 'game_over') {
      roundFinished = true;
      roundsPlayed++;
      // 一轮结束时若还没见过两面，就再打一轮——是否翻面取决于发牌运气
      if (sawLight && sawDark) break;
      if (st.phase === 'game_over' || roundsPlayed >= 4) break;
      await emit(page, 'game:next_round');
      await page.waitForTimeout(2500);
      lastProgressAt = Date.now();
      continue;
    }

    // 卡死检测：30 秒内局面毫无变化即视为卡住
    const fingerprint = `${st.phase}|${st.flipSide}|${st.currentPlayerIndex}|${st.myHandCount}|${st.topCard?.id}|${st.opponents.map((o) => o.handCount).join(',')}`;
    if (fingerprint !== lastFingerprint) { lastFingerprint = fingerprint; lastProgressAt = Date.now(); }
    // 阈值必须大于服务端的回合时限（30s）——回合超时会自动代打，
    // 用 30s 判定会把「等兜底生效」误判成死锁
    else if (Date.now() - lastProgressAt > 45000) {
      stalled = true;
      const dump = await page.evaluate(() => {
        const s = window.__uno.useGameStore.getState();
        const me = s.players.find((p) => p.id === s.viewerId);
        const top = s.discardPile[s.discardPile.length - 1];
        return {
          phase: s.phase,
          flipSide: s.flipSide,
          currentColor: s.currentColor,
          turnOf: s.players[s.currentPlayerIndex]?.id,
          viewerId: s.viewerId,
          drawStack: s.drawStack,
          pendingPenaltyDraws: s.pendingPenaltyDraws,
          pendingDrawPlayerId: s.pendingDrawPlayerId,
          hasDrawnThisTurn: s.hasDrawnThisTurn,
          topCard: top && { type: top.type, color: top.color, value: top.value },
          myHand: (me?.hand ?? []).map((c) => `${c.color ?? 'wild'}-${c.type}${c.value ?? ''}`),
          handCounts: s.players.map((p) => `${p.id.slice(0, 12)}:${p.handCount}`),
          lastAction: s.lastAction,
          rules: Object.entries(s.settings?.houseRules ?? {}).filter(([, v]) => v !== false && v !== null).map(([k, v]) => `${k}=${v}`),
        };
      });
      console.log('  卡死状态:', JSON.stringify(dump, null, 2));
      break;
    }

    if (st.flipSide === 'dark') sawDark = true; else sawLight = true;
    if (sideLog[sideLog.length - 1] !== st.flipSide) sideLog.push(st.flipSide);

    // 暗面/亮面专属卡型：手牌、弃牌堆顶、对手背面，任一处出现都算观测到
    const visibleTypes = [
      ...st.myHand.map((c) => c.type),
      st.topCard?.type,
      ...st.opponents.flatMap((o) => o.backTypes),
    ].filter(Boolean);
    for (const t of visibleTypes) {
      if (DARK_ONLY.includes(t)) seenDarkOnly.add(t);
      if (LIGHT_ONLY.includes(t)) seenLightOnly.add(t);
    }

    // 端到端证据：处于暗面时，对手手牌的背面必须全是亮色（反之亦然）
    if (st.opponents.some((o) => o.backColors.length > 0)) {
      const backsAllOtherSide = st.opponents.every((o) =>
        o.backColors.every((c) => c === null || (st.flipSide === 'dark' ? !DARK_COLORS.includes(c) : DARK_COLORS.includes(c))));
      crossSideBacksOk = crossSideBacksOk === false ? false : backsAllOtherSide;
    }

    if (st.flipSide === 'dark' && !darkShotTaken && st.myHand.length > 0) {
      await page.screenshot({ path: resolve(outDir, 'flip-game-dark.png') });
      darkShotTaken = true;
      // 右侧规则面板应切成 Flip 图鉴
      const panelText = await page.evaluate(() => document.body.innerText);
      // 「暗面卡牌」区块默认折叠，查默认展开的区块标题
      panelText.includes('UNO Flip 玩法') ? pass('规则面板已切到 Flip 图鉴') : fail('规则面板仍是经典内容');
      const themed = await page.evaluate(() => document.querySelector('[data-flip-side="dark"]') !== null);
      themed ? pass('牌桌已挂上暗面主题标记') : fail('牌桌没有 data-flip-side=dark');

      // 暗面的牌应是黑灰边 + 白描边；可出牌的保留金色高亮
      // box-shadow 有 200ms 过渡，先等它落定再测，否则读到中间态
      await page.waitForTimeout(500);
      const borders = await page.evaluate(() => {
        const all = [...document.querySelectorAll('.uno-card')];
        let dark = 0, gold = 0, other = 0;
        for (const el of all) {
          const s = getComputedStyle(el);
          const c = s.borderTopColor;
          if (c === 'rgb(15, 17, 22)') dark++;
          else if (c === 'rgb(246, 190, 62)') gold++;
          else other++;
        }
        return { total: all.length, dark, gold, other };
      });
      borders.other === 0 && borders.dark > 0
        ? pass(`暗面牌框正确（${borders.dark} 张黑灰+白描边，${borders.gold} 张金色高亮）`)
        : fail(`暗面牌框不对: ${JSON.stringify(borders)}`);

      // 对手手牌位应逐张画出背面（带 title="背面：…"），而不是统一牌背
      const backTiles = await page.evaluate(() =>
        document.querySelectorAll('[title^="背面："]').length);
      backTiles > 0 ? pass(`对手手牌位画出了 ${backTiles} 张背面`) : fail('对手手牌位没有渲染背面');
    }

    const mine = st.isMyTurn || (st.phase === 'challenging' && st.pendingDrawPlayerId === st.viewerId);
    if (mine) {
      const what = await playOnce();
      if (what !== 'wait') { turns++; actionLog.push(what); }

      // 通用兜底：动作被引擎吞掉（局面没变）时升级为摸牌。
      // 这个脚本没有实现全部村规，某些规则会让它选出非法动作而反复空转。
      const afterFp = await actionFp();
      if (afterFp === lastActionFp && what !== 'draw') {
        noopStreak++;
        if (noopStreak >= 2) {
          await emit(page, 'game:draw_card', { side: 'left' });
          actionLog.push('fallback-draw');
          noopStreak = 0;
        }
      } else {
        noopStreak = 0;
      }
      lastActionFp = afterFp;
    }
    await page.waitForTimeout(150);
  }

  st = await snapshot();
  console.log(`  打了 ${turns} 手；flipSide 轨迹: ${sideLog.join(' → ')}`);
  const counts = actionLog.reduce((m, a) => ({ ...m, [a]: (m[a] ?? 0) + 1 }), {});
  console.log(`  动作分布: ${JSON.stringify(counts)}`);

  (sawLight && sawDark) ? pass('对局中两面都出现过（发生了翻面）') : fail(`只见到一面: ${sideLog.join(',')}`);
  seenDarkOnly.size > 0 ? pass(`观测到暗面专属卡型: ${[...seenDarkOnly].join(', ')}`) : fail('没见到任何暗面专属卡型');
  seenLightOnly.size > 0 ? pass(`观测到亮面专属卡型: ${[...seenLightOnly].join(', ')}`) : fail('没见到任何亮面专属卡型');
  crossSideBacksOk ? pass('对手手牌背面始终是「另一面」的颜色') : fail('对手背面颜色与当前面不互补——双面模型串了');
  // 硬断言是「不卡死」；一轮能否在预算内打完取决于机器人思考节奏，只作信息输出
  stalled ? fail('局面 45 秒无变化——卡死了') : pass(`全程无卡死（推进 ${turns} 手）`);
  if (roundFinished) pass(`打完 ${roundsPlayed} 轮（phase=${st.phase}）`);
  else console.log(`  （到达 4 分钟上限，本轮尚未分出胜负）`);

  if (st.myHand.every((c) => !c.hasBack)) pass('全程自己手牌都不含背面');
  else fail('自己手牌泄露了背面');

  await page.screenshot({ path: resolve(outDir, 'flip-game.png') });
  console.log(`  截图: output/flip-room.png, output/flip-game.png`);

  if (errors.length) { fail(`前端报错 ${errors.length} 条:`); errors.slice(0, 8).forEach((e) => console.log(`      ${e}`)); }
  else pass('无前端报错');
} catch (e) {
  failures++;
  console.log(`  ✗ 异常: ${e.stack ?? e}`);
} finally {
  await browser.close();
  await services.stop();
}

console.log(failures === 0 ? '\nFlip 演示通过 ✅' : `\nFlip 演示失败 ${failures} 项 ❌`);
process.exit(failures === 0 ? 0 : 1);
