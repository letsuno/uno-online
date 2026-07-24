// 浏览器驱动：登录、socket 操作、溢出检测
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_URL, devLogin } from './harness.mjs';

const CLIENT_VERSION = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../client/package.json'), 'utf8'),
).version;

const CHROME_PATH = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

export async function launchBrowser() {
  return chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });
}

/** 新建一个已登录的页面，附带 console/pageerror 收集 */
export async function newAuthedPage(browser, { username, width, height }) {
  const { token } = await devLogin(username);
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await context.addInitScript((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('app-last-seen-version', window.__CLIENT_VERSION__); // 屏蔽更新日志弹窗
    localStorage.setItem('notificationPromptDismissed', 'true');
    sessionStorage.setItem('start-screen-passed', '1'); // 跳过启动屏
    localStorage.setItem('tutorialShown', 'true'); // 跳过新手教程
  }, token);
  await context.addInitScript((v) => localStorage.setItem('app-last-seen-version', v), CLIENT_VERSION);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // e2e 环境没有 mumble-gateway，语音 WS 连接失败属预期噪声
      if (text.includes('64737')) return;
      // DEV_MODE 不注册 /api/profile 路由，404 属环境噪声
      if (text.includes('404') && (msg.location()?.url ?? '').includes('/api/profile')) return;
      errors.push(`console.error: ${text}`);
    }
  });
  return { page, context, errors };
}

/** 在页面上下文里 emit socket 事件并等待 callback */
export function emit(page, event, ...args) {
  return page.evaluate(
    ([ev, ...rest]) =>
      new Promise((resolvePromise) => {
        const socket = window.__uno?.getSocket?.();
        if (!socket) return resolvePromise({ success: false, error: 'no __uno hook' });
        socket.emit(ev, ...rest, (res) => resolvePromise(res ?? {}));
      }),
    [event, ...args],
  );
}

export async function waitSocketConnected(page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => window.__uno?.getSocket?.()?.connected === true,
    null,
    { timeout: timeoutMs },
  );
}

export async function waitGamePhase(page, phase, timeoutMs = 15000) {
  await page.waitForFunction(
    (p) => window.__uno?.useGameStore?.getState?.().phase === p,
    phase,
    { timeout: timeoutMs },
  );
}

/**
 * 创建房间 → 入座 → 加 Bot → 开局，浏览器玩家为房主。
 * 返回 roomCode。
 */
export async function setupGame(page, { botCount = 2, difficulty = 'easy' } = {}) {
  await page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
  await waitSocketConnected(page);

  const created = await emit(page, 'room:create', {});
  if (!created.success) throw new Error(`room:create 失败: ${created.error}`);
  const roomCode = created.roomCode;

  await page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  let taken = null;
  for (let i = 0; i < 10; i++) {
    taken = await emit(page, 'seat:take', 0);
    if (taken.success || String(taken.error).includes('占用')) break;
    await page.waitForTimeout(500);
  }
  if (!taken.success && !String(taken.error).includes('占用')) throw new Error(`seat:take 失败: ${taken.error}`);

  for (let i = 0; i < botCount; i++) {
    const added = await emit(page, 'room:add_bot', { difficulty });
    if (!added.success) throw new Error(`room:add_bot 失败: ${added.error}`);
  }

  await emit(page, 'room:ready', true);
  const started = await emit(page, 'game:start').catch((e) => {
            // 开局成功会触发客户端跳转 /game/:code，evaluate 上下文随之销毁，属正常
            if (String(e).includes('Execution context')) return { success: true };
            throw e;
          });
  if (!started.success) throw new Error(`game:start 失败: ${started.error}`);
  await waitGamePhase(page, 'playing');
  return roomCode;
}

/** DOM 溢出检测：找出超出「视口 ∩ 最近裁剪祖先」的可见元素（完全在裁剪区外的不算，那是离屏停靠） */
export function checkOverflow(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[data-allow-overflow]')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // 计算有效裁剪区：视口与所有 overflow 非 visible 祖先的交集
      let clip = { left: 0, top: 0, right: vw, bottom: vh };
      let scrollable = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (/(scroll|auto)/.test(`${ps.overflowX}${ps.overflowY}`) && (p.scrollHeight > p.clientHeight + 2 || p.scrollWidth > p.clientWidth + 2)) {
          scrollable = true; // 在真实可滚容器内，边缘裁切可通过滚动到达，不算缺陷
        }
        if (/(hidden|scroll|auto|clip)/.test(`${ps.overflow}${ps.overflowX}${ps.overflowY}`)) {
          const pr = p.getBoundingClientRect();
          clip = {
            left: Math.max(clip.left, pr.left),
            top: Math.max(clip.top, pr.top),
            right: Math.min(clip.right, pr.right),
            bottom: Math.min(clip.bottom, pr.bottom),
          };
        }
      }
      // 完全在裁剪区外 = 离屏停靠（如关闭态抽屉），不可见也不算问题
      if (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom) continue;
      if (scrollable) continue;
      const over = {
        left: rect.left < clip.left - 2,
        top: rect.top < clip.top - 2,
        right: rect.right > clip.right + 2,
        bottom: rect.bottom > clip.bottom + 2,
      };
      if (over.left || over.top || over.right || over.bottom) {
        const id = el.id ? `#${el.id}` : '';
        const cls = typeof el.className === 'string' ? el.className.split(' ').slice(0, 4).join('.') : '';
        bad.push({
          el: `${el.tagName.toLowerCase()}${id}${cls ? '.' + cls : ''}`,
          sides: Object.keys(over).filter((k) => over[k]),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          html: el.outerHTML.slice(0, 160),
        });
      }
    }
    return { viewport: { w: vw, h: vh }, count: bad.length, items: bad.slice(0, 30) };
  });
}

/** 关掉开局规则弹窗与信息抽屉，露出牌桌本体 */
export async function dismissGameOverlays(page) {
  await page.getByRole('button', { name: '开始游戏' }).click({ timeout: 3000 }).catch(() => {});
  await page.evaluate(() => window.__uno?.useGameStore?.setState?.({ infoDrawerOpen: false })).catch(() => {});
}
