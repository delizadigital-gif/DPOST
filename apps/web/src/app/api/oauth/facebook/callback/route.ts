import { getServerEnv } from '@dpost/config';
import { completeFacebookConnection, consumeConnectionState, createContext } from '@dpost/core';
import { getSession } from '@/lib/auth/session';
import { getLogger } from '@/lib/logger';

/**
 * Where Facebook sends the user back.
 *
 * Not written with the `route()` wrapper, because this is a browser
 * redirect, not an API call: every outcome has to end as a page the person
 * can read, never a JSON error. The state is the security here — single use,
 * ten minutes, and bound to the user and workspace that started it.
 */
export async function GET(request: Request): Promise<Response> {
  const appUrl = getServerEnv().APP_URL;
  const url = new URL(request.url);
  const back = (params: Record<string, string>) =>
    Response.redirect(`${appUrl}/channels?${new URLSearchParams(params)}`, 302);

  // The user pressed Cancel on Meta's screen.
  const error = url.searchParams.get('error');
  if (error) {
    return back({ connect: 'cancelled' });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return back({ connect: 'invalid' });

  const stored = await consumeConnectionState(state);
  if (!stored) return back({ connect: 'expired' });

  const session = await getSession(request);
  // The state is bound to the person who started it: a callback opened in
  // someone else's browser connects nothing.
  if (!session || session.userId !== stored.userId) {
    return back({ connect: 'mismatch' });
  }

  try {
    const ctx = await createContext({
      userId: session.userId,
      workspaceId: stored.workspaceId,
      emailVerified: session.emailVerified,
      source: 'web',
    });

    const { accountId, pages } = await completeFacebookConnection(ctx, {
      code,
      redirectUri: stored.redirectUri,
    });

    if (pages.length === 0) return back({ connect: 'no-pages' });
    // The Pages are shown for the user to choose from; nothing is connected
    // until they pick.
    return back({ connect: 'choose', account: accountId });
  } catch (caught) {
    getLogger().error({ err: caught }, 'facebook connection failed');
    return back({ connect: 'failed' });
  }
}
