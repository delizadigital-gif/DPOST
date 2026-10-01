import { createHmac } from 'node:crypto';
import { getMetaEnv } from '@dpost/config';
import {
  classifyGraphError,
  usageFromHeaders,
  type ClassifiedFailure,
  type GraphErrorBody,
} from './errors';

/**
 * The one place that talks to the Graph API.
 *
 * Two rules it exists to keep:
 * - **A token never reaches a log or a URL.** It goes in the
 *   `Authorization` header, and `GraphError` carries only the classified
 *   failure, never the request it came from.
 * - **Every failure is classified** before it leaves here, so callers decide
 *   what to do from one small vocabulary instead of reading Meta's codes.
 */

export class GraphError extends Error {
  constructor(
    readonly failure: ClassifiedFailure,
    readonly httpStatus: number,
  ) {
    super(`Graph API ${failure.class} (${failure.code})`);
    this.name = 'GraphError';
  }
}

export interface GraphRequest {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  token: string;
  /** Query parameters for GET, form fields for POST. */
  params?: Record<string, string | number | boolean | undefined>;
  /** Replaced in tests; defaults to the platform `fetch`. */
  fetchImpl?: typeof fetch;
  graphVersion?: string;
  appSecret?: string;
  timeoutMs?: number;
}

export interface GraphResponse<T> {
  data: T;
  /** The Page's usage of its call budget, 0–100, when Meta reports it. */
  usagePercent?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Meta's defence against a stolen token: every call is signed with the app
 * secret, so a token lifted from a client is useless without it.
 */
export function appSecretProof(token: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(token).digest('hex');
}

export async function graphRequest<T>(request: GraphRequest): Promise<GraphResponse<T>> {
  const env = safeMetaEnv();
  const version = request.graphVersion ?? env.version;
  const appSecret = request.appSecret ?? env.appSecret;
  const fetchImpl = request.fetchImpl ?? fetch;
  const method = request.method ?? 'GET';

  const url = new URL(`https://graph.facebook.com/${version}/${request.path.replace(/^\//u, '')}`);
  const fields = new URLSearchParams();
  for (const [key, value] of Object.entries(request.params ?? {})) {
    if (value === undefined) continue;
    if (method === 'GET' || method === 'DELETE') url.searchParams.set(key, String(value));
    else fields.set(key, String(value));
  }
  if (appSecret) {
    const proof = appSecretProof(request.token, appSecret);
    if (method === 'GET' || method === 'DELETE') url.searchParams.set('appsecret_proof', proof);
    else fields.set('appsecret_proof', proof);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method,
      // The token travels in the header, never in the URL: query strings end
      // up in proxy logs and browser history.
      headers: {
        authorization: `Bearer ${request.token}`,
        ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(method === 'POST' ? { body: fields.toString() } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    // A timeout or a dropped connection is worth another attempt.
    throw new GraphError(
      {
        class: 'TRANSIENT',
        code: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network',
        message: 'Facebook did not respond. We will try again.',
      },
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const body = (payload as { error?: GraphErrorBody }).error;
    throw new GraphError(
      classifyGraphError(body, response.status, response.headers),
      response.status,
    );
  }

  const usagePercent = usageFromHeaders(response.headers);
  return {
    data: payload as T,
    ...(usagePercent === undefined ? {} : { usagePercent }),
  };
}

/** Reads the Meta settings without throwing when they aren't configured. */
function safeMetaEnv(): { version: string; appSecret?: string } {
  try {
    const env = getMetaEnv();
    return {
      version: env.META_GRAPH_VERSION,
      ...(env.META_APP_SECRET ? { appSecret: env.META_APP_SECRET } : {}),
    };
  } catch {
    return { version: 'v23.0' };
  }
}
