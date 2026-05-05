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

export function loadConfig(): Config {
  return {
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    githubClientId: required('GITHUB_CLIENT_ID'),
    githubClientSecret: required('GITHUB_CLIENT_SECRET'),
    jwtSecret: required('JWT_SECRET'),
    clientUrl: process.env['CLIENT_URL'] ?? 'http://localhost:5173',
  };
}
