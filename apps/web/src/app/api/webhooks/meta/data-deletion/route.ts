import { getMetaEnv, getServerEnv } from '@dpost/config';
import { deletionConfirmationCode, handleDataDeletion, parseSignedRequest } from '@dpost/core';
import { getLogger } from '@/lib/logger';

/**
 * Meta's data deletion callback, which their app review requires.
 *
 * It must answer with a URL the person can open to see what happened and a
 * confirmation code they can quote. The deletion itself is immediate, so
 * that status page can tell the truth straight away.
 */
export async function POST(request: Request): Promise<Response> {
  const logger = getLogger();
  const env = getMetaEnv();
  const appUrl = getServerEnv().APP_URL;

  if (!env.META_APP_SECRET) {
    return Response.json({ url: `${appUrl}/data-deletion`, confirmation_code: 'not-configured' });
  }

  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get('signed_request');
  if (typeof signedRequest !== 'string') {
    return Response.json({ url: `${appUrl}/data-deletion`, confirmation_code: 'invalid' });
  }

  const payload = parseSignedRequest(signedRequest, env.META_APP_SECRET);
  if (!payload?.user_id) {
    logger.warn('meta data deletion callback had an invalid signature');
    return Response.json({ url: `${appUrl}/data-deletion`, confirmation_code: 'invalid' });
  }

  const result = await handleDataDeletion(payload.user_id);
  const confirmationCode = deletionConfirmationCode(payload.user_id);
  logger.info({ ...result, confirmationCode }, 'deleted facebook data on request');

  return Response.json({
    url: `${appUrl}/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
