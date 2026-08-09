// 实机验证生命周期修复:真实服务端 + 真实浏览器 client + 真实 socket.io。
// 场景:
//  1. 双人真人局整页刷新 → 恢复同一局与同一手牌;随后全员断网 36s →
//     房间必须存活(5 分钟宽限),网络恢复后 online 监听自动重连并回到对局。
//  2. game:start 并发双击 → 恰好一局。
//  3. seat:take 抢座失败者必须保留观战身份,且还能再入座。
//  4. 等待室误入 game 路由时回到房间，且不制造托管标记。
//  5. 托管玩家所在房间解散 → 大厅即时解除托管横幅与操作禁用。
//  6. 等待室房主可从观战席踢出其他真人。
//  7. 退出登录先提交主动离开，最后真人随后离开会立即解散。
import { startServices, CLIENT_URL } from './lib/harness.mjs';
import {
  launchBrowser,
  newAuthedPage,
  emit,
  startGame,
  waitSocketConnected,
  waitGamePhase,
  waitRoomJoined,
} from './lib/driver.mjs';

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// 整页导航到 /room/:code 后是全新 socket,必须等 RoomPage 的 rejoin 落地
// (room-store 房码就位)才能发 seat/ready 等房间事件。
const services = await startServices();
const browser = await launchBrowser();

