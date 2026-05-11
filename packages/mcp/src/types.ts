export interface McpConfig {
  apiKey: string;
  serverUrl: string;
  mode: 'stdio' | 'http';
  httpPort?: number;
}
