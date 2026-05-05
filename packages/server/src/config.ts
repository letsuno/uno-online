function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface Config {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  githubClientId: string;
  githubClientSecret: string;
  jwtSecret: string;
  clientUrl: string;
}

function resolveClientUrl(): string {
  if (process.env['CLIENT_URL']) return process.env['CLIENT_URL'];
  const domain = process.env['DOMAIN'] ?? 'localhost';
  return `https://${domain}`;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    githubClientId: required('GITHUB_CLIENT_ID'),
    githubClientSecret: required('GITHUB_CLIENT_SECRET'),
    jwtSecret: required('JWT_SECRET'),
    clientUrl: resolveClientUrl(),
  };
}
