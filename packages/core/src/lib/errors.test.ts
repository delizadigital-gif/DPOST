import { describe, expect, it } from 'vitest';
import { AppError, isAppError, toPublicError } from './errors';

describe('AppError', () => {
  it('maps codes to HTTP statuses and default messages', () => {
    const error = new AppError('NOT_FOUND');
    expect(error.status).toBe(404);
    expect(error.message).toMatch(/couldn't find/);
    expect(isAppError(error)).toBe(true);
  });

  it('keeps custom messages and details', () => {
    const error = new AppError('QUOTA_EXCEEDED', {
      message: "You've used all 30 AI posts this month.",
      details: { used: 30, limit: 30 },
    });
    expect(toPublicError(error, 'req_1')).toEqual({
      status: 402,
      body: {
        code: 'QUOTA_EXCEEDED',
        message: "You've used all 30 AI posts this month.",
        details: { used: 30, limit: 30 },
        requestId: 'req_1',
      },
    });
  });
});

describe('toPublicError', () => {
  it('hides the details of unexpected errors', () => {
    const leaky = new Error('connect ECONNREFUSED postgres://admin:hunter2@db:5432');
    const { status, body } = toPublicError(leaky);
    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('handles non-Error throwables', () => {
    expect(toPublicError('boom').status).toBe(500);
    expect(toPublicError(undefined).body.code).toBe('INTERNAL');
  });
});
