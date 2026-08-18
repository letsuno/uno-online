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
  runtimeSchemaVersion: string;
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
  webauthnRpName?: string;
  webauthnRpId?: string;
  webauthnOrigin?: string;
  mumbleIce: MumbleIceConfig;
}

function runtimeSchemaVersion(): string {
  const value = process.env['RUNTIME_SCHEMA_VERSION'] ?? '1';
  if (!/^[A-Za-z0-9._-]+$/u.test(value)) {
    throw new Error('RUNTIME_SCHEMA_VERSION may contain only letters, numbers, dot, underscore, and hyphen');
  }
  return value;
}

interface IntegerEnvironmentOptions {
  min: number;
  max: number;
}

function integerEnvironment(name: string, defaultValue: number, { min, max }: IntegerEnvironmentOptions): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  if (!/^-?\d+$/u.test(raw)) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function booleanEnvironment(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be either true or false`);
}

function resolveClientUrl(): string {
  if (process.env['CLIENT_URL']) return process.env['CLIENT_URL'];
  const domain = process.env['DOMAIN'] ?? 'localhost';
  return `https://${domain}`;
}

function loadMumbleIceConfig(): MumbleIceConfig {
  return {
    enabled: booleanEnvironment('MUMBLE_ICE_ENABLED', false),
    host: process.env['MUMBLE_ICE_HOST'] ?? 'mumble',
    port: integerEnvironment('MUMBLE_ICE_PORT', 6502, { min: 1, max: 65_535 }),
    secret: process.env['MUMBLE_ICE_SECRET'] || undefined,
    serverId: integerEnvironment('MUMBLE_ICE_SERVER_ID', 1, { min: 0, max: 2_147_483_647 }),
    parentChannelId: integerEnvironment('MUMBLE_ICE_PARENT_CHANNEL_ID', 0, { min: 0, max: 2_147_483_647 }),
    channelNamePrefix: process.env['MUMBLE_CHANNEL_PREFIX'] ?? 'UNO ',
  };
}

export function loadConfig(): Config {
  const devMode = booleanEnvironment('DEV_MODE', false);
  const jwtSecret = required('JWT_SECRET');
  validateJwtSecret(jwtSecret, devMode);
  const redisUrl = process.env['REDIS_URL'] || undefined;
  if (!devMode && !redisUrl) {
    throw new Error('Missing required environment variable in production: REDIS_URL');
  }
  return {
    port: integerEnvironment('PORT', 3001, { min: 1, max: 65_535 }),
    databasePath: process.env['DATABASE_PATH'] ?? 'uno.db',
    redisUrl,
    githubClientId: devMode ? (process.env['GITHUB_CLIENT_ID'] ?? '') : required('GITHUB_CLIENT_ID'),
    githubClientSecret: devMode ? (process.env['GITHUB_CLIENT_SECRET'] ?? '') : required('GITHUB_CLIENT_SECRET'),
    githubProxy: process.env['GITHUB_PROXY'] || undefined,
    jwtSecret,
    clientUrl: resolveClientUrl(),
    devMode,
    serverName: process.env['SERVER_NAME'] ?? 'UNO Online',
    serverMotd: process.env['SERVER_MOTD'] ?? '欢迎来到 UNO Online！',
    roomIdleTimeoutMs: integerEnvironment('ROOM_IDLE_TIMEOUT_MS', 7_200_000, { min: 1, max: 2_147_483_647 }),
    runtimeSchemaVersion: runtimeSchemaVersion(),
    turnstileSiteKey: process.env['TURNSTILE_SITE_KEY'] || undefined,
    turnstileSecretKey: process.env['TURNSTILE_SECRET_KEY'] || undefined,
    webauthnRpName: process.env['WEBAUTHN_RP_NAME'] || undefined,
    webauthnRpId: process.env['WEBAUTHN_RP_ID'] || undefined,
    webauthnOrigin: process.env['WEBAUTHN_ORIGIN'] || undefined,
    mumbleIce: loadMumbleIceConfig(),
  };
}
