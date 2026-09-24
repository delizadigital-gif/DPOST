import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { getAuthEnv, getServerEnv } from '@dpost/config';
import { getUnscopedDb } from '@dpost/db';
import { sendEmail } from '../email/send';
import { resetPasswordMessage, verifyEmailMessage } from '../email/templates';
import type { Logger } from '../lib/logger';
import { CLIENT_IP_HEADER } from '../lib/http';
import { checkRateLimit, RATE_LIMITS } from '../lib/rate-limit';
import { getRedis } from '../lib/redis';
import { ensurePersonalWorkspace } from '../services/workspace';

export interface CreateAuthOptions {
  /** Framework integrations, e.g. Next.js cookie handling. */
  plugins?: BetterAuthPlugin[];
  logger?: Logger;
}

const DAY = 24 * 60 * 60;

/**
 * Authentication (Better Auth): email + password, email verification,
 * password reset, optional Google sign-in. Sessions are stored in Postgres.
 *
 * Decisions:
 * - Users can sign in before verifying their email, so sign-up friction
 *   stays low. Actions that touch the outside world (connecting Facebook,
 *   publishing) require a verified email; see `assertEmailVerified`.
 * - Passwords use Better Auth's default scrypt hashing (memory-hard, OWASP
 *   recommended). No native module is needed, unlike Argon2.
 * - Emails are sent without awaiting, so response time doesn't reveal
 *   whether an account exists.
 * - Rate limits live in Redis and apply per IP. Sign-in is also limited per
 *   email address, which stops password guessing spread across many IPs.
 */
export function createAuth({ plugins = [], logger }: CreateAuthOptions = {}) {
  const { APP_URL } = getServerEnv();
  const env = getAuthEnv();

  // Sent without awaiting, so response time doesn't reveal whether an account
  // exists. The outcome is logged either way: silent email failures are hard
  // to notice and leave people unable to sign in.
  const send = (message: Parameters<typeof sendEmail>[0], kind: string) => {
    void sendEmail(message)
      .then((result) => {
        if (result.rejected.length > 0) {
          logger?.error(
            { kind, rejected: result.rejected.length },
            'mail server rejected recipient',
          );
        } else {
          logger?.info(
            { kind, messageId: result.messageId, response: result.response },
            'email sent',
          );
        }
      })
      .catch((error: unknown) => logger?.error({ err: error, kind }, 'failed to send email'));
  };

  return betterAuth({
    appName: 'DPOST',
    baseURL: APP_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [APP_URL],
    database: prismaAdapter(getUnscopedDb(), { provider: 'postgresql' }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        send(resetPasswordMessage(user.email, user.name, url), 'reset-password');
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: DAY,
      sendVerificationEmail: async ({ user, url }) => {
        send(verifyEmailMessage(user.email, user.name, url), 'verify-email');
      },
    },

    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},

    account: {
      // Tokens from "Continue with Google" are stored encrypted. We only use
      // Google to sign in, but a leaked backup must not expose live tokens.
      encryptOAuthTokens: true,
    },

    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
      additionalFields: {
        activeWorkspaceId: { type: 'string', required: false, input: false },
      },
    },

    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 15 * 60, max: 20 },
        '/sign-up/email': { window: 60 * 60, max: 10 },
        '/request-password-reset': { window: 15 * 60, max: 5 },
        '/send-verification-email': { window: 15 * 60, max: 5 },
      },
      customStorage: {
        consume: async (key, rule) => {
          const result = await checkRateLimit(getRedis(), 'auth-ip', key, {
            limit: rule.max,
            windowMs: rule.window * 1000,
          });
          return {
            allowed: result.allowed,
            retryAfter: result.allowed ? null : Math.ceil(result.retryAfterMs / 1000),
          };
        },
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/email') return;
        const email =
          typeof ctx.body?.email === 'string' ? ctx.body.email.trim().toLowerCase() : '';
        if (!email) return;
        const result = await checkRateLimit(
          getRedis(),
          'auth-email',
          email,
          RATE_LIMITS.auth,
        ).catch((error: unknown) => {
          logger?.error({ err: error }, 'sign-in rate limiter unavailable');
          // Fail closed: guessing protection matters more than availability here.
          return { allowed: false, remaining: 0, retryAfterMs: 60_000 };
        });
        if (!result.allowed) {
          throw new APIError('TOO_MANY_REQUESTS', {
            message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
          });
        }
      }),
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Every account starts with its own workspace. If this fails,
            // the app shell retries it on first load (ensurePersonalWorkspace
            // is idempotent), so sign-up itself never breaks.
            await ensurePersonalWorkspace(user.id, user.name).catch((error: unknown) =>
              logger?.error({ err: error, userId: user.id }, 'failed to create workspace'),
            );
          },
        },
      },
    },

    advanced: {
      // The web app sets this header from X-Forwarded-For using our own rule
      // (see withClientIpHeader), so there is one definition of the client IP.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },

    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
