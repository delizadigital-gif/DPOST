import 'server-only';
import { nextCookies } from 'better-auth/next-js';
import { createAuth, type Auth } from '@dpost/core';
import { getLogger } from '@/lib/logger';

let auth: Auth | undefined;

/** The Better Auth instance for the web app. Created on first use, not at import. */
export function getAuth(): Auth {
  // nextCookies lets auth calls made from Server Actions set cookies.
  auth ??= createAuth({ plugins: [nextCookies()], logger: getLogger() });
  return auth;
}
