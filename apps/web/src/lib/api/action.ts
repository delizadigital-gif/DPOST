import 'server-only';
import { headers } from 'next/headers';
import { z } from 'zod';
import {
  AppError,
  assertCan,
  clientIpFromHeaders,
  createContext,
  enforceRateLimit,
  getRedis,
  newRequestId,
  toPublicError,
  type Context,
  type Permission,
  type RateLimitBucket,
} from '@dpost/core';
import { getCurrentSession } from '@/lib/auth/session';
import { getLogger } from '@/lib/logger';

/**
 * The server-action counterpart of `route()`: authentication, workspace
 * context, permission, rate limit and zod validation in one place, so a form
 * handler can't quietly skip one.
 *
 * Actions return a result object instead of throwing, because a form needs
 * to show the message next to the field rather than replace the page with an
 * error screen. Cross-site protection is Next's own: server actions only
 * accept same-origin POSTs with a valid action ID.
 */

export interface ActionError {
  message: string;
  /** Per-field messages from zod, keyed by field name. */
  fields?: Record<string, string[]>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export function actionError(message: string): ActionResult<never> {
  return { ok: false, error: { message } };
}

interface ActionOptions<S extends z.ZodType | undefined> {
  input?: S;
  permission: Permission;
  rateLimit?: RateLimitBucket;
}

type Input<S> = S extends z.ZodType ? z.output<S> : undefined;

/**
 * Wraps a server action body. Use it inside a `'use server'` module:
 *
 * ```ts
 * export const saveVoice = (values: unknown) =>
 *   action({ input: schema, permission: 'brand:update' }, ({ ctx, input }) => ...);
 * ```
 */
export async function action<T, S extends z.ZodType | undefined = undefined>(
  options: ActionOptions<S>,
  handler: (args: { ctx: Context; input: Input<S> }) => Promise<T> | T,
  rawInput?: unknown,
): Promise<ActionResult<T>> {
  const requestId = newRequestId();
  try {
    const session = await getCurrentSession();
    if (!session) throw new AppError('UNAUTHENTICATED');

    const ip = clientIpFromHeaders(await headers());
    const ctx = await createContext({
      userId: session.userId,
      emailVerified: session.emailVerified,
      workspaceId: session.activeWorkspaceId,
      source: 'web',
      requestId,
      ...(ip ? { ip } : {}),
    });
    assertCan(ctx.role, options.permission);

    await enforceRateLimit(
      getRedis(),
      options.rateLimit ?? 'mutation',
      `user:${ctx.userId}`,
      (error) => getLogger().error({ err: error, requestId }, 'rate limiter unavailable'),
    );

    let input: unknown;
    if (options.input) {
      const parsed = options.input.safeParse(rawInput);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            message: 'Some of the information is missing or invalid.',
            fields: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
          },
        };
      }
      input = parsed.data;
    }

    return { ok: true, data: await handler({ ctx, input: input as Input<S> }) };
  } catch (error) {
    const { status, body } = toPublicError(error, requestId);
    if (status >= 500) getLogger().error({ err: error, requestId }, 'server action failed');
    const fields = body.details?.fields;
    return {
      ok: false,
      error: {
        message: body.message,
        ...(isFieldErrors(fields) ? { fields } : {}),
      },
    };
  }
}

function isFieldErrors(value: unknown): value is Record<string, string[]> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
