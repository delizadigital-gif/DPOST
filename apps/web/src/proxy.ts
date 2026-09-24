import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Fast, optimistic check for signed-in pages: without a session cookie,
 * send the visitor to log in and bring them back afterwards. It only looks
 * at whether the cookie exists. The real check (is the session valid?)
 * happens in the (app) layout and in every API route.
 *
 * It deliberately never redirects *away* from /login: with a stale cookie
 * that would bounce between /login and /home forever.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Signed-in areas. New app sections are added here as they're built.
  matcher: [
    '/home/:path*',
    '/welcome/:path*',
    '/assistant/:path*',
    '/content/:path*',
    '/calendar/:path*',
    '/create/:path*',
    '/channels/:path*',
    '/media/:path*',
    '/brand/:path*',
    '/analytics/:path*',
    '/notifications/:path*',
    '/settings/:path*',
    '/admin/:path*',
  ],
};
