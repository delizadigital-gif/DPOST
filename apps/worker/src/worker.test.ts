import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '@dpost/core';
import { HEARTBEAT_KEY, startWorker } from './worker';

function fakeLogger() {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn() } as unknown as Logger & {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
}

describe('startWorker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes an expiring heartbeat immediately and on every interval', async () => {
    vi.useFakeTimers();
    const redis = { set: vi.fn().mockResolvedValue('OK') };
    const worker = startWorker({ logger: fakeLogger(), redis, heartbeatIntervalMs: 1_000 });

    await vi.advanceTimersByTimeAsync(3_000);
    expect(redis.set).toHaveBeenCalledTimes(4);
    expect(redis.set).toHaveBeenLastCalledWith(HEARTBEAT_KEY, expect.any(String), 'EX', 3);

    await worker.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(redis.set).toHaveBeenCalledTimes(4);
  });

  it('keeps running when Redis is unavailable', async () => {
    vi.useFakeTimers();
    const logger = fakeLogger();
    const redis = { set: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const worker = startWorker({ logger, redis, heartbeatIntervalMs: 1_000 });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(redis.set).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(3);
    await worker.stop();
  });
});
