import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { checkRateLimit, enforceRateLimit } from './rate-limit';
import { getServerEnv } from '@dpost/config';
import { createRedis, disconnectRedis, getRedis } from './redis';

const rule = { limit: 3, windowMs: 60_000 };
const id = () => `test:${randomUUID()}`;

afterAll(async () => {
  await disconnectRedis();
});

describe('checkRateLimit', () => {
  it('allows up to the limit, then blocks with a retry time', async () => {
    const who = id();
    const now = Date.now();
    const results = [];
    for (let i = 0; i < 4; i++)
      results.push(await checkRateLimit(getRedis(), 't', who, rule, now + i));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3]?.retryAfterMs).toBeGreaterThan(59_000);
  });

  it('frees capacity as the window slides', async () => {
    const who = id();
    const start = Date.now();
    for (let i = 0; i < 3; i++) await checkRateLimit(getRedis(), 't', who, rule, start);
    expect((await checkRateLimit(getRedis(), 't', who, rule, start + 30_000)).allowed).toBe(false);
    expect((await checkRateLimit(getRedis(), 't', who, rule, start + 60_001)).allowed).toBe(true);
  });

  it('tracks identifiers and buckets independently', async () => {
    const who = id();
    const now = Date.now();
    for (let i = 0; i < 3; i++) await checkRateLimit(getRedis(), 'a', who, rule, now);
    expect((await checkRateLimit(getRedis(), 'a', id(), rule, now)).allowed).toBe(true);
    expect((await checkRateLimit(getRedis(), 'b', who, rule, now)).allowed).toBe(true);
  });

  it('never lets concurrent requests exceed the limit', async () => {
    const who = id();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => checkRateLimit(getRedis(), 't', who, rule)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });
});

describe('enforceRateLimit', () => {
  it('throws RATE_LIMITED with a retry hint once over the limit', async () => {
    const who = id();
    for (let i = 0; i < 5; i++) await enforceRateLimit(getRedis(), 'auth', who);
    const error = await enforceRateLimit(getRedis(), 'auth', who).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('RATE_LIMITED');
    expect((error as AppError).details?.retryAfterSeconds).toBeGreaterThan(0);
  });

  describe('when Redis is unreachable', () => {
    const broken = createRedis('redis://127.0.0.1:1');
    afterAll(() => broken.disconnect());

    it('fails open for ordinary buckets, quickly', async () => {
      const errors: unknown[] = [];
      const started = Date.now();
      const result = await enforceRateLimit(broken, 'read', id(), (e) => errors.push(e));
      expect(result.allowed).toBe(true);
      expect(errors).toHaveLength(1);
      // An outage must not hang requests.
      expect(Date.now() - started).toBeLessThan(3_000);
    });

    it('works on the very first command after connecting', async () => {
      const fresh = createRedis(getServerEnv().REDIS_URL);
      try {
        expect((await checkRateLimit(fresh, 't', id(), rule)).allowed).toBe(true);
      } finally {
        fresh.disconnect();
      }
    });

    it('fails closed for login attempts', async () => {
      await expect(enforceRateLimit(broken, 'auth', id())).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
    });
  });
});
