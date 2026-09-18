import { afterAll, describe, expect, it } from 'vitest';
import { disconnectDb } from '@dpost/db';
import { disconnectRedis } from '@dpost/core';
import { GET } from './route';

afterAll(async () => {
  await disconnectDb();
  await disconnectRedis();
});

describe('GET /api/health', () => {
  it('reports ok when the database and Redis are reachable', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      status: 'ok',
      version: expect.any(String),
      checks: { database: 'ok', redis: 'ok' },
    });
  });

  it('exposes status only, no configuration', async () => {
    const body = await (await GET()).json();
    expect(Object.keys(body).sort()).toEqual(['checks', 'status', 'uptimeSeconds', 'version']);
    expect(JSON.stringify(body)).not.toMatch(/postgres|redis:\/\//i);
  });
});