try {
  // ── 场景 1:全员断网宽限 + online 自动重连 ─────────────────────────────
  {
    const a = await newAuthedPage(browser, { username: 'lv_owner', width: 1280, height: 800 });
    const b = await newAuthedPage(browser, { username: 'lv_second', width: 1280, height: 800 });

    await a.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(a.page);
    const created = await emit(a.page, 'room:create', {});
    if (!created.success) throw new Error(`room:create: ${created.error}`);
    const roomCode = created.roomCode;
    await a.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(a.page, roomCode);

    await b.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(b.page);
    const joined = await emit(b.page, 'room:join', roomCode);
    if (!joined.success) throw new Error(`room:join: ${joined.error}`);
    await b.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(b.page, roomCode);

    const seat1 = await emit(b.page, 'seat:take', 1);
    if (!seat1.success) throw new Error(`B seat: ${seat1.error}`);
    const [readyA, readyB] = await Promise.all([emit(a.page, 'room:ready', true), emit(b.page, 'room:ready', true)]);
    if (!readyA.success || !readyB.success) {
      throw new Error(`room:ready: ${JSON.stringify([readyA, readyB])}`);
    }
    await startGame(a.page, 20_000);
    await Promise.all([waitGamePhase(a.page, 'playing', 20_000), waitGamePhase(b.page, 'playing', 20_000)]);
    record('scenario1: 双人真人局开局', true);

    const readContinuationState = page =>
      page.evaluate(() => {
        const state = window.__uno?.useGameStore?.getState?.();
        const viewer = state?.players?.find(player => player.id === state.viewerId);
        return {
          pathname: window.location.pathname,
          viewerId: state?.viewerId ?? null,
          handIds: viewer?.hand?.map(card => card.id).sort() ?? [],
          connected: viewer?.connected ?? null,
          autopilot: viewer?.autopilot ?? null,
          roundNumber: state?.roundNumber ?? null,
          deckHash: state?.deckHash ?? null,
          gameStartedAt: state?.gameStartedAt ?? null,
          turnStartedAt: state?.turnStartedAt ?? null,
        };
      });
    const beforeRefresh = await readContinuationState(a.page);
    a.page.once('dialog', dialog => dialog.accept());
    await a.page.reload({ waitUntil: 'domcontentloaded' });
    await waitSocketConnected(a.page, 20_000);
    await waitRoomJoined(a.page, roomCode, 20_000);
    await waitGamePhase(a.page, 'playing', 20_000);
    const afterRefresh = await readContinuationState(a.page);
    const refreshContinued =
      afterRefresh.pathname === `/game/${roomCode}` &&
      beforeRefresh.viewerId === afterRefresh.viewerId &&
      beforeRefresh.roundNumber === afterRefresh.roundNumber &&
      beforeRefresh.deckHash === afterRefresh.deckHash &&
      beforeRefresh.gameStartedAt === afterRefresh.gameStartedAt &&
      beforeRefresh.turnStartedAt === afterRefresh.turnStartedAt &&
      afterRefresh.connected === true &&
      afterRefresh.autopilot === false &&
      JSON.stringify(beforeRefresh.handIds) === JSON.stringify(afterRefresh.handIds);
    record(
      'scenario1: 整页刷新后恢复同一局与同一手牌',
      refreshContinued,
      refreshContinued ? '' : JSON.stringify({ beforeRefresh, afterRefresh }),
    );

    // 双方同时断网 36 秒:覆盖两个 30s 重连窗口到期的时点。
    const offlineErrorStartA = a.errors.length;
    const offlineErrorStartB = b.errors.length;
    await a.context.setOffline(true);
    await b.context.setOffline(true);
    console.log('  ... 双方离线 36s(跨过 30s 定时器)');
    await new Promise(r => setTimeout(r, 36_000));

    // 网络恢复:'online' 事件应自动 connectSocket → rejoin → 回到对局。
    const recoveryErrorStartA = a.errors.length;
    const recoveryErrorStartB = b.errors.length;
    await a.context.setOffline(false);
    await b.context.setOffline(false);
    let recovered = true;
    let detail = '';
    let recoveryStage = 'A socket reconnect';
    try {
      await waitSocketConnected(a.page, 30000);
      recoveryStage = 'B socket reconnect';
      await waitSocketConnected(b.page, 30000);
      recoveryStage = 'A game-state restore';
      await waitGamePhase(a.page, 'playing', 20000);
      recoveryStage = 'B game-state restore';
      await waitGamePhase(b.page, 'playing', 20000);
    } catch (e) {
      recovered = false;
      const inspect = async page =>
        page
          .evaluate(() => ({
            connected: window.__uno?.getSocket?.()?.connected ?? null,
            socketId: window.__uno?.getSocket?.()?.id ?? null,
            pathname: window.location.pathname,
            roomCode: window.__uno?.useRoomStore?.getState?.().roomCode ?? null,
            phase: window.__uno?.useGameStore?.getState?.().phase ?? null,
            suspendedRoom: window.__uno?.getSuspendedRoom?.() ?? null,
          }))
          .catch(inspectError => ({ inspectError: String(inspectError) }));
      const [stateA, stateB] = await Promise.all([inspect(a.page), inspect(b.page)]);
      detail = `${recoveryStage}: ${String(e).slice(0, 100)} A=${JSON.stringify(stateA)} B=${JSON.stringify(stateB)}`;
    }
    record('scenario1: 断网 36s 后房间未解散且自动重连回局', recovered, detail);
    // 只忽略明确位于人为离线窗口内的浏览器网络错误。启动、刷新和恢复后
    // 的同类错误仍必须让用例失败，不能用全局字符串过滤掩盖真实回归。
    const unexpectedErrors = (errs, offlineStart, recoveryStart) => [
      ...errs.slice(0, offlineStart),
      ...errs
        .slice(offlineStart, recoveryStart)
        .filter(error => !error.includes('ERR_INTERNET_DISCONNECTED') && !error.includes('WebSocket connection')),
      ...errs.slice(recoveryStart),
    ];
    const realErrorsA = unexpectedErrors(a.errors, offlineErrorStartA, recoveryErrorStartA);
    const realErrorsB = unexpectedErrors(b.errors, offlineErrorStartB, recoveryErrorStartB);
    record('scenario1: A 页无运行时错误', realErrorsA.length === 0, realErrorsA.join(' | ').slice(0, 300));
    record('scenario1: B 页无运行时错误', realErrorsB.length === 0, realErrorsB.join(' | ').slice(0, 300));

    await emit(a.page, 'room:leave').catch(() => {});
    await emit(b.page, 'room:leave').catch(() => {});
    await a.context.close();
    await b.context.close();
  }

  // ── 场景 2:game:start 并发双击 ────────────────────────────────────────
  {
    const a = await newAuthedPage(browser, { username: 'lv_dbl', width: 1280, height: 800 });
    await a.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(a.page);
    const created = await emit(a.page, 'room:create', {});
    if (!created.success) throw new Error(`room:create: ${created.error}`);
    const roomCode = created.roomCode;
    await a.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(a.page, roomCode);
    const added = await emit(a.page, 'room:add_bot', { difficulty: 'easy' });
    if (!added.success) throw new Error(`room:add_bot: ${added.error}`);
    const ready = await emit(a.page, 'room:ready', true);
    if (!ready.success) throw new Error(`room:ready: ${ready.error}`);

    const [r1, r2] = await a.page.evaluate(
      timeoutMs =>
        new Promise((resolveAll, rejectAll) => {
          const socket = window.__uno.getSocket();
          const request = () =>
            new Promise((resolveRequest, rejectRequest) => {
              const timeout = setTimeout(() => rejectRequest(new Error('Socket ACK timed out: game:start')), timeoutMs);
              socket.emit('game:start', result => {
                clearTimeout(timeout);
                if (
                  !result ||
                  typeof result !== 'object' ||
                  Array.isArray(result) ||
                  (result.success !== true && result.success !== false) ||
                  (result.success === false && typeof result.error !== 'string')
                ) {
                  rejectRequest(new Error('Invalid Socket ACK: game:start'));
                  return;
                }
                resolveRequest(result);
              });
            });
          Promise.all([request(), request()]).then(resolveAll, rejectAll);
        }),
      10_000,
    );
    const successes = [r1, r2].filter(r => r.success).length;
    record('scenario2: 并发双击恰好开一局', successes === 1, JSON.stringify([r1.success, r2.success]));
    await a.context.close();
  }

  // ── 场景 3:抢座失败者保留观战身份 ────────────────────────────────────
  {
    const owner = await newAuthedPage(browser, { username: 'lv_sowner', width: 1280, height: 800 });
    await owner.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(owner.page);
    const created = await emit(owner.page, 'room:create', {});
    if (!created.success) throw new Error(`room:create: ${created.error}`);
    const roomCode = created.roomCode;
    await owner.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(owner.page, roomCode);

    const s1 = await newAuthedPage(browser, { username: 'lv_specA', width: 1280, height: 800 });
    const s2 = await newAuthedPage(browser, { username: 'lv_specB', width: 1280, height: 800 });
    for (const s of [s1, s2]) {
      await s.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
      await waitSocketConnected(s.page);
      const j = await emit(s.page, 'room:join', roomCode);
      if (!j.success) throw new Error(`spectator join: ${j.error}`);
      await s.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
      await waitRoomJoined(s.page, roomCode);
    }

    const [t1, t2] = await Promise.all([emit(s1.page, 'seat:take', 3), emit(s2.page, 'seat:take', 3)]);
    const wins = [t1, t2].filter(t => t.success).length;
    const loser = t1.success ? s2 : s1;
    // 失败者必须还能入座另一个空位(旧 bug:身份丢失后永远「你不在该房间中」)。
    const retake = await emit(loser.page, 'seat:take', 4);
    record('scenario3: 同座并发恰好一人成功', wins === 1, JSON.stringify([t1, t2]).slice(0, 150));
    record('scenario3: 失败者保留身份且可再入座', retake.success === true, retake.error ?? '');

    for (const s of [owner, s1, s2]) await s.context.close();
  }

  // ── 场景 4:等待室路由不制造托管标记 ─────────────────────────────────
  {
    const player = await newAuthedPage(browser, { username: 'lv_wait_rejoin', width: 1280, height: 800 });
    await player.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(player.page);
    const created = await emit(player.page, 'room:create', {});
    if (!created.success) throw new Error(`room:create: ${created.error}`);
    const roomCode = created.roomCode;
    await player.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(player.page, roomCode);
    await player.page.goto(`${CLIENT_URL}/game/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await player.page.waitForURL(`${CLIENT_URL}/room/${roomCode}`, { timeout: 15_000 });
    await waitRoomJoined(player.page, roomCode);
    const marker = await player.page.evaluate(() => window.__uno?.getSuspendedRoom?.() ?? null);
    record('scenario4: 等待室误入 game 路由不会制造托管标记', marker === null, `marker=${marker}`);

    const dissolved = await emit(player.page, 'room:dissolve');
    if (!dissolved.success) throw new Error(`room:dissolve: ${dissolved.error}`);
    await player.context.close();
  }

  // ── 场景 5:托管成员在房间解散后即时恢复大厅 ─────────────────────────
  {
    const owner = await newAuthedPage(browser, { username: 'lv_suspend_owner', width: 1280, height: 800 });
    const player = await newAuthedPage(browser, { username: 'lv_suspend_player', width: 1280, height: 800 });
    await owner.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(owner.page);
    const created = await emit(owner.page, 'room:create', {});
    if (!created.success) throw new Error(`room:create: ${created.error}`);
    const roomCode = created.roomCode;
    await owner.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(owner.page, roomCode);

    await player.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(player.page);
    const joined = await emit(player.page, 'room:join', roomCode);
    if (!joined.success) throw new Error(`room:join: ${joined.error}`);
    await player.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(player.page, roomCode);

    const seated = await emit(player.page, 'seat:take', 1);
    if (!seated.success) throw new Error(`player seat: ${seated.error}`);
    const [readyOwner, readyPlayer] = await Promise.all([
      emit(owner.page, 'room:ready', true),
      emit(player.page, 'room:ready', true),
    ]);
    if (!readyOwner.success || !readyPlayer.success) {
      throw new Error(`room:ready: ${JSON.stringify([readyOwner, readyPlayer])}`);
    }
    await startGame(owner.page, 20_000);
    await Promise.all([waitGamePhase(owner.page, 'playing', 20_000), waitGamePhase(player.page, 'playing', 20_000)]);

    const startRulesButton = player.page.getByRole('button', { name: '开始游戏', exact: true });
    if (
      await startRulesButton
        .waitFor({ state: 'visible', timeout: 2_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await startRulesButton.click();
    }
    const closeInfoButton = player.page.getByText('游戏信息', { exact: true }).locator('..').getByTitle('关闭');
    if (await closeInfoButton.isVisible().catch(() => false)) await closeInfoButton.click();
    await player.page.getByTitle('返回大厅并托管').click();
    await player.page.getByRole('button', { name: '返回大厅', exact: true }).click();
    await player.page.waitForURL(`${CLIENT_URL}/`, { timeout: 15_000 });
    await player.page.waitForFunction(code => window.__uno?.getSuspendedRoom?.() === code, roomCode, {
      timeout: 10_000,
    });
    // A reconnect refreshes the active-room list while this client is now in
    // the lobby. This locks down the less obvious "watch another game" entry.
    await player.page.evaluate(() => {
      const socket = window.__uno.getSocket();
      socket.disconnect();
      socket.connect();
    });
    await waitSocketConnected(player.page);
    const disabledSpectateCards = player.page.getByTitle(`请先返回房间 ${roomCode}`);
    await disabledSpectateCards.first().waitFor({ state: 'visible', timeout: 10_000 });
    const suspendedVisible = await player.page.getByText(`正在托管房间 ${roomCode}`, { exact: true }).isVisible();
    const createDisabled = await player.page.getByRole('button', { name: /创建房间/u }).isDisabled();
    const spectateDisabled = await disabledSpectateCards.evaluateAll(
      buttons => buttons.length > 0 && buttons.every(button => button.disabled),
    );
    record(
      'scenario5: 返回大厅后保留托管提示并禁用全部入房入口',
      suspendedVisible && createDisabled && spectateDisabled,
    );

    // 玩家已主动离开并进入托管；房主此时是最后一个仍在线的真人。
    // 最后在线真人再主动离开必须立即解散，而不是把两个托管席位留到 5 分钟超时。
    const leaveResult = await emit(owner.page, 'room:leave');
    if (!leaveResult.success || leaveResult.outcome !== 'dissolved') {
      throw new Error(`last live room:leave: ${JSON.stringify(leaveResult)}`);
    }
    await player.page.waitForFunction(() => window.__uno?.getSuspendedRoom?.() === null, null, { timeout: 10_000 });
    const bannerCount = await player.page.getByText(`正在托管房间 ${roomCode}`, { exact: true }).count();
    const createEnabled = await player.page.getByRole('button', { name: /创建房间/u }).isEnabled();
    record('scenario5: 解散后即时清除横幅并恢复大厅操作', bannerCount === 0 && createEnabled);

    await owner.context.close();
    await player.context.close();
  }

  // ── 场景 6:等待室观战席踢人入口 ─────────────────────────────────────
  {
    const owner = await newAuthedPage(browser, { username: 'lv_kick_owner', width: 1280, height: 800 });
    const spectator = await newAuthedPage(browser, { username: 'lv_kick_spectator', width: 1280, height: 800 });
    await owner.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(owner.page);
    const created = await emit(owner.page, 'room:create', {});
    if (!created.success) throw new Error(`room:create: ${created.error}`);
    const roomCode = created.roomCode;
    await owner.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(owner.page, roomCode);

    await spectator.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(spectator.page);
    const joined = await emit(spectator.page, 'room:join', roomCode);
    if (!joined.success) throw new Error(`room:join: ${joined.error}`);
    await spectator.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(spectator.page, roomCode);

    await owner.page.getByTitle('踢出 lv_kick_spectator').click();
    await owner.page.getByRole('button', { name: '踢出', exact: true }).click();
    await spectator.page.waitForURL(`${CLIENT_URL}/`, { timeout: 10_000 });
    const remaining = await owner.page.getByText('lv_kick_spectator', { exact: true }).count();
    record('scenario6: 房主可从等待室观战席踢出其他真人', remaining === 0);

    const dissolved = await emit(owner.page, 'room:dissolve');
    if (!dissolved.success) throw new Error(`room:dissolve: ${dissolved.error}`);
    await owner.context.close();
    await spectator.context.close();
  }

  // ── 场景 7：退出登录也必须先提交主动离开 ──────────────────────────────
  {
    const owner = await newAuthedPage(browser, { username: 'lv_logout_owner', width: 1280, height: 800 });
    const player = await newAuthedPage(browser, { username: 'lv_logout_player', width: 1280, height: 800 });

    await owner.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(owner.page);
    const created = await emit(owner.page, 'room:create', {});
    if (!created.success) throw new Error(`room:create: ${created.error}`);
    const roomCode = created.roomCode;
    await owner.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(owner.page, roomCode);

    await player.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(player.page);
    const joined = await emit(player.page, 'room:join', roomCode);
    if (!joined.success) throw new Error(`room:join: ${joined.error}`);
    await player.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(player.page, roomCode);

    const seated = await emit(player.page, 'seat:take', 1);
    if (!seated.success) throw new Error(`player seat: ${seated.error}`);
    const [readyOwner, readyPlayer] = await Promise.all([
      emit(owner.page, 'room:ready', true),
      emit(player.page, 'room:ready', true),
    ]);
    if (!readyOwner.success || !readyPlayer.success) {
      throw new Error(`room:ready: ${JSON.stringify([readyOwner, readyPlayer])}`);
    }
    await startGame(owner.page, 20_000);
    await Promise.all([waitGamePhase(owner.page, 'playing', 20_000), waitGamePhase(player.page, 'playing', 20_000)]);

    const playerId = await player.page.evaluate(() => window.__uno.useAuthStore.getState().user?.id);
    if (!playerId) throw new Error('logout player id unavailable');
    await player.page.evaluate(() => window.__uno.useAuthStore.getState().logout());
    await owner.page.waitForFunction(
      playerId => {
        const state = window.__uno?.useGameStore?.getState?.();
        const departed = state?.players?.find(candidate => candidate.id === playerId);
        return departed?.connected === false && departed?.autopilot === true;
      },
      playerId,
      { timeout: 10_000 },
    );
    const tokenCleared = await player.page.evaluate(() => localStorage.getItem('token') === null);
    record('scenario7: 退出登录前已确认主动离开并进入托管', tokenCleared);

    const leaveResult = await emit(owner.page, 'room:leave');
    record(
      'scenario7: 注销者计入主动离开，最后真人离开立即解散',
      leaveResult.success === true && leaveResult.outcome === 'dissolved',
      JSON.stringify(leaveResult),
    );

    await owner.context.close();
    await player.context.close();
  }
} finally {
  await browser.close();
  await services.stop();
}

const failed = results.filter(r => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
process.exit(failed.length > 0 ? 1 : 0);
