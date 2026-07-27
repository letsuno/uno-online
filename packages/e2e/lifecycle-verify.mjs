// 实机验证生命周期修复:真实服务端 + 真实浏览器 client + 真实 socket.io。
// 场景:
//  1. 双人真人局全员断网 36s → 房间必须存活(5 分钟宽限);网络恢复后
//     online 监听自动重连并回到对局。
//  2. game:start 并发双击 → 恰好一局。
//  3. seat:take 抢座失败者必须保留观战身份,且还能再入座。
import { startServices, CLIENT_URL } from './lib/harness.mjs';
import { launchBrowser, newAuthedPage, emit, waitSocketConnected, waitGamePhase } from './lib/driver.mjs';

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// 整页导航到 /room/:code 后是全新 socket,必须等 RoomPage 的 rejoin 落地
// (room-store 房码就位)才能发 seat/ready 等房间事件。
async function waitRoomJoined(page, roomCode, timeoutMs = 15000) {
  await page.waitForFunction(
    (code) => window.__uno?.useRoomStore?.getState?.().roomCode === code,
    roomCode,
    { timeout: timeoutMs },
  );
}

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

    const seat0 = await emit(a.page, 'seat:take', 0);
    const seat1 = await emit(b.page, 'seat:take', 1);
    if (!seat0.success && !String(seat0.error).includes('占用')) throw new Error(`A seat: ${seat0.error}`);
    if (!seat1.success) throw new Error(`B seat: ${seat1.error}`);
    await emit(b.page, 'room:ready', true);
    await emit(a.page, 'room:ready', true);
    const started = await emit(a.page, 'game:start').catch((e) => {
      if (String(e).includes('Execution context')) return { success: true };
      throw e;
    });
    if (!started.success) throw new Error(`game:start: ${started.error}`);
    await waitGamePhase(a.page, 'playing', 20000);
    await a.page.goto(`${CLIENT_URL}/game/${roomCode}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await b.page.goto(`${CLIENT_URL}/game/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitGamePhase(a.page, 'playing', 20000);
    await waitGamePhase(b.page, 'playing', 20000);
    record('scenario1: 双人真人局开局', true);

    // 双方同时断网 36 秒:覆盖两个 30s 重连窗口到期的时点。
    await a.context.setOffline(true);
    await b.context.setOffline(true);
    console.log('  ... 双方离线 36s(跨过 30s 定时器)');
    await new Promise((r) => setTimeout(r, 36_000));

    // 服务端侧房间必须仍然存在(旧行为:首个 30s 定时器直接解散)。
    const probe = await fetch(`${CLIENT_URL}/api/health`).then((r) => r.ok);
    record('scenario1: 服务端存活探测', probe);

    // 网络恢复:'online' 事件应自动 connectSocket → rejoin → 回到对局。
    await a.context.setOffline(false);
    await b.context.setOffline(false);
    let recovered = true;
    let detail = '';
    try {
      await waitSocketConnected(a.page, 30000);
      await waitSocketConnected(b.page, 30000);
      await waitGamePhase(a.page, 'playing', 20000);
      await waitGamePhase(b.page, 'playing', 20000);
    } catch (e) {
      recovered = false;
      detail = String(e).slice(0, 200);
    }
    const dissolvedA = await a.page.evaluate(() => window.__uno?.useGameStore?.getState?.().dissolvedReason ?? null);
    record('scenario1: 断网 36s 后房间未解散且自动重连回局', recovered && !dissolvedA,
      detail || (dissolvedA ? `dissolvedReason=${dissolvedA}` : ''));
    // 离线窗口内的连接失败是本场景刻意制造的网络状态,不算运行时缺陷。
    const realErrors = (errs) => errs.filter(
      (e) => !e.includes('ERR_INTERNET_DISCONNECTED') && !e.includes('WebSocket connection'),
    );
    record('scenario1: A 页无运行时错误', realErrors(a.errors).length === 0, realErrors(a.errors).join(' | ').slice(0, 300));
    record('scenario1: B 页无运行时错误', realErrors(b.errors).length === 0, realErrors(b.errors).join(' | ').slice(0, 300));

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
    const roomCode = created.roomCode;
    await a.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(a.page, roomCode);
    await emit(a.page, 'seat:take', 0);
    await emit(a.page, 'room:add_bot', { difficulty: 'easy' });
    await emit(a.page, 'room:ready', true);

    const [r1, r2] = await a.page.evaluate(
      () =>
        new Promise((resolveAll) => {
          const socket = window.__uno.getSocket();
          const one = new Promise((res) => socket.emit('game:start', (r) => res(r ?? {})));
          const two = new Promise((res) => socket.emit('game:start', (r) => res(r ?? {})));
          Promise.all([one, two]).then(resolveAll);
        }),
    );
    const successes = [r1, r2].filter((r) => r.success).length;
    record('scenario2: 并发双击恰好开一局', successes === 1, JSON.stringify([r1.success, r2.success]));
    await a.context.close();
  }

  // ── 场景 3:抢座失败者保留观战身份 ────────────────────────────────────
  {
    const owner = await newAuthedPage(browser, { username: 'lv_sowner', width: 1280, height: 800 });
    await owner.page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitSocketConnected(owner.page);
    const created = await emit(owner.page, 'room:create', {});
    const roomCode = created.roomCode;
    await owner.page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
    await waitRoomJoined(owner.page, roomCode);
    await emit(owner.page, 'seat:take', 0);

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

    const [t1, t2] = await Promise.all([
      emit(s1.page, 'seat:take', 3),
      emit(s2.page, 'seat:take', 3),
    ]);
    const wins = [t1, t2].filter((t) => t.success).length;
    const loser = t1.success ? s2 : s1;
    // 失败者必须还能入座另一个空位(旧 bug:身份丢失后永远「你不在该房间中」)。
    const retake = await emit(loser.page, 'seat:take', 4);
    record('scenario3: 同座并发恰好一人成功', wins === 1, JSON.stringify([t1, t2]).slice(0, 150));
    record('scenario3: 失败者保留身份且可再入座', retake.success === true, retake.error ?? '');

    for (const s of [owner, s1, s2]) await s.context.close();
  }
} finally {
  await browser.close();
  await services.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
process.exit(failed.length > 0 ? 1 : 0);
