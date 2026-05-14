import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { UnoSocketClient } from './socket-client.js';
import { registerRoomTools } from './tools/room.js';
import { registerGameTools } from './tools/game.js';
import { registerQueryTools } from './tools/query.js';
import { setupNotifications } from './notifications.js';
import type { McpConfig } from './types.js';

async function fetchUserId(serverUrl: string, apiKey: string): Promise<string> {
  const res = await fetch(`${serverUrl}/api/api-keys/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: apiKey }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(data.error ?? `API Key 验证失败: ${res.status}`);
  }
  const user = await res.json() as { userId: string };
  return user.userId;
}

export class McpUnoServer {
  private mcp: McpServer;
  private socketClient: UnoSocketClient | null = null;
  private config: McpConfig;
  private userId: string | null = null;

  constructor(config: McpConfig) {
    this.config = config;
    this.mcp = new McpServer(
      { name: 'UNO Online', version: '0.4.0' },
      { capabilities: { logging: {} } },
    );
    this.registerTools();
  }

  get mcpServer(): McpServer {
    return this.mcp;
  }

  getClient(): UnoSocketClient {
    if (!this.socketClient?.connected) {
      throw new Error('未连接到游戏服务器');
    }
    return this.socketClient;
  }

  async initialize(): Promise<void> {
    this.userId = await fetchUserId(this.config.serverUrl, this.config.apiKey);
    this.socketClient = new UnoSocketClient(this.config.serverUrl, this.config.apiKey);
    setupNotifications(this.socketClient, this.mcp.server, this.userId);
    await this.socketClient.connect();
    console.error(`UNO MCP Server 已连接，用户: ${this.userId}`);
  }

  async shutdown(): Promise<void> {
    this.socketClient?.disconnect();
  }

  private registerTools(): void {
    registerRoomTools(this);
    registerGameTools(this);
    registerQueryTools(this);
  }
}
