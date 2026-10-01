import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deletionConfirmationCode, parseSignedRequest } from './signed-request';

/**
 * These callbacks delete data and sit on public URLs, so the signature is
 * the only thing between them and anyone who knows the address.
 */

const SECRET = 'app-secret-for-tests';

function sign(payload: object, secret = SECRET): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${signature}.${encoded}`;
}

describe('verifying what Meta sent', () => {
  it('accepts a properly signed request', () => {
    const payload = parseSignedRequest(
      sign({ user_id: '1234567890', algorithm: 'HMAC-SHA256', issued_at: 1_700_000_000 }),
      SECRET,
    );
    expect(payload?.user_id).toBe('1234567890');
  });

  it('refuses one signed with the wrong secret', () => {
    expect(parseSignedRequest(sign({ user_id: '1' }, 'someone-elses-secret'), SECRET)).toBeNull();
  });

  it('refuses one whose payload was changed after signing', () => {
    const signed = sign({ user_id: '1' });
    const [signature] = signed.split('.');
    const tampered = Buffer.from(JSON.stringify({ user_id: '999' })).toString('base64url');
    expect(parseSignedRequest(`${signature}.${tampered}`, SECRET)).toBeNull();
  });

  it('refuses one with no signature at all', () => {
    const encoded = Buffer.from(JSON.stringify({ user_id: '1' })).toString('base64url');
    expect(parseSignedRequest(encoded, SECRET)).toBeNull();
    expect(parseSignedRequest(`.${encoded}`, SECRET)).toBeNull();
  });

  it('refuses an algorithm we do not expect', () => {
    expect(parseSignedRequest(sign({ user_id: '1', algorithm: 'HMAC-SHA1' }), SECRET)).toBeNull();
  });

  it('refuses junk rather than throwing', () => {
    expect(parseSignedRequest('nonsense', SECRET)).toBeNull();
    expect(parseSignedRequest('a.b', SECRET)).toBeNull();
    expect(parseSignedRequest('', SECRET)).toBeNull();
  });
});

describe('the confirmation code', () => {
  it('is stable for the same request', () => {
    expect(deletionConfirmationCode('123', 1_700_000_000)).toBe(
      deletionConfirmationCode('123', 1_700_000_000),
    );
  });

  it('differs between people', () => {
    expect(deletionConfirmationCode('123', 1)).not.toBe(deletionConfirmationCode('456', 1));
  });

  it('does not contain the Facebook id', () => {
    expect(deletionConfirmationCode('1234567890', 1)).not.toContain('1234567890');
  });
});
