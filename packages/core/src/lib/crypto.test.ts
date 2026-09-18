import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, type Keyring } from './crypto';
import { AppError } from './errors';

const key1 = randomBytes(32);
const key2 = randomBytes(32);
const keyring: Keyring = { currentVersion: 1, keys: new Map([[1, key1]]) };
const CONTEXT = 'workspace:ws_a:facebook_page_token';
const TOKEN = 'EAAB-very-secret-page-token';

function flipFirstByte(base64: string) {
  const bytes = Buffer.from(base64, 'base64');
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  return bytes.toString('base64');
}

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    const encrypted = encryptSecret(TOKEN, CONTEXT, keyring);
    expect(decryptSecret(encrypted, CONTEXT, keyring)).toBe(TOKEN);
  });

  it('never stores the plaintext and uses a fresh IV every time', () => {
    const a = encryptSecret(TOKEN, CONTEXT, keyring);
    const b = encryptSecret(TOKEN, CONTEXT, keyring);
    expect(JSON.stringify(a)).not.toContain(TOKEN);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.keyVersion).toBe(1);
  });

  it('rejects tampered ciphertext, IV or tag', () => {
    const encrypted = encryptSecret(TOKEN, CONTEXT, keyring);
    for (const field of ['ciphertext', 'iv', 'tag'] as const) {
      const tampered = { ...encrypted, [field]: flipFirstByte(encrypted[field]) };
      expect(() => decryptSecret(tampered, CONTEXT, keyring)).toThrow(AppError);
    }
  });

  it('rejects a value moved to another context (e.g. another workspace)', () => {
    const encrypted = encryptSecret(TOKEN, CONTEXT, keyring);
    expect(() => decryptSecret(encrypted, 'workspace:ws_b:facebook_page_token', keyring)).toThrow(
      AppError,
    );
  });

  it('supports key rotation: old values still decrypt, new values use the new key', () => {
    const old = encryptSecret(TOKEN, CONTEXT, keyring);
    const rotated: Keyring = {
      currentVersion: 2,
      keys: new Map([
        [1, key1],
        [2, key2],
      ]),
    };
    expect(decryptSecret(old, CONTEXT, rotated)).toBe(TOKEN);
    expect(encryptSecret(TOKEN, CONTEXT, rotated).keyVersion).toBe(2);
  });

  it('fails clearly when the key version is unknown, without leaking data', () => {
    const encrypted = encryptSecret(TOKEN, CONTEXT, keyring);
    const other: Keyring = { currentVersion: 2, keys: new Map([[2, key2]]) };
    try {
      decryptSecret(encrypted, CONTEXT, other);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).message).not.toContain(TOKEN);
    }
  });
});
