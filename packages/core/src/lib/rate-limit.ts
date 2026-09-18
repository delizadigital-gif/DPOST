import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { AppError } from './errors';

/**
 * Sliding-window rate limiting in Redis. Each request is a sorted-set entry
 * scored by time; the Lua script trims old entries, counts, and records
 * atomically, so concurrent requests can't exceed the limit.
 */

export interface RateLimitRule {
  limit: number;
  windowMs: number;
  /**
   * What to do if Redis is unavailable. Fail closed for abuse-sensitive
   * buckets (login), open for everything else so a Redis outage doesn't
   * take the whole app down.
   */
  failClosed?: boolean;
}

/** Named buckets (docs/04-api-architecture.md §6.3). */
export const RATE_LIMITS = {
  auth: { limit: 5, windowMs: 15 * 60_000, failClosed: true },
  read: { limit: 300, windowMs: 60_000 },
  mutation: { limit: 60, windowMs: 60_000 },
  ai: { limit: 20, windowMs: 60_000 },
  chat: { limit: 30, windowMs: 5 * 60_000 },
  upload: { limit: 30, windowMs: 60_000 },
  publishNow: { limit: 10, windowMs: 10 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

const SLIDING_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, 0, tonumber(oldest[2]) + window - now}
end
redis.call('ZADD', key, now, ARGV[4])
redis.call('PEXPIRE', key, window)
return {1, limit - count - 1, 0}
`;

export async function checkRateLimit(
  redis: Redis,
  bucket: string,
  identifier: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const key = `ratelimit:${bucket}:${identifier}`;
  const [allowed, remaining, retryAfterMs] = (await redis.eval(
    SLIDING_WINDOW,
    1,
    key,
    now,
    rule.windowMs,
    rule.limit,
    `${now}:${randomUUID()}`,
  )) as [number, number, number];
  return { allowed: allowed === 1, remaining, retryAfterMs: Math.max(0, retryAfterMs) };
}

/**
 * Throws RATE_LIMITED when the identifier is over the bucket's limit.
 * `onRedisError` lets the caller log outages without this module depending
 * on a logger.
 */
export async function enforceRateLimit(
  redis: Redis,
  bucket: RateLimitBucket,
  identifier: string,
  onRedisError?: (error: unknown) => void,
): Promise<RateLimitResult> {
  const rule: RateLimitRule = RATE_LIMITS[bucket];
  let result: RateLimitResult;
  try {
    result = await checkRateLimit(redis, bucket, identifier, rule);
  } catch (error) {
    onRedisError?.(error);
    if (rule.failClosed) {
      throw new AppError('RATE_LIMITED', {
        message: 'This is temporarily unavailable. Please try again in a minute.',
        cause: error,
      });
    }
    return { allowed: true, remaining: rule.limit, retryAfterMs: 0 };
  }
  if (!result.allowed) {
    throw new AppError('RATE_LIMITED', {
      details: { retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000) },
    });
  }
  return result;
}
