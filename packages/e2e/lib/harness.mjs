// 启动 DEV_MODE 后端 + Vite 前端，供 e2e 使用
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = resolve(root, 'packages/e2e/output');

export const CLIENT_URL = 'http://127.0.0.1:5173';

async function waitFor(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not ready */ }
    if (Date.now() > deadline) throw new Error(`等待服务超时: ${url}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function startServices() {
  mkdirSync(outDir, { recursive: true });
  const serverLog = createWriteStream(resolve(outDir, 'server.log'));
  const clientLog = createWriteStream(resolve(outDir, 'client.log'));

  const server = spawn('pnpm', ['--filter', '@uno-online/server', 'exec', 'tsx', 'src/index.ts'], {
    cwd: root,
    env: {
      ...process.env,
      DEV_MODE: 'true',
      JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-32',
      DATABASE_PATH: `/tmp/uno-e2e-${process.pid}.db`,
      PORT: '3001',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);

  const client = spawn('pnpm', ['--filter', '@uno-online/client', 'exec', 'vite', '--port', '5173', '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  client.stdout.pipe(clientLog);
  client.stderr.pipe(clientLog);

  // 前端 ready 即代表代理可用；再确认后端健康
  await waitFor(`${CLIENT_URL}/api/health`);

  return {
    async stop() {
      server.kill('SIGTERM');
      client.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
      server.kill('SIGKILL');
      client.kill('SIGKILL');
    },
  };
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
