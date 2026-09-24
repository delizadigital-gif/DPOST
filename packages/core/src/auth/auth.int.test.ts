import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { disconnectDb, getUnscopedDb } from '@dpost/db';
import { getTestOutbox } from '../email/send';
import { CLIENT_IP_HEADER } from '../lib/http';
import { disconnectRedis } from '../lib/redis';
import { createAuth } from './auth';

/**
 * Authentication flows through Better Auth's real HTTP handler, against the
 * test database. Emails land in the in-memory outbox.
 */
const APP_URL = 'http://localhost:3000';
const auth = createAuth();
const createdEmails: string[] = [];

afterAll(async () => {
  const db = getUnscopedDb();
  const users = await db.user.findMany({ where: { email: { in: createdEmails } } });
  const userIds = users.map((user) => user.id);
  await db.workspace.deleteMany({ where: { members: { some: { userId: { in: userIds } } } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await disconnectDb();
  await disconnectRedis();
});

function uniqueEmail() {
  const email = `auth-${randomUUID()}@example.test`;
  createdEmails.push(email);
  return email;
}

function uniqueIp() {
  const n = () => Math.floor(Math.random() * 254) + 1;
  return `10.${n()}.${n()}.${n()}`;
}

interface CallOptions {
  body?: unknown;
  cookie?: string;
  ip?: string;
  method?: 'GET' | 'POST';
}

async function call(path: string, { body, cookie, ip = uniqueIp(), method }: CallOptions = {}) {
  const url = path.startsWith('http') ? path : `${APP_URL}/api/auth${path}`;
  const headers = new Headers({ origin: APP_URL, [CLIENT_IP_HEADER]: ip });
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  return auth.handler(
    new Request(url, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

/** Turns Set-Cookie response headers into a Cookie request header. */
function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .filter((pair) => pair && !pair.endsWith('='))
    .join('; ');
}

function lastEmailTo(email: string) {
  const message = [...getTestOutbox()].reverse().find((m) => m.to === email);
  if (!message) throw new Error(`no email sent to ${email}`);
  const url = message.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error('email has no link');
  return { message, url };
}

async function signUp(email: string, password = 'correct horse battery') {
  const response = await call('/sign-up/email', { body: { name: 'Rahim Uddin', email, password } });
  return { response, cookie: cookiesFrom(response) };
}

async function sessionUser(cookie: string) {
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  return session?.user ?? null;
}

describe('sign-up', () => {
  it('creates the user, signs them in and gives them a workspace', async () => {
    const email = uniqueEmail();
    const { response, cookie } = await signUp(email);
    expect(response.status).toBe(200);
    expect(await sessionUser(cookie)).toMatchObject({ email, emailVerified: false });

    const user = await getUnscopedDb().user.findUniqueOrThrow({
      where: { email },
      include: { memberships: { include: { workspace: { include: { subscription: true } } } } },
    });
    expect(user.memberships).toHaveLength(1);
    expect(user.memberships[0]?.role).toBe('owner');
    expect(user.memberships[0]?.workspace.name).toBe("Rahim Uddin's workspace");
    expect(user.memberships[0]?.workspace.subscription?.planId).toBe('free');
  });

  it('never stores the password in plain text', async () => {
    const email = uniqueEmail();
    await signUp(email, 'plain-text-check-123');
    const account = await getUnscopedDb().account.findFirstOrThrow({
      where: { user: { email }, providerId: 'credential' },
    });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain('plain-text-check-123');
  });

  it('limits sign-ups per client IP (10 per hour)', async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const response = await call('/sign-up/email', {
        body: { name: 'Bulk', email: uniqueEmail(), password: 'correct horse battery' },
        ip,
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    // Another IP is unaffected.
    const other = await signUp(uniqueEmail());
    expect(other.response.status).toBe(200);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const response = await call('/sign-up/email', {
      body: { name: 'Short', email: uniqueEmail(), password: 'short' },
    });
    expect(response.status).toBe(400);
  });

  it('ignores attempts to set privileged fields', async () => {
    const email = uniqueEmail();
    const response = await call('/sign-up/email', {
      body: { name: 'Sneaky', email, password: 'correct horse battery', platformRole: 'admin' },
    });
    // Better Auth either rejects the unknown field or drops it; it must never apply it.
    const user = await getUnscopedDb().user.findUnique({ where: { email } });
    if (response.status === 200) expect(user?.platformRole).toBe('user');
    else expect(user).toBeNull();
  });
});

describe('email verification', () => {
  it('sends a verification link that confirms the email', async () => {
    const email = uniqueEmail();
    const { cookie } = await signUp(email);
    const { message, url } = lastEmailTo(email);
    expect(message.subject).toMatch(/confirm your email/i);

    const response = await call(url, { cookie });
    expect([200, 302]).toContain(response.status);
    expect(await sessionUser(cookie)).toMatchObject({ emailVerified: true });
  });

  it('rejects a tampered token', async () => {
    const email = uniqueEmail();
    await signUp(email);
    const { url } = lastEmailTo(email);
    await call(url.replace(/token=[^&]+/, 'token=forged'));
    const user = await getUnscopedDb().user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBe(false);
  });
});

describe('sign-in', () => {
  it('signs in with the right password only', async () => {
    const email = uniqueEmail();
    await signUp(email, 'the right password');

    const wrong = await call('/sign-in/email', { body: { email, password: 'the wrong password' } });
    expect(wrong.status).toBe(401);

    const right = await call('/sign-in/email', { body: { email, password: 'the right password' } });
    expect(right.status).toBe(200);
    expect(await sessionUser(cookiesFrom(right))).toMatchObject({ email });
  });

  it('gives the same answer for an unknown email as for a wrong password', async () => {
    const response = await call('/sign-in/email', {
      body: { email: uniqueEmail(), password: 'whatever-password' },
    });
    expect(response.status).toBe(401);
  });

  it('locks an email after 5 attempts, even across different IPs', async () => {
    const email = uniqueEmail();
    await signUp(email, 'the right password');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await call('/sign-in/email', {
        body: { email, password: `guess-${i}-password` },
        ip: uniqueIp(),
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);

    // Even the right password is refused while locked.
    const locked = await call('/sign-in/email', {
      body: { email, password: 'the right password' },
    });
    expect(locked.status).toBe(429);
  });

  it('signs out', async () => {
    const email = uniqueEmail();
    const { cookie } = await signUp(email);
    const response = await call('/sign-out', { body: {}, cookie });
    expect(response.status).toBe(200);
    expect(await sessionUser(cookie)).toBeNull();
  });
});

describe('password reset', () => {
  it('resets the password and signs out every other session', async () => {
    const email = uniqueEmail();
    const { cookie: oldSession } = await signUp(email, 'old password 123');

    const request = await call('/request-password-reset', {
      body: { email, redirectTo: `${APP_URL}/reset-password` },
    });
    expect(request.status).toBe(200);
    const { message, url } = lastEmailTo(email);
    expect(message.subject).toMatch(/reset/i);

    // The emailed link redirects to our reset page with the token.
    const redirect = await call(url);
    const location = new URL(redirect.headers.get('location') ?? '', APP_URL);
    expect(location.pathname).toBe('/reset-password');
    const token = location.searchParams.get('token');
    expect(token).toBeTruthy();

    const reset = await call('/reset-password', {
      body: { token, newPassword: 'new password 456' },
    });
    expect(reset.status).toBe(200);

    expect(await sessionUser(oldSession)).toBeNull();
    expect(
      (await call('/sign-in/email', { body: { email, password: 'old password 123' } })).status,
    ).toBe(401);
    expect(
      (await call('/sign-in/email', { body: { email, password: 'new password 456' } })).status,
    ).toBe(200);

    // The link works once.
    const reuse = await call('/reset-password', {
      body: { token, newPassword: 'third password 789' },
    });
    expect(reuse.status).toBe(400);
  });

  it("doesn't reveal whether an account exists", async () => {
    const before = getTestOutbox().length;
    const response = await call('/request-password-reset', {
      body: { email: uniqueEmail(), redirectTo: `${APP_URL}/reset-password` },
    });
    expect(response.status).toBe(200);
    expect(getTestOutbox().length).toBe(before);
  });
});
