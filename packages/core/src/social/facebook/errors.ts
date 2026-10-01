/**
 * Turning a Graph API failure into a decision.
 *
 * Four classes, and each one means something different for the queue:
 *
 * | Class          | Means                          | What the worker does                  |
 * | -------------- | ------------------------------ | ------------------------------------- |
 * | `AUTH`         | the token is no longer good    | stop, mark the channel needs-reconnect |
 * | `RATE_LIMITED` | too many calls for now         | retry later, after the hinted wait     |
 * | `TRANSIENT`    | Facebook had a moment          | retry with backoff                     |
 * | `PERMANENT`    | this post will never be posted | stop, and say why in plain words       |
 *
 * Retrying an `AUTH` failure wastes the user's time and ours; retrying a
 * `TRANSIENT` one is the difference between a post going out and a customer
 * wondering where it went. Codes come from Meta's documented list and are
 * verified against recorded fixtures in `errors.test.ts`.
 */

export type FailureClass = 'AUTH' | 'RATE_LIMITED' | 'TRANSIENT' | 'PERMANENT';

export interface GraphErrorBody {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

export interface ClassifiedFailure {
  class: FailureClass;
  code: string;
  /** Safe to show a user. Never contains a token or a trace id. */
  message: string;
  /** How long to wait before trying again, when the platform hints at it. */
  retryAfterMs?: number;
  /** Meta's trace id, for a support conversation. Logged, never shown. */
  traceId?: string;
}

/** The token is gone, expired, or no longer has the permission we need. */
const AUTH_CODES = new Set([102, 190, 200, 210, 2500]);
/** Documented throttling codes, including the Business Use Case ones. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004]);
/** Facebook's own "try again" codes. */
const TRANSIENT_CODES = new Set([1, 2]);

/**
 * Permission-denied subcodes under code 200 that are about the *user's* role
 * rather than our token, so reconnecting won't help.
 */
const NOT_PAGE_ADMIN_SUBCODES = new Set([1363047]);

const USER_MESSAGES: Record<FailureClass, string> = {
  AUTH: 'Facebook no longer accepts this connection. Reconnect the Page to keep posting.',
  RATE_LIMITED: 'Facebook is limiting how often we can post right now. We will try again shortly.',
  TRANSIENT: 'Facebook did not respond properly. We will try again.',
  PERMANENT: "Facebook refused this post and won't accept it as it is.",
};

/**
 * Meta's `error_user_msg` is written for the person, so it is preferred when
 * present — it says things like "This photo is too large" that we would
 * otherwise have to guess at.
 */
function userFacing(body: GraphErrorBody, fallback: FailureClass): string {
  const fromMeta = body.error_user_msg?.trim();
  if (fromMeta) return fromMeta;
  return USER_MESSAGES[fallback];
}

export function classifyGraphError(
  body: GraphErrorBody | undefined,
  httpStatus: number,
  headers?: Headers,
): ClassifiedFailure {
  const code = body?.code;
  const subcode = body?.error_subcode;
  const traceId = body?.fbtrace_id;
  const identifier = `fb_${code ?? httpStatus}${subcode ? `_${subcode}` : ''}`;

  // A 5xx is Facebook's problem, whatever the body says.
  if (httpStatus >= 500) {
    return {
      class: 'TRANSIENT',
      code: identifier,
      message: USER_MESSAGES.TRANSIENT,
      ...(traceId ? { traceId } : {}),
    };
  }

  if (httpStatus === 429 || (code !== undefined && RATE_LIMIT_CODES.has(code))) {
    const retryAfterMs = retryAfterFromHeaders(headers);
    return {
      class: 'RATE_LIMITED',
      code: identifier,
      message: USER_MESSAGES.RATE_LIMITED,
      ...(retryAfterMs ? { retryAfterMs } : {}),
      ...(traceId ? { traceId } : {}),
    };
  }

  if (code !== undefined && AUTH_CODES.has(code)) {
    // Losing the Page admin role is not something reconnecting fixes, so it
    // is reported as permanent with Meta's own explanation.
    if (code === 200 && subcode !== undefined && NOT_PAGE_ADMIN_SUBCODES.has(subcode)) {
      return {
        class: 'PERMANENT',
        code: identifier,
        message: userFacing(body!, 'PERMANENT'),
        ...(traceId ? { traceId } : {}),
      };
    }
    return {
      class: 'AUTH',
      code: identifier,
      message: userFacing(body ?? {}, 'AUTH'),
      ...(traceId ? { traceId } : {}),
    };
  }

  if (code !== undefined && TRANSIENT_CODES.has(code)) {
    return {
      class: 'TRANSIENT',
      code: identifier,
      message: USER_MESSAGES.TRANSIENT,
      ...(traceId ? { traceId } : {}),
    };
  }

  // Anything else — invalid parameters, content Facebook won't take — is
  // permanent: trying the same request again would fail the same way.
  return {
    class: 'PERMANENT',
    code: identifier,
    message: userFacing(body ?? {}, 'PERMANENT'),
    ...(traceId ? { traceId } : {}),
  };
}

/** Honours `Retry-After` when Facebook sends one, in seconds or as a date. */
function retryAfterFromHeaders(headers?: Headers): number | undefined {
  const value = headers?.get('retry-after');
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

  const when = Date.parse(value);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return undefined;
}

/** True when another attempt could plausibly succeed. */
export function isRetryable(failure: ClassifiedFailure): boolean {
  return failure.class === 'TRANSIENT' || failure.class === 'RATE_LIMITED';
}

/**
 * How full the Page's usage budget is, from Meta's usage headers (0–100).
 * Above about 75 the analytics sync backs off to leave room for publishing.
 */
export function usageFromHeaders(headers: Headers): number | undefined {
  const raw = headers.get('x-business-use-case-usage') ?? headers.get('x-app-usage');
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const values: number[] = [];
    const collect = (entry: Record<string, unknown>) => {
      for (const key of ['call_count', 'total_cputime', 'total_time']) {
        const value = entry[key];
        if (typeof value === 'number') values.push(value);
      }
    };

    for (const value of Object.values(parsed)) {
      if (Array.isArray(value))
        for (const entry of value) collect(entry as Record<string, unknown>);
      else if (value && typeof value === 'object') collect(value as Record<string, unknown>);
    }
    if (typeof parsed.call_count === 'number') collect(parsed);

    return values.length ? Math.max(...values) : undefined;
  } catch {
    return undefined;
  }
}
