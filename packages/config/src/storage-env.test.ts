import { describe, expect, it } from 'vitest';
import { parseStorageEnv } from './storage-env';

/**
 * Where files live. The rule that matters: local disk is fine on a
 * developer's machine and in the end-to-end tests, and must never serve a
 * deployed site — the disk is wiped on deploy, and Facebook cannot reach it.
 */

describe('storage settings', () => {
  it('defaults to local disk for development', () => {
    const env = parseStorageEnv({});
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.MAX_UPLOAD_MB).toBe(10);
  });

  it('allows local disk for a production build served on localhost', () => {
    const env = parseStorageEnv({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 'local',
      APP_URL: 'http://localhost:3000',
    });
    expect(env.STORAGE_DRIVER).toBe('local');
  });

  it('refuses local disk on a deployed site', () => {
    expect(() =>
      parseStorageEnv({
        NODE_ENV: 'production',
        STORAGE_DRIVER: 'local',
        APP_URL: 'https://app.example.com',
      }),
    ).toThrow(/cannot serve a deployed site/);
  });

  it('refuses local disk in production when there is no address to judge by', () => {
    expect(() => parseStorageEnv({ NODE_ENV: 'production', STORAGE_DRIVER: 'local' })).toThrow(
      /cannot serve a deployed site/,
    );
  });

  it('insists on the details an object store needs', () => {
    expect(() => parseStorageEnv({ STORAGE_DRIVER: 's3' })).toThrow(/S3_ENDPOINT/);
  });

  it('insists on a public address, because Facebook fetches the image', () => {
    expect(() =>
      parseStorageEnv({
        STORAGE_DRIVER: 's3',
        S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        S3_BUCKET: 'dpost',
        S3_ACCESS_KEY_ID: 'key',
        S3_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toThrow(/MEDIA_PUBLIC_BASE_URL/);
  });

  it('accepts a complete object-store setup', () => {
    const env = parseStorageEnv({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      S3_BUCKET: 'dpost',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
      MEDIA_PUBLIC_BASE_URL: 'https://media.dpost.app',
      APP_URL: 'https://app.example.com',
    });
    expect(env.S3_BUCKET).toBe('dpost');
  });
});
