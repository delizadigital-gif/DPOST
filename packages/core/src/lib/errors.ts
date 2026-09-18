/**
 * One error type for the whole application. Services throw `AppError`; each
 * entry point (route handler, worker, AI tool) maps it to its own output with
 * `toPublicError`. Anything that isn't an AppError is treated as an unexpected
 * INTERNAL error, and its details are never shown to users.
 *
 * Why throw instead of returning Result<T, E>: one mapper at the edge is less
 * ceremony than unwrapping results in every service call, and unexpected
 * exceptions need the same edge handling either way.
 */
export const ERROR_CODES = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  QUOTA_EXCEEDED: 402,
  RATE_LIMITED: 429,
  PLATFORM_ERROR: 502,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Please log in to continue.',
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  CONFLICT: 'This was changed by something else. Refresh and try again.',
  VALIDATION: 'Some of the information is missing or invalid.',
  QUOTA_EXCEEDED: "You've reached your plan's limit for this.",
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  PLATFORM_ERROR: 'A connected service had a problem. Please try again shortly.',
  INTERNAL: 'Something went wrong on our side. Please try again.',
};

export interface AppErrorOptions {
  /** User-safe message. Defaults to a generic message for the code. */
  message?: string;
  /** User-safe structured details (e.g. field errors). Never secrets. */
  details?: Record<string, unknown>;
  /** Underlying error, kept for logs only. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? DEFAULT_MESSAGES[code], { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code];
    this.details = options.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export interface PublicError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

/** Converts any thrown value into a shape that is safe to send to a client. */
export function toPublicError(
  error: unknown,
  requestId?: string,
): { status: number; body: PublicError } {
  const appError = isAppError(error) ? error : new AppError('INTERNAL', { cause: error });
  const body: PublicError = { code: appError.code, message: appError.message };
  if (appError.details) body.details = appError.details;
  if (requestId) body.requestId = requestId;
  return { status: appError.status, body };
}
