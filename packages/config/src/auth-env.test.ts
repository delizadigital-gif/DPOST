import { describe, expect, it } from 'vitest';
import { parseAuthEnv } from './auth-env';

const secret = 'x'.repeat(32);

describe('parseAuthEnv', () => {
  it('requires a long secret', () => {
    expect(() => parseAuthEnv({})).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => parseAuthEnv({ BETTER_AUTH_SECRET: 'short' })).toThrow(/at least 32/);
    expect(parseAuthEnv({ BETTER_AUTH_SECRET: secret }).EMAIL_FROM).toContain('DPOST');
  });

  it('requires Google credentials as a pair', () => {
    expect(() => parseAuthEnv({ BETTER_AUTH_SECRET: secret, GOOGLE_CLIENT_ID: 'id' })).toThrow(
      /GOOGLE_CLIENT_SECRET/,
    );
    expect(
      parseAuthEnv({
        BETTER_AUTH_SECRET: secret,
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 's',
      }).GOOGLE_CLIENT_ID,
    ).toBe('id');
  });

  it('requires a public contact email in production', () => {
    const production = {
      BETTER_AUTH_SECRET: secret,
      NODE_ENV: 'production',
      SMTP_URL: 'smtp://x:1',
    };
    expect(() => parseAuthEnv(production)).toThrow(/CONTACT_EMAIL/);
    expect(() => parseAuthEnv({ ...production, CONTACT_EMAIL: 'hello@example.com' })).not.toThrow();
  });

  it('allows production without email only when explicitly opted in', () => {
    const staging = {
      BETTER_AUTH_SECRET: secret,
      NODE_ENV: 'production',
      CONTACT_EMAIL: 'hello@example.com',
    };
    expect(() => parseAuthEnv(staging)).toThrow(/SMTP_URL/);
    const env = parseAuthEnv({ ...staging, ALLOW_MISSING_SMTP: 'true' });
    expect(env.ALLOW_MISSING_SMTP).toBe(true);
    expect(env.SMTP_URL).toBeUndefined();
    // Anything other than "true" keeps the guard on.
    expect(() => parseAuthEnv({ ...staging, ALLOW_MISSING_SMTP: 'yes' })).toThrow(
      /ALLOW_MISSING_SMTP/,
    );
  });

  it('requires an SMTP server in production only', () => {
    expect(() => parseAuthEnv({ BETTER_AUTH_SECRET: secret, NODE_ENV: 'production' })).toThrow(
      /SMTP_URL/,
    );
    expect(() =>
      parseAuthEnv({ BETTER_AUTH_SECRET: secret, NODE_ENV: 'development' }),
    ).not.toThrow();
  });

  it('never echoes the secret in errors', () => {
    const leaky = 'short-but-secret';
    try {
      parseAuthEnv({ BETTER_AUTH_SECRET: leaky });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(leaky);
    }
  });
});
