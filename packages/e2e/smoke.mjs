// 交互冒烟：真实打几个回合（出牌/摸牌/跳过），断言状态推进、无错误
import { startServices } from './lib/harness.mjs';
import { launchBrowser, newAuthedPage, setupGame, emit } from './lib/driver.mjs';

const services = await startServices();
const browser = await launchBrowser();
let failures = 0;

try {
  const { page, context, errors } = await newAuthedPage(browser, { username: '冒烟测试', width: 1280, height: 800 });
  const roomCode = await setupGame(page, { botCount: 2 });
  console.log(`房间 ${roomCode} 已开局`);

  const state = () => page.evaluate(() => {
    const s = window.__uno.useGameStore.getState();
    const userId = s.viewerId;
    const me = s.players.find((p) => p.id === userId);
    return {
      phase: s.phase,
      userId,
      isMyTurn: s.players[s.currentPlayerIndex]?.id === userId,
      myHand: (me?.hand ?? []).map((c) => c.id),
      handCount: me?.handCount ?? 0,
      hasDrawnThisTurn: s.hasDrawnThisTurn,
      topCard: s.discardPile[s.discardPile.length - 1] ?? null,
      currentColor: s.currentColor,
      direction: s.direction,
      roundNumber: s.roundNumber,
    };
  });

  //  playableIds 由 hook 计算，不在 store 里；直接在前端用规则判断：颜色/数字/万能
  const pickPlayable = (st) => page.evaluate(() => {
    const s = window.__uno.useGameStore.getState();
    const me = s.players.find((p) => p.id === s.viewerId);
    const top = s.discardPile[s.discardPile.length - 1];
    const hand = me?.hand ?? [];
    const stack = (s.drawStack ?? 0) + (s.pendingPenaltyDraws ?? 0);
    const playable = hand.filter((c) => {
      if (stack > 0) return c.type === 'draw_two' || c.type === 'wild_draw_four';
      return c.type === 'wild' || c.type === 'wild_draw_four' ||
        c.color === s.currentColor ||
        (top && c.type === 'number' && top.type === 'number' && c.value === top.value) ||
        (top && c.type === top.type && c.type !== 'number');
    });
    return playable[0]?.id ?? null;
  });

  let actions = 0;
  let stalls = 0;
  const deadline = Date.now() + 60_000;
  while (actions < 6 && stalls < 12 && Date.now() < deadline) {
    const st = await state();
    if (st.phase === 'choosing_color') {
      // 选色归属可能已在 store 外推进，直接尝试（非我方时服务端会拒绝，无害）
      await emit(page, 'game:choose_color', { color: 'red' });
      console.log('  选色 red');
      await page.waitForTimeout(600);
      continue;
    }
    if (st.phase === 'challenging') {
      await emit(page, 'game:accept');
      console.log('  接受质疑');
      await page.waitForTimeout(600);
      continue;
    }
    if (st.phase !== 'playing') {
      await page.waitForTimeout(800);
      const again = await state();
      if (again.phase !== 'playing' && again.phase !== 'choosing_color') break;
      continue;
    }
    if (!st.isMyTurn) {
      await page.waitForTimeout(500);
      continue;
    }
    const cardId = await pickPlayable(st).catch(() => null);
    if (cardId === null && st.phase !== 'playing') continue;
    if (cardId) {
      const res = await emit(page, 'game:play_card', { cardId });
      // 状态在检查与出牌之间被推进（如罚摸/跳过）时，拒绝属竞态，重新同步即可
      if (res && res.success === false) { stalls++; await page.waitForTimeout(500); continue; }
      console.log(`  出牌 ${cardId}`);
    } else if (!st.hasDrawnThisTurn) {
      const res = await emit(page, 'game:draw_card', { side: 'left' });
      if (res && res.success === false) throw new Error(`摸牌被拒: ${res.error}`);
      console.log('  摸牌');
    } else {
      const res = await emit(page, 'game:pass');
      if (res && res.success === false) {
        // 可能尚不允许跳过（规则限制），等待后重同步
        stalls++;
        await page.waitForTimeout(1000);
        continue;
      }
      console.log('  跳过');
    }
    actions++;
    await page.waitForTimeout(700);
  }


  const finalState = await state().catch(() => null);
  // 回合自然结束（有人打完/我获胜）也算对局正常推进
  const naturalEnd = finalState && (finalState.phase === 'round_end' || finalState.phase === 'game_over');
  if (actions < 2 && !naturalEnd) throw new Error(`只执行了 ${actions} 个动作（stalls=${stalls}），对局未正常推进`);
  console.log(`完成 ${actions} 个动作，当前 phase=${finalState?.phase} round=${finalState?.roundNumber}`);

  const realErrors = errors.filter((e) => !e.includes('64737'));
  if (realErrors.length > 0) throw new Error(`console 错误: ${realErrors[0]}`);
  await context.close();
} catch (e) {
  failures++;
  console.error(`✗ 冒烟失败: ${e.message ?? e}`);
} finally {
  await browser.close();
  await services.stop();
}

if (failures > 0) process.exit(1);
console.log('✓ 交互冒烟通过');
