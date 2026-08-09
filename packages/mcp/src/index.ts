import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpUnoServer } from './server.js';
import type { McpConfig } from './types.js';

export function parseConfig(
  args: string[] = process.argv.slice(2),
  env: Readonly<Record<string, string | undefined>> = process.env,
): McpConfig {
  const { values } = parseArgs({
    args,
    options: {
      'api-key': { type: 'string' },
      server: { type: 'string' },
      mode: { type: 'string', default: 'stdio' },
      port: { type: 'string', default: '3002' },
    },
    strict: true,
    allowPositionals: false,
  });

  const apiKey = values['api-key'] ?? env['UNO_API_KEY'];
  const serverUrlInput = values.server ?? env['UNO_SERVER_URL'];

  if (!apiKey) {
    throw new Error('请提供 --api-key 参数或设置 UNO_API_KEY 环境变量');
  }
  if (!serverUrlInput) {
    throw new Error('请提供 --server 参数或设置 UNO_SERVER_URL 环境变量');
  }

  const mode = values.mode ?? 'stdio';
  if (mode !== 'stdio' && mode !== 'http') {
    throw new Error(`无效的传输模式: ${mode}（仅支持 stdio 或 http）`);
  }

  const portValue = values.port ?? '3002';
  const portInput = portValue.trim();
  if (!/^\d+$/.test(portInput)) {
    throw new Error(`无效的 HTTP 端口: ${portValue}`);
  }
  const httpPort = Number(portInput);
  if (!Number.isSafeInteger(httpPort) || httpPort < 1 || httpPort > 65_535) {
    throw new Error(`HTTP 端口必须是 1 到 65535 之间的整数: ${portValue}`);
  }

  let serverUrl: URL;
  try {
    serverUrl = new URL(serverUrlInput);
  } catch {
    throw new Error(`无效的游戏服务器 URL: ${serverUrlInput}`);
  }
  if (serverUrl.protocol !== 'http:' && serverUrl.protocol !== 'https:') {
    throw new Error(`游戏服务器 URL 仅支持 http 或 https: ${serverUrlInput}`);
  }
  if (serverUrl.username || serverUrl.password || serverUrl.search || serverUrl.hash) {
    throw new Error('游戏服务器 URL 不能包含凭据、查询参数或片段');
  }

  return {
    apiKey,
    serverUrl: serverUrl.toString().replace(/\/+$/, ''),
    mode,
    httpPort,
  };
}

async function main() {
  const config = parseConfig();
  const unoServer = new McpUnoServer(config);

  await unoServer.initialize();

  if (config.mode === 'stdio') {
    const transport = new StdioServerTransport();
    await unoServer.mcpServer.connect(transport);
    console.error('UNO MCP Server (stdio) 已启动');
  } else {
    const { createServer } = await import('node:http');
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await unoServer.mcpServer.connect(transport);

    const httpServer = createServer(async (req, res) => {
      await transport.handleRequest(req, res);
    });
    httpServer.listen(config.httpPort, '127.0.0.1', () => {
      console.error(`UNO MCP Server (HTTP) 已启动: http://127.0.0.1:${config.httpPort}/`);
    });
  }

  const shutdown = async () => {
    await unoServer.shutdown();
    await unoServer.mcpServer.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  void main().catch((err: unknown) => {
    console.error('启动失败:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
