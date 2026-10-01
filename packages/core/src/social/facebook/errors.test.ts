import { describe, expect, it } from 'vitest';
import { classifyGraphError, isRetryable, usageFromHeaders } from './errors';

/**
 * The classification decides whether a post is tried again or given up on,
 * so each documented Graph code is pinned here. The bodies are shaped like
 * Meta's real responses.
 */

const graph = (code: number, extra: Record<string, unknown> = {}) => ({
  message: 'Something from Facebook',
  type: 'OAuthException',
  code,
  fbtrace_id: 'AbCdEf123',
  ...extra,
});

describe('tokens that stopped working', () => {
  it('treats an expired token as authentication, not a failure to retry', () => {
    const failure = classifyGraphError(graph(190), 400);
    expect(failure.class).toBe('AUTH');
    expect(isRetryable(failure)).toBe(false);
    expect(failure.message).toMatch(/Reconnect the Page/);
  });

  it('treats a revoked permission the same way', () => {
    expect(classifyGraphError(graph(200), 403).class).toBe('AUTH');
    expect(classifyGraphError(graph(102), 400).class).toBe('AUTH');
  });

  it('does not promise a reconnect will help when the role is gone', () => {
    // Losing the Page admin role is not something reconnecting repairs.
    const failure = classifyGraphError(
      graph(200, {
        error_subcode: 1363047,
        error_user_msg: 'You are no longer an admin of this Page.',
      }),
      403,
    );
    expect(failure.class).toBe('PERMANENT');
    expect(failure.message).toBe('You are no longer an admin of this Page.');
  });
});

describe('being throttled', () => {
  it('recognises the documented rate-limit codes', () => {
    for (const code of [4, 17, 32, 613, 80001]) {
      expect(classifyGraphError(graph(code), 400).class, `code ${code}`).toBe('RATE_LIMITED');
    }
  });

  it('recognises an HTTP 429 even with no code', () => {
    expect(classifyGraphError(undefined, 429).class).toBe('RATE_LIMITED');
  });

  it('waits as long as Facebook asks', () => {
    const failure = classifyGraphError(graph(4), 400, new Headers({ 'retry-after': '120' }));
    expect(failure.retryAfterMs).toBe(120_000);
  });

  it('understands a date in Retry-After too', () => {
    const when = new Date(Date.now() + 60_000).toUTCString();
    const failure = classifyGraphError(graph(4), 400, new Headers({ 'retry-after': when }));
    expect(failure.retryAfterMs).toBeGreaterThan(50_000);
    expect(failure.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('is worth retrying', () => {
    expect(isRetryable(classifyGraphError(graph(32), 400))).toBe(true);
  });
});

describe('Facebook having a moment', () => {
  it('treats any 5xx as temporary, whatever the body says', () => {
    expect(classifyGraphError(graph(100), 500).class).toBe('TRANSIENT');
    expect(classifyGraphError(undefined, 503).class).toBe('TRANSIENT');
  });

  it('treats the documented temporary codes as temporary', () => {
    expect(classifyGraphError(graph(1), 400).class).toBe('TRANSIENT');
    expect(classifyGraphError(graph(2), 400).class).toBe('TRANSIENT');
  });
});

describe('posts Facebook will never accept', () => {
  it('does not retry an invalid parameter', () => {
    const failure = classifyGraphError(graph(100), 400);
    expect(failure.class).toBe('PERMANENT');
    expect(isRetryable(failure)).toBe(false);
  });

  it('prefers Facebook’s own explanation when there is one', () => {
    const failure = classifyGraphError(
      graph(100, { error_user_msg: 'The photo is larger than 4 MB.' }),
      400,
    );
    expect(failure.message).toBe('The photo is larger than 4 MB.');
  });

  it('falls back to plain words when there is not', () => {
    expect(classifyGraphError(graph(100), 400).message).toMatch(/refused this post/);
  });
});

describe('what the classification carries', () => {
  it('keeps the trace id for support, out of the user-facing message', () => {
    const failure = classifyGraphError(graph(190), 400);
    expect(failure.traceId).toBe('AbCdEf123');
    expect(failure.message).not.toContain('AbCdEf123');
  });

  it('names the code and subcode, so two failures can be told apart', () => {
    expect(classifyGraphError(graph(190), 400).code).toBe('fb_190');
    expect(classifyGraphError(graph(200, { error_subcode: 1363047 }), 403).code).toBe(
      'fb_200_1363047',
    );
  });
});

describe('usage headers', () => {
  it('reads the highest number from the business use case header', () => {
    const headers = new Headers({
      'x-business-use-case-usage':
        '{"1234567":[{"type":"pages","call_count":23,"total_cputime":9,"total_time":77}]}',
    });
    expect(usageFromHeaders(headers)).toBe(77);
  });

  it('reads the app-level header too', () => {
    const headers = new Headers({
      'x-app-usage': '{"call_count":12,"total_cputime":3,"total_time":5}',
    });
    expect(usageFromHeaders(headers)).toBe(12);
  });

  it('says nothing rather than guessing when the header is missing or broken', () => {
    expect(usageFromHeaders(new Headers())).toBeUndefined();
    expect(usageFromHeaders(new Headers({ 'x-app-usage': 'not json' }))).toBeUndefined();
  });
});
