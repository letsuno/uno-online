// 启动 DEV_MODE 后端 + Vite 前端，供 e2e 使用
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, createWriteStream, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalHarnessConfig, resolveHarnessConfig } from './harness-config.mjs';
import { assertPortAvailable } from './port-guard.mjs';
import { onceAsync, withStartupCleanup } from './startup-guard.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = resolve(root, 'packages/e2e/output');

const harnessConfig = resolveHarnessConfig();
export const CLIENT_URL = harnessConfig.clientUrl;
const { clientPort, serverPort } = harnessConfig;
const clientHost = new URL(CLIENT_URL).hostname.replace(/^\[|\]$/gu, '');

function spawnPnpm(args, options) {
  if (process.platform !== 'win32') return spawn('pnpm', args, options);

  const where = spawnSync('where.exe', ['pnpm.cmd'], { encoding: 'utf8' });
  const pnpmShim = where.status === 0 ? where.stdout.split(/\r?\n/u).find(Boolean) : null;
  const candidates = [
    process.env.PNPM_CLI_PATH,
    pnpmShim && resolve(dirname(pnpmShim), 'node_modules/pnpm/bin/pnpm.cjs'),
    resolve(dirname(process.execPath), 'node_modules/corepack/dist/pnpm.js'),
    resolve(dirname(process.execPath), 'bin/node_modules/pnpm/bin/pnpm.cjs'),
  ].filter(Boolean);
  const pnpmCli = candidates.find(candidate => existsSync(candidate));
  if (!pnpmCli) throw new Error('找不到 pnpm CLI；可通过 PNPM_CLI_PATH 指定');
  return spawn(process.execPath, [pnpmCli, ...args], options);
}

async function waitFor(url, processes, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const processInfo of processes) {
      if (processInfo.error) throw processInfo.error;
      if (processInfo.child.exitCode !== null) {
        throw new Error(`${processInfo.name} 提前退出，退出码: ${processInfo.child.exitCode}`);
      }
    }
    try {
      const remainingMs = Math.max(1, deadline - Date.now());
      const res = await fetch(url, { signal: AbortSignal.timeout(Math.min(2_000, remainingMs)) });
      if (res.ok) return;
    } catch {
      /* not ready */
    }
    if (Date.now() > deadline) throw new Error(`等待服务超时: ${url}`);
    await new Promise(r => setTimeout(r, 500));
  }
}

function signalProcessTree(child, signal) {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

async function closeLog(stream) {
  if (stream.closed || stream.destroyed) return;
  await new Promise(resolveClose => stream.end(resolveClose));
}

export async function startServices() {
  assertLocalHarnessConfig(harnessConfig);
  await Promise.all([
    assertPortAvailable('0.0.0.0', serverPort, '服务端'),
    assertPortAvailable(clientHost, clientPort, '客户端'),
  ]);
  mkdirSync(outDir, { recursive: true });
  const serverLog = createWriteStream(resolve(outDir, 'server.log'));
  const clientLog = createWriteStream(resolve(outDir, 'client.log'));
  let server = null;
  let client = null;

  const stop = onceAsync(async () => {
    const children = [server, client].filter(Boolean);
    if (process.platform === 'win32') {
      for (const child of children) signalProcessTree(child, 'SIGKILL');
    } else {
      for (const child of children) signalProcessTree(child, 'SIGTERM');
      await new Promise(resolveWait => setTimeout(resolveWait, 500));
      for (const child of children) signalProcessTree(child, 'SIGKILL');
    }
    server?.stdout?.unpipe(serverLog);
    server?.stderr?.unpipe(serverLog);
    client?.stdout?.unpipe(clientLog);
    client?.stderr?.unpipe(clientLog);
    await Promise.all([closeLog(serverLog), closeLog(clientLog)]);
  });

  return withStartupCleanup(async () => {
    server = spawnPnpm(['--filter', '@uno-online/server', 'exec', 'tsx', 'src/index.ts'], {
      cwd: root,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        DEV_MODE: 'true',
        JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-32',
        DATABASE_PATH: resolve(outDir, `uno-e2e-${process.pid}.db`),
        PORT: String(serverPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.pipe(serverLog);
    server.stderr.pipe(serverLog);

    client = spawnPnpm(
      [
        '--filter',
        '@uno-online/client',
        'exec',
        'vite',
        '--host',
        clientHost,
        '--port',
        String(clientPort),
        '--strictPort',
      ],
      {
        cwd: root,
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          VITE_PROXY_TARGET: `http://127.0.0.1:${serverPort}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    client.stdout.pipe(clientLog);
    client.stderr.pipe(clientLog);

    const processes = [
      { name: 'server', child: server, error: null },
      { name: 'client', child: client, error: null },
    ];
    for (const processInfo of processes) {
      processInfo.child.once('error', error => {
        processInfo.error = new Error(`${processInfo.name} 启动失败: ${error.message}`);
      });
    }

    // 前端 ready 即代表代理可用；再确认后端健康。
    await waitFor(`${CLIENT_URL}/api/health`, processes);
    return { stop };
  }, stop);
}

export async function devLogin(username) {
  const res = await fetch(`${CLIENT_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error(`dev-login 失败: ${res.status} ${await res.text()}`);
  return res.json();
}
