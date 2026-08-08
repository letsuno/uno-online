import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const INSECURE_PRODUCTION_JWT_SECRETS = new Set([
  'please-change-this-to-a-random-string-at-least-32-chars',
  'uno-online-dev-secret-at-least-32-chars',
]);

function validateJwtSecret(jwtSecret: string, devMode: boolean): void {
  if (devMode) return;
  if (jwtSecret.length < 32 || INSECURE_PRODUCTION_JWT_SECRETS.has(jwtSecret)) {
    throw new Error('JWT_SECRET must be a unique random string of at least 32 characters in production');
  }
}

export interface MumbleIceConfig {
  enabled: boolean;
  host: string;
  port: number;
  secret?: string;
  serverId: number;
  parentChannelId: number;
  channelNamePrefix: string;
}

export interface Config {
  port: number;
  databasePath: string;
  redisUrl?: string;
  githubClientId: string;
  githubClientSecret: string;
  githubProxy?: string;
  jwtSecret: string;
  clientUrl: string;
  devMode: boolean;
  serverName: string;
  serverMotd: string;
  roomIdleTimeoutMs: number;
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
  webauthnRpName?: string;
  webauthnRpId?: string;
  webauthnOrigin?: string;
  mumbleIce: MumbleIceConfig;
}

function resolveClientUrl(): string {
  if (process.env['CLIENT_URL']) return process.env['CLIENT_URL'];
  const domain = process.env['DOMAIN'] ?? 'localhost';
  return `https://${domain}`;
}

function loadMumbleIceConfig(): MumbleIceConfig {
  return {
    enabled: process.env['MUMBLE_ICE_ENABLED'] === 'true',
    host: process.env['MUMBLE_ICE_HOST'] ?? 'mumble',
    port: parseInt(process.env['MUMBLE_ICE_PORT'] ?? '6502', 10),
    secret: process.env['MUMBLE_ICE_SECRET'] || undefined,
    serverId: parseInt(process.env['MUMBLE_ICE_SERVER_ID'] ?? '1', 10),
    parentChannelId: parseInt(process.env['MUMBLE_ICE_PARENT_CHANNEL_ID'] ?? '0', 10),
    channelNamePrefix: process.env['MUMBLE_CHANNEL_PREFIX'] ?? 'UNO ',
  };
}

export function loadConfig(): Config {
  const devMode = process.env['DEV_MODE'] === 'true';
  const jwtSecret = required('JWT_SECRET');
  validateJwtSecret(jwtSecret, devMode);
  return {
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    databasePath: process.env['DATABASE_PATH'] ?? 'uno.db',
    redisUrl: process.env['REDIS_URL'] || undefined,
    githubClientId: devMode ? (process.env['GITHUB_CLIENT_ID'] ?? '') : required('GITHUB_CLIENT_ID'),
    githubClientSecret: devMode ? (process.env['GITHUB_CLIENT_SECRET'] ?? '') : required('GITHUB_CLIENT_SECRET'),
    githubProxy: process.env['GITHUB_PROXY'] || undefined,
    jwtSecret,
    clientUrl: resolveClientUrl(),
    devMode,
    serverName: process.env['SERVER_NAME'] ?? 'UNO Online',
    serverMotd: process.env['SERVER_MOTD'] ?? '欢迎来到 UNO Online！',
    roomIdleTimeoutMs: parseInt(process.env['ROOM_IDLE_TIMEOUT_MS'] ?? '7200000', 10),
    turnstileSiteKey: process.env['TURNSTILE_SITE_KEY'] || undefined,
    turnstileSecretKey: process.env['TURNSTILE_SECRET_KEY'] || undefined,
    webauthnRpName: process.env['WEBAUTHN_RP_NAME'] || undefined,
    webauthnRpId: process.env['WEBAUTHN_RP_ID'] || undefined,
    webauthnOrigin: process.env['WEBAUTHN_ORIGIN'] || undefined,
    mumbleIce: loadMumbleIceConfig(),
  };
}
