// 视觉验证主脚本：多分辨率 × 多阶段截图 + 溢出检测 + console 错误收集
// 用法: node visual.mjs [--stages login,lobby,room,game] [--res 1920x1080,...] [--tag baseline]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServices, CLIENT_URL } from './lib/harness.mjs';
import { launchBrowser, newAuthedPage, setupGame, checkOverflow, waitSocketConnected, emit, dismissGameOverlays } from './lib/driver.mjs';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), 'output');

const DEFAULT_RES = [
  [1920, 1080],
  [2560, 1080],
  [1024, 768],
  [1024, 600],
  [844, 390],
  [768, 1024],
  [390, 844],
  [360, 640],
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const TAG = arg('tag', 'run');
const STAGES = arg('stages', 'login,lobby,room,game').split(',');
const RES = arg('res', null)
  ? arg('res').split(',').map((s) => s.split('x').map(Number))
  : DEFAULT_RES;

const report = { tag: TAG, stages: {}, errors: [] };

async function shot(page, stage, w, h, errors) {
  const file = resolve(outDir, `${TAG}-${stage}-${w}x${h}.png`);
  await page.screenshot({ path: file });
  const overflow = await checkOverflow(page);
  const key = `${stage}-${w}x${h}`;
  report.stages[key] = { screenshot: file, overflow, consoleErrors: [...errors] };
  errors.length = 0;
  const flag = overflow.count > 0 ? ` ⚠ 溢出 ${overflow.count}` : '';
  console.log(`  ✓ ${key}${flag}`);
}

async function run() {
  mkdirSync(outDir, { recursive: true });
  console.log('启动服务...');
  const services = await startServices();
  const browser = await launchBrowser();

  try {
    for (const [w, h] of RES) {
      console.log(`分辨率 ${w}x${h}:`);
      const username = `视觉测试${w}x${h}`;
      const { page, context, errors } = await newAuthedPage(browser, { username, width: w, height: h });

      try {
        if (STAGES.includes('login')) {
          // 登录页需要未登录状态：先进站再清 token，然后重进首页
          await page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
          await page.evaluate(() => localStorage.removeItem('token'));
          await page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1200);
          await shot(page, 'login', w, h, errors);
          // 恢复登录态
          const { token } = await (await fetch(`${CLIENT_URL}/api/auth/dev-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
          })).json().then((d) => ({ token: d.token }));
          await page.evaluate((t) => localStorage.setItem('token', t), token);
        }

        if (STAGES.includes('lobby')) {
          await page.goto(`${CLIENT_URL}/`, { waitUntil: 'domcontentloaded' });
          await waitSocketConnected(page);
          await page.waitForTimeout(1200);
          await shot(page, 'lobby', w, h, errors);
        }

        let roomCode = null;
        if (STAGES.includes('room') || STAGES.includes('game')) {
          await waitSocketConnected(page).catch(() => page.reload({ waitUntil: 'domcontentloaded' }));
          await waitSocketConnected(page);
          const created = await emit(page, 'room:create', {});
          if (!created.success) throw new Error(`room:create 失败: ${created.error}`);
          roomCode = created.roomCode;
          await page.goto(`${CLIENT_URL}/room/${roomCode}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1200);
        }

        if (STAGES.includes('room')) {
          await shot(page, 'room', w, h, errors);
        }

        if (STAGES.includes('game')) {
          // 进房后 socket rejoin 有延迟，重试入座（房主可能已自动入座）
          let taken = null;
          for (let i = 0; i < 10; i++) {
            taken = await emit(page, 'seat:take', 0);
            if (taken.success || String(taken.error).includes('占用')) break;
            await page.waitForTimeout(500);
          }
          if (!taken.success && !String(taken.error).includes('占用')) throw new Error(`seat:take 失败: ${taken.error}`);
          for (let i = 0; i < 2; i++) {
            const added = await emit(page, 'room:add_bot', { difficulty: 'easy' });
            if (!added.success) throw new Error(`room:add_bot 失败: ${added.error}`);
          }
          await emit(page, 'room:ready', true);
          const started = await emit(page, 'game:start').catch((e) => {
            // 开局成功会触发客户端跳转 /game/:code，evaluate 上下文随之销毁，属正常
            if (String(e).includes('Execution context')) return { success: true };
            throw e;
          });
          if (!started.success) throw new Error(`game:start 失败: ${started.error}`);
          await page.waitForFunction(
            () => window.__uno?.useGameStore?.getState?.().phase === 'playing',
            null,
            { timeout: 15000 },
          );
          await page.waitForTimeout(1000);
          await dismissGameOverlays(page);
          await page.waitForTimeout(800);
          await shot(page, 'game', w, h, errors);
        }
      } catch (err) {
        report.errors.push({ res: `${w}x${h}`, error: String(err) });
        console.log(`  ✗ ${w}x${h}: ${err.message ?? err}`);
        try { await page.screenshot({ path: resolve(outDir, `${TAG}-ERROR-${w}x${h}.png`) }); } catch { /* ignore */ }
      } finally {
        await context.close();
      }
    }
  } finally {
    writeFileSync(resolve(outDir, `${TAG}-report.json`), JSON.stringify(report, null, 2));
    await browser.close();
    await services.stop();
  }

  const overflowTotal = Object.values(report.stages).filter((s) => s.overflow.count > 0).length;
  const consoleErrTotal = Object.values(report.stages).filter((s) => s.consoleErrors.length > 0).length;
  console.log(`\n完成: ${Object.keys(report.stages).length} 张截图, ${overflowTotal} 个场景有溢出, ${consoleErrTotal} 个场景有 console 错误, ${report.errors.length} 个场景失败`);
  console.log(`报告: ${resolve(outDir, `${TAG}-report.json`)}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
