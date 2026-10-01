import { getMetaEnv } from '@dpost/config';
import { handleDeauthorize, parseSignedRequest } from '@dpost/core';
import { getLogger } from '@/lib/logger';

/**
 * Meta calls this when someone removes DPOST from their Facebook settings.
 *
 * It is a public URL that deletes data, so the signature is the only thing
 * standing between it and anyone with the address. An unsigned request is
 * answered with a plain 200 and changes nothing: Meta is told the callback
 * exists, and a prod cannot learn whether a given Facebook id is one of our
 * users.
 */
export async function POST(request: Request): Promise<Response> {
  const logger = getLogger();
  const env = getMetaEnv();

  if (!env.META_APP_SECRET) {
    logger.warn('meta deauthorize callback hit, but no app secret is configured');
    return Response.json({ ok: true });
  }

  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get('signed_request');
  if (typeof signedRequest !== 'string') return Response.json({ ok: true });

  const payload = parseSignedRequest(signedRequest, env.META_APP_SECRET);
  if (!payload?.user_id) {
    logger.warn('meta deauthorize callback had an invalid signature');
    return Response.json({ ok: true });
  }

  const result = await handleDeauthorize(payload.user_id);
  logger.info({ ...result }, 'facebook connection removed at the user’s request');
  return Response.json({ ok: true });
}
