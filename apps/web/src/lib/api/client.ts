/**
 * Calling our own API from the browser. Every route answers with the same
 * error shape, so one helper can turn any failure into a message the
 * interface can show, instead of each screen inventing its own handling.
 */

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const NETWORK_ERROR: ApiError = {
  code: 'NETWORK',
  message: "Couldn't reach DPOST. Check your connection and try again.",
};

export async function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = (payload as { error?: ApiError } | null)?.error;
    return {
      ok: false,
      error: error ?? {
        code: `HTTP_${response.status}`,
        message: 'Something went wrong. Please try again.',
      },
    };
  }

  return { ok: true, data: payload as T };
}
