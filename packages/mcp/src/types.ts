export interface McpConfig {
  apiKey: string;
  serverUrl: string;
  mode: 'stdio' | 'http';
  httpPort?: number;
}

export interface UserIdentity {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  role: string;
  token: string;
}
