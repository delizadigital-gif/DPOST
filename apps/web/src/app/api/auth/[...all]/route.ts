import { withClientIpHeader } from '@dpost/core';
import { getAuth } from '@/lib/auth/server';

// Better Auth serves sign-up, sign-in, sign-out, verification and password
// reset under /api/auth/*, with its own CSRF checks and rate limits. The
// client IP it rate-limits by is set here, using the same rule as the rest
// of the app, so it can't be spoofed with a made-up header.
export function GET(request: Request) {
  return getAuth().handler(withClientIpHeader(request));
}

export function POST(request: Request) {
  return getAuth().handler(withClientIpHeader(request));
}
