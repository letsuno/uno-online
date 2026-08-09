import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

function setProductionEnvironment(jwtSecret: string): void {
  vi.stubEnv('DEV_MODE', 'false');
  vi.stubEnv('JWT_SECRET', jwtSecret);
  vi.stubEnv('GITHUB_CLIENT_ID', 'client-id');
  vi.stubEnv('GITHUB_CLIENT_SECRET', 'client-secret');
  vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
}

describe('server security configuration', () => {
  it('rejects documented placeholder secrets in production', () => {
    setProductionEnvironment('please-change-this-to-a-random-string-at-least-32-chars');
    expect(() => loadConfig()).toThrow('unique random string of at least 32 characters');
  });

  it('rejects short secrets in production', () => {
    setProductionEnvironment('short-secret');
    expect(() => loadConfig()).toThrow('unique random string of at least 32 characters');
  });

  it('accepts a strong production secret and keeps development mode disabled', () => {
    setProductionEnvironment('test-only-random-production-secret-1234567890');
    expect(loadConfig()).toMatchObject({
      devMode: false,
      jwtSecret: 'test-only-random-production-secret-1234567890',
    });
  });

  it('allows a short secret only in explicit development mode', () => {
    vi.stubEnv('DEV_MODE', 'true');
    vi.stubEnv('JWT_SECRET', 'dev-secret');
    expect(loadConfig()).toMatchObject({ devMode: true, jwtSecret: 'dev-secret' });
  });

  it('requires Redis in production so active games can survive a process restart', () => {
    setProductionEnvironment('test-only-random-production-secret-1234567890');
    vi.stubEnv('REDIS_URL', '');
    expect(() => loadConfig()).toThrow('REDIS_URL');
  });

  it('defaults to runtime schema generation 1', () => {
    vi.stubEnv('DEV_MODE', 'true');
    vi.stubEnv('JWT_SECRET', 'dev-secret');
    expect(loadConfig()).toMatchObject({ runtimeSchemaVersion: '1' });
  });

  it('rejects runtime schema versions containing key-pattern characters', () => {
    vi.stubEnv('DEV_MODE', 'true');
    vi.stubEnv('JWT_SECRET', 'dev-secret');
    vi.stubEnv('RUNTIME_SCHEMA_VERSION', '2:*');
    expect(() => loadConfig()).toThrow('RUNTIME_SCHEMA_VERSION');
  });

  it.each([
    ['PORT', '3001oops'],
    ['ROOM_IDLE_TIMEOUT_MS', 'not-a-duration'],
    ['MUMBLE_ICE_PORT', '6502.5'],
    ['MUMBLE_ICE_SERVER_ID', '-1'],
    ['MUMBLE_ICE_PARENT_CHANNEL_ID', '2147483648'],
  ])('rejects an invalid integer environment value for %s', (name, value) => {
    vi.stubEnv('DEV_MODE', 'true');
    vi.stubEnv('JWT_SECRET', 'dev-secret');
    vi.stubEnv(name, value);
    expect(() => loadConfig()).toThrow(name);
  });

  it.each([
    ['DEV_MODE', 'yes'],
    ['MUMBLE_ICE_ENABLED', '1'],
  ])('rejects an invalid boolean environment value for %s', (name, value) => {
    vi.stubEnv('DEV_MODE', 'true');
    vi.stubEnv('JWT_SECRET', 'dev-secret');
    vi.stubEnv(name, value);
    expect(() => loadConfig()).toThrow(name);
  });
});
