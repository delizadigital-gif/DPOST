import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { disconnectDb } from '@dpost/db';
import { AppError, disconnectRedis } from '@dpost/core';
import { createTestWorld } from '@dpost/core/testing';
import type { SessionInfo } from '@/lib/auth/session';

// Authentication arrives in Phase 3; here the session is controlled by the test.
let session: SessionInfo | null = null;
vi.mock('@/lib/auth/session', () => ({ getSession: async () => session }));

const { route } = await import('./route');
const { GET: getMeRoute } = await import('@/app/api/v1/me/route');

const world = createTestWorld();
let owner: { id: string };
let viewer: { id: string };
let workspaceId: string;
let otherWorkspaceId: string;

beforeAll(async () => {
  owner = await world.createUser('Owner');
  viewer = await world.createUser('Viewer');
  workspaceId = (await world.createWorkspace({ owner })).id;
  otherWorkspaceId = (await world.createWorkspace()).id;
  await world.addMember(workspaceId, viewer.id, 'viewer');
});

beforeEach(() => {
  session = null;
});

afterAll(async () => {
  await world.cleanup();
  await disconnectDb();
  await disconnectRedis();
});

const noParams = { params: Promise.resolve({}) };

function request(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost:3000${path}`, init);
}

async function call(handler: ReturnType<typeof route>, req: Request) {
  const response = await handler(req, noParams);
  return { response, body: await response.json() };
}

describe('GET /api/v1/me', () => {
  it('rejects anonymous requests with 401', async () => {
    const { response, body } = await call(getMeRoute, request('/api/v1/me'));
    expect(response.status).toBe(401);
    expect(body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
  });

  it("returns the member's profile, workspace and plan", async () => {
    session = { userId: owner.id, activeWorkspaceId: workspaceId };
    const { response, body } = await call(getMeRoute, request('/api/v1/me'));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toMatch(/^req_/);
    expect(body).toMatchObject({
      user: { id: owner.id },
      workspace: { id: workspaceId },
      role: 'owner',
      plan: { id: 'free' },
    });
  });

  it("refuses a session pointing at someone else's workspace", async () => {
    session = { userId: owner.id, activeWorkspaceId: otherWorkspaceId };
    const { response, body } = await call(getMeRoute, request('/api/v1/me'));
    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

describe('route() wrapper', () => {
  const echo = route(
    {
      auth: 'member',
      permission: 'post:create',
      body: z.object({ title: z.string().min(1), count: z.number().int().positive() }),
    },
    ({ ctx, body }) => ({ workspaceId: ctx.workspaceId, body }),
  );
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    request('/api/v1/echo', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
    });

  it('passes validated input and the context to the handler', async () => {
    session = { userId: owner.id, activeWorkspaceId: workspaceId };
    const { response, body } = await call(echo, post({ title: 'Eid offer', count: 2 }));
    expect(response.status).toBe(200);
    expect(body).toEqual({ workspaceId, body: { title: 'Eid offer', count: 2 } });
  });

  it('enforces the permission for the member’s role', async () => {
    session = { userId: viewer.id, activeWorkspaceId: workspaceId };
    const { response, body } = await call(echo, post({ title: 'x', count: 1 }));
    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns field-level validation errors', async () => {
    session = { userId: owner.id, activeWorkspaceId: workspaceId };
    const { response, body } = await call(echo, post({ title: '', count: -1 }));
    expect(response.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION');
    expect(Object.keys(body.error.details.fields).sort()).toEqual(['count', 'title']);
  });

  it('rejects malformed JSON', async () => {
    session = { userId: owner.id, activeWorkspaceId: workspaceId };
    const { response } = await call(echo, post('{not json'));
    expect(response.status).toBe(422);
  });

  it('blocks cross-site mutations (CSRF)', async () => {
    session = { userId: owner.id, activeWorkspaceId: workspaceId };
    const { response } = await call(
      echo,
      post({ title: 'x', count: 1 }, { origin: 'https://evil.example' }),
    );
    expect(response.status).toBe(403);
  });

  it('allows same-origin mutations', async () => {
    session = { userId: owner.id, activeWorkspaceId: workspaceId };
    const { response } = await call(
      echo,
      post({ title: 'x', count: 1 }, { origin: 'http://localhost:3000' }),
    );
    expect(response.status).toBe(200);
  });

  it('never leaks internal error details', async () => {
    const failing = route({ auth: 'public' }, () => {
      throw new Error('connect ECONNREFUSED postgres://admin:hunter2@db');
    });
    const { response, body } = await call(failing, request('/x'));
    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body.error).toMatchObject({
      code: 'INTERNAL',
      requestId: expect.stringMatching(/^req_/),
    });
  });

  it('passes through AppErrors with their status', async () => {
    const quota = route({ auth: 'public' }, () => {
      throw new AppError('QUOTA_EXCEEDED', { message: "You've used all 30 AI posts this month." });
    });
    const { response, body } = await call(quota, request('/x'));
    expect(response.status).toBe(402);
    expect(body.error.message).toBe("You've used all 30 AI posts this month.");
  });

  it('rate limits by client IP on public routes, with Retry-After', async () => {
    const login = route({ auth: 'public', rateLimit: 'auth' }, () => ({ ok: true }));
    const ip = `198.51.100.${Math.floor(Math.random() * 250)}-${Date.now()}`;
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await login(request('/login', { headers: { 'x-forwarded-for': ip } }), noParams);
      statuses.push(last.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(Number(last?.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
