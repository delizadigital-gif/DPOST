import { startFacebookConnection } from '@dpost/core';
import { getServerEnv } from '@dpost/config';
import { route } from '@/lib/api/route';

/** Where Meta sends the user back. Must match the app's settings exactly. */
export function facebookRedirectUri(): string {
  return `${getServerEnv().APP_URL}/api/oauth/facebook/callback`;
}

/**
 * Sends the user to Facebook to choose their Pages.
 *
 * A GET that redirects, because it is the browser following a link — the
 * single-use state is what protects it, not the method.
 */
export const GET = route(
  { auth: 'member', permission: 'social:connect', rateLimit: 'mutation' },
  async ({ ctx }) => {
    const { authorizeUrl } = await startFacebookConnection(ctx, facebookRedirectUri());
    return Response.redirect(authorizeUrl, 302);
  },
);
