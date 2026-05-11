import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpUnoServer } from './server.js';
import type { McpConfig } from './types.js';

function parseConfig(): McpConfig {
  const { values } = parseArgs({
    options: {
      'api-key': { type: 'string' },
      server: { type: 'string' },
      mode: { type: 'string', default: 'stdio' },
      port: { type: 'string', default: '3002' },
    },
    strict: false,
  });

  const apiKey = (typeof values['api-key'] === 'string' ? values['api-key'] : undefined) ?? process.env['UNO_API_KEY'];
  const serverUrl = (typeof values.server === 'string' ? values.server : undefined) ?? process.env['UNO_SERVER_URL'];

  if (!apiKey) {
    console.error('错误: 请提供 --api-key 参数或设置 UNO_API_KEY 环境变量');
    process.exit(1);
  }
  if (!serverUrl) {
    console.error('错误: 请提供 --server 参数或设置 UNO_SERVER_URL 环境变量');
    process.exit(1);
  }

  return {
    apiKey,
    serverUrl: serverUrl.replace(/\/$/, ''),
    mode: (String(values.mode ?? 'stdio') as 'stdio' | 'http'),
    httpPort: parseInt(String(values.port ?? '3002'), 10),
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

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
