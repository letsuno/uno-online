export interface McpConfig {
  apiKey: string;
  serverUrl: string;
  mode: 'stdio' | 'http';
  httpPort: number;
}

export interface McpToolResult {
  [x: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}
