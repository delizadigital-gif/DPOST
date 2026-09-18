import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getServerEnv } from '@dpost/config';
import { AppError } from './errors';

/**
 * Encryption for third-party secrets we must store (e.g. Facebook Page
 * tokens): AES-256-GCM with versioned keys.
 *
 * - GCM authenticates the data, so any tampering makes decryption fail.
 * - The key version is stored next to the ciphertext, so keys can be rotated:
 *   add a new version, make it current, and old values still decrypt.
 * - `context` is bound in as additional authenticated data (AAD). A value
 *   encrypted for workspace A can't be copied into workspace B's row and
 *   decrypted there.
 */

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
}

export interface Keyring {
  currentVersion: number;
  keys: ReadonlyMap<number, Buffer>;
}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export function encryptSecret(
  plaintext: string,
  context: string,
  keyring: Keyring,
): EncryptedValue {
  const key = keyring.keys.get(keyring.currentVersion);
  if (!key) throw new AppError('INTERNAL', { cause: new Error('current encryption key missing') });

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    keyVersion: keyring.currentVersion,
  };
}

export function decryptSecret(value: EncryptedValue, context: string, keyring: Keyring): string {
  const key = keyring.keys.get(value.keyVersion);
  if (!key) {
    throw new AppError('INTERNAL', {
      cause: new Error(`encryption key version ${value.keyVersion} not configured`),
    });
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(value.iv, 'base64'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    // Wrong key, wrong context or tampered data. Never include the value.
    throw new AppError('INTERNAL', {
      cause: new Error('secret decryption failed', { cause: error }),
    });
  }
}

/** The keyring from the environment. Throws if encryption isn't configured. */
export function getKeyring(): Keyring {
  const { TOKEN_ENCRYPTION_KEYS: keys, TOKEN_ENCRYPTION_KEY_VERSION: currentVersion } =
    getServerEnv();
  if (!keys || !currentVersion) {
    throw new AppError('INTERNAL', {
      cause: new Error('TOKEN_ENCRYPTION_KEYS and TOKEN_ENCRYPTION_KEY_VERSION are not set'),
    });
  }
  return { keys, currentVersion };
}
