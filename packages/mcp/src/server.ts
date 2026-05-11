import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { UnoSocketClient } from './socket-client.js';
import { verifyApiKey } from './auth.js';
import { registerRoomTools } from './tools/room.js';
import { registerGameTools } from './tools/game.js';
import { registerQueryTools } from './tools/query.js';
import type { McpConfig, UserIdentity } from './types.js';

export class McpUnoServer {
  private mcp: McpServer;
  private socketClient: UnoSocketClient | null = null;
  private config: McpConfig;
  private user: UserIdentity | null = null;

  constructor(config: McpConfig) {
    this.config = config;
    this.mcp = new McpServer({ name: 'UNO Online', version: '0.1.0' });
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
    await this.socketClient.connect();
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
