import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Meta's `signed_request`: a base64url payload with an HMAC in front of it,
 * sent to the deauthorize and data-deletion callbacks.
 *
 * Verifying it is the whole point — these endpoints delete data, and they
 * are public URLs. An unsigned or badly signed request must do nothing at
 * all, which is why this returns null rather than throwing: the caller
 * answers Meta politely either way, and nothing happens.
 */

export interface SignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [key: string]: unknown;
}

export function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): SignedRequestPayload | null {
  const [encodedSignature, encodedPayload] = signedRequest.split('.');
  if (!encodedSignature || !encodedPayload) return null;

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  // Meta documents HMAC-SHA256; anything else is a request we don't trust.
  if (payload.algorithm && payload.algorithm.toUpperCase() !== 'HMAC-SHA256') return null;

  const expected = createHmac('sha256', appSecret).update(encodedPayload).digest();
  const received = Buffer.from(encodedSignature, 'base64url');
  if (expected.length !== received.length) return null;
  // Constant time: a timing side-channel on a signature check is a way in.
  if (!timingSafeEqual(expected, received)) return null;

  return payload;
}

/**
 * Meta requires a confirmation code it can quote back in a support request.
 * It identifies the deletion without naming the person.
 */
export function deletionConfirmationCode(facebookUserId: string, now = Date.now()): string {
  return createHmac('sha256', 'dpost-deletion')
    .update(`${facebookUserId}:${now}`)
    .digest('hex')
    .slice(0, 16);
}
