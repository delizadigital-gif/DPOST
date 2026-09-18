import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseServerEnv } from './env';

const required = {
  DATABASE_URL: 'postgresql://dpost:dpost@localhost:5432/dpost',
  REDIS_URL: 'redis://localhost:6379',
};

const key = () => randomBytes(32).toString('base64');

describe('parseServerEnv', () => {
  it('applies defaults when only required values are set', () => {
    const env = parseServerEnv(required);
    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_URL).toBe('http://localhost:3000');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.TOKEN_ENCRYPTION_KEYS).toBeUndefined();
  });

  it('requires the database and Redis URLs', () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseServerEnv({})).toThrow(/REDIS_URL/);
  });

  it('treats empty strings as unset', () => {
    const env = parseServerEnv({ ...required, LOG_LEVEL: '', SENTRY_DSN: '' });
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('rejects malformed values and names the variable', () => {
    expect(() => parseServerEnv({ ...required, APP_URL: 'not-a-url' })).toThrow(EnvValidationError);
    expect(() => parseServerEnv({ ...required, APP_URL: 'not-a-url' })).toThrow(/APP_URL/);
    expect(() => parseServerEnv({ ...required, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('never echoes secret values in the error message', () => {
    const secret = 'postgres-password-should-not-leak';
    try {
      parseServerEnv({ ...required, DATABASE_URL: secret });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(secret);
    }
  });

  describe('token encryption keys', () => {
    it('parses versioned keys', () => {
      const env = parseServerEnv({
        ...required,
        TOKEN_ENCRYPTION_KEYS: `1:${key()},2:${key()}`,
        TOKEN_ENCRYPTION_KEY_VERSION: '2',
      });
      expect([...(env.TOKEN_ENCRYPTION_KEYS?.keys() ?? [])]).toEqual([1, 2]);
      expect(env.TOKEN_ENCRYPTION_KEYS?.get(2)).toHaveLength(32);
      expect(env.TOKEN_ENCRYPTION_KEY_VERSION).toBe(2);
    });

    it('rejects keys that are not 32 bytes', () => {
      const short = randomBytes(16).toString('base64');
      expect(() =>
        parseServerEnv({
          ...required,
          TOKEN_ENCRYPTION_KEYS: `1:${short}`,
          TOKEN_ENCRYPTION_KEY_VERSION: '1',
        }),
      ).toThrow(/TOKEN_ENCRYPTION_KEYS/);
    });

    it('requires the current version to exist', () => {
      expect(() =>
        parseServerEnv({
          ...required,
          TOKEN_ENCRYPTION_KEYS: `1:${key()}`,
          TOKEN_ENCRYPTION_KEY_VERSION: '2',
        }),
      ).toThrow(/no key with this version/);
    });

    it('requires keys and version together', () => {
      expect(() => parseServerEnv({ ...required, TOKEN_ENCRYPTION_KEYS: `1:${key()}` })).toThrow(
        /TOKEN_ENCRYPTION_KEY_VERSION/,
      );
    });
  });
});
