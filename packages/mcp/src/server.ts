import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { UnoSocketClient } from './socket-client.js';
import { verifyApiKey } from './auth.js';
import { registerRoomTools } from './tools/room.js';
import { registerGameTools } from './tools/game.js';
import { registerQueryTools } from './tools/query.js';
import { setupNotifications } from './notifications.js';
import type { McpConfig, UserIdentity } from './types.js';

const TOKEN_REFRESH_MS = 20 * 60 * 60 * 1000;

export class McpUnoServer {
  private mcp: McpServer;
  private socketClient: UnoSocketClient | null = null;
  private config: McpConfig;
  private user: UserIdentity | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: McpConfig) {
    this.config = config;
    this.mcp = new McpServer(
      { name: 'UNO Online', version: '0.1.0' },
      { capabilities: { logging: {} } },
    );
    this.registerTools();
  }

  get mcpServer(): McpServer {
    return this.mcp;
  }

  get userId(): string | null {
    return this.user?.userId ?? null;
  }

  getClient(): UnoSocketClient {
    if (!this.socketClient?.connected) {
      throw new Error('未连接到游戏服务器');
    }
    return this.socketClient;
  }

  async initialize(): Promise<void> {
    this.user = await verifyApiKey(this.config.serverUrl, this.config.apiKey);
    this.socketClient = new UnoSocketClient(this.config.serverUrl, this.user.token);
    setupNotifications(this.socketClient, this.mcp.server, this.user.userId);
    await this.socketClient.connect();
    this.refreshTimer = setInterval(() => this.refreshToken(), TOKEN_REFRESH_MS);
  }

  async shutdown(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.socketClient?.disconnect();
  }

  private async refreshToken(): Promise<void> {
    try {
      this.user = await verifyApiKey(this.config.serverUrl, this.config.apiKey);
      this.socketClient?.updateToken(this.user.token);
    } catch {
      // verify 失败时保持现有连接，下次重试
    }
  }

  private registerTools(): void {
    registerRoomTools(this);
    registerGameTools(this);
    registerQueryTools(this);
  }
}
