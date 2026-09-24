import 'server-only';
import { z } from 'zod';
import { getServerEnv } from '@dpost/config';
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
import { getSession } from '@/lib/auth/session';
import { getLogger } from '@/lib/logger';

/**
 * The one way to write an API route. Every handler gets, in order:
 * request ID → same-origin check (mutations) → authentication → workspace
 * membership → permission → rate limit → input validation → handler →
 * consistent JSON errors. A route can't forget a step because it can't
 * opt out of the wrapper.
 */

type Schema = z.ZodType | undefined;
type Infer<S extends Schema> = S extends z.ZodType ? z.output<S> : undefined;
type Params = Record<string, string | string[] | undefined>;

interface BaseOptions<B extends Schema, Q extends Schema> {
  body?: B;
  query?: Q;
  rateLimit?: RateLimitBucket;
}

interface PublicOptions<B extends Schema, Q extends Schema> extends BaseOptions<B, Q> {
  auth: 'public';
}

interface MemberOptions<B extends Schema, Q extends Schema> extends BaseOptions<B, Q> {
  auth: 'member';
  permission: Permission;
}

interface HandlerInput<B extends Schema, Q extends Schema> {
  request: Request;
  requestId: string;
  params: Params;
  body: Infer<B>;
  query: Infer<Q>;
}

type PublicHandler<B extends Schema, Q extends Schema> = (
  input: HandlerInput<B, Q>,
) => Promise<unknown> | unknown;
type MemberHandler<B extends Schema, Q extends Schema> = (
  input: HandlerInput<B, Q> & { ctx: Context },
) => Promise<unknown> | unknown;

type RouteHandler = (request: Request, context: { params: Promise<Params> }) => Promise<Response>;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function route<B extends Schema = undefined, Q extends Schema = undefined>(
  options: PublicOptions<B, Q>,
  handler: PublicHandler<B, Q>,
): RouteHandler;
export function route<B extends Schema = undefined, Q extends Schema = undefined>(
  options: MemberOptions<B, Q>,
  handler: MemberHandler<B, Q>,
): RouteHandler;
export function route<B extends Schema, Q extends Schema>(
  options: PublicOptions<B, Q> | MemberOptions<B, Q>,
  handler: PublicHandler<B, Q> | MemberHandler<B, Q>,
): RouteHandler {
  return async (request, routeContext) => {
    const requestId = newRequestId();
    try {
      assertSameOrigin(request);
      const ip = clientIpFromHeaders(request.headers);

      let ctx: Context | undefined;
      if (options.auth === 'member') {
        const session = await getSession(request);
        if (!session) throw new AppError('UNAUTHENTICATED');
        ctx = await createContext({
          userId: session.userId,
          emailVerified: session.emailVerified,
          workspaceId: session.activeWorkspaceId,
          source: 'web',
          requestId,
          ...(ip ? { ip } : {}),
        });
        assertCan(ctx.role, options.permission);
      }

      if (options.rateLimit) {
        const identifier = ctx ? `user:${ctx.userId}` : `ip:${ip ?? 'unknown'}`;
        await enforceRateLimit(getRedis(), options.rateLimit, identifier, (error) =>
          getLogger().error({ err: error, requestId }, 'rate limiter unavailable'),
        );
      }

      const input = {
        request,
        requestId,
        params: await routeContext.params,
        body: (await parseBody(request, options.body)) as Infer<B>,
        query: parseQuery(request, options.query) as Infer<Q>,
      };
      const result = ctx
        ? await (handler as MemberHandler<B, Q>)({ ...input, ctx })
        : await (handler as PublicHandler<B, Q>)(input);

      const response = result instanceof Response ? result : Response.json(result ?? null);
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (error) {
      return errorResponse(error, requestId, request);
    }
  };
}

/**
 * Rejects cross-site mutations (CSRF). Browsers always send `Origin` on
 * cross-origin POST/PUT/PATCH/DELETE, so a mismatch means another site is
 * trying to act with the user's cookies. Requests without `Origin` are
 * non-browser clients, which can't carry the user's cookies by accident.
 */
function assertSameOrigin(request: Request) {
  if (!MUTATING_METHODS.has(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(getServerEnv().APP_URL).origin) {
    throw new AppError('FORBIDDEN', { message: 'Cross-site requests are not allowed.' });
  }
}

function validationError(error: z.ZodError): AppError {
  return new AppError('VALIDATION', {
    details: { fields: z.flattenError(error).fieldErrors },
  });
}

async function parseBody(request: Request, schema: Schema): Promise<unknown> {
  if (!schema) return undefined;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new AppError('VALIDATION', { message: 'The request body must be valid JSON.' });
  }
  const result = schema.safeParse(json);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function parseQuery(request: Request, schema: Schema): unknown {
  if (!schema) return undefined;
  const result = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function errorResponse(error: unknown, requestId: string, request: Request): Response {
  const { status, body } = toPublicError(error, requestId);
  if (status >= 500) {
    getLogger().error(
      { err: error, requestId, method: request.method, path: new URL(request.url).pathname },
      'request failed',
    );
  }
  const headers = new Headers({ 'x-request-id': requestId });
  const retryAfter = body.details?.retryAfterSeconds;
  if (status === 429 && typeof retryAfter === 'number') headers.set('retry-after', `${retryAfter}`);
  return Response.json({ error: body }, { status, headers });
}
