function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface Config {
  port: number;
  databasePath: string;
  redisUrl: string;
  githubClientId: string;
  githubClientSecret: string;
  jwtSecret: string;
  clientUrl: string;
  devMode: boolean;
}

function resolveClientUrl(): string {
  if (process.env['CLIENT_URL']) return process.env['CLIENT_URL'];
  const domain = process.env['DOMAIN'] ?? 'localhost';
  return `https://${domain}`;
}

export function loadConfig(): Config {
  const devMode = process.env['DEV_MODE'] === 'true';
  return {
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    databasePath: process.env['DATABASE_PATH'] ?? 'uno.db',
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    githubClientId: devMode ? (process.env['GITHUB_CLIENT_ID'] ?? '') : required('GITHUB_CLIENT_ID'),
    githubClientSecret: devMode ? (process.env['GITHUB_CLIENT_SECRET'] ?? '') : required('GITHUB_CLIENT_SECRET'),
    jwtSecret: required('JWT_SECRET'),
    clientUrl: resolveClientUrl(),
    devMode,
  };
}
