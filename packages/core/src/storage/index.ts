import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { S3Client } from '@aws-sdk/client-s3';
import { getServerEnv, getStorageEnv, type StorageEnv } from '@dpost/config';
import { AppError } from '../lib/errors';

/**
 * Where files live, behind one small interface.
 *
 * The product never knows whether an image is on a disk or in an object
 * store — it has a key and asks for a URL. That keeps development free of
 * cloud credentials and lets a deployment use R2, S3 or anything else that
 * speaks the same protocol, without a line changing anywhere else.
 */

export interface StoredObject {
  key: string;
  bytes: number;
}

export interface StorageProvider {
  readonly name: 'local' | 's3';
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /**
   * The address the file is served from. It must be reachable from the
   * internet in production, because Facebook fetches images from it.
   */
  publicUrl(key: string): string;
}

/**
 * Keys are built here so one shape is used everywhere, and so a workspace's
 * id is always the first segment: that is what makes a stray key from
 * another workspace obvious, and what the cross-tenant test checks.
 */
export function mediaKey(
  workspaceId: string,
  mediaId: string,
  variant: 'original' | 'thumb',
  extension: string,
): string {
  return `workspaces/${workspaceId}/media/${mediaId}/${variant}.${extension}`;
}

export function workspaceOfKey(key: string): string | null {
  const match = /^workspaces\/([^/]+)\//u.exec(key);
  return match?.[1] ?? null;
}

/** Rejects anything that could climb out of the storage folder. */
function assertSafeKey(key: string): void {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\')) {
    throw new AppError('VALIDATION', { message: 'That file path is not allowed.' });
  }
}

class LocalStorage implements StorageProvider {
  readonly name = 'local' as const;

  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    assertSafeKey(key);
    const full = resolve(join(this.root, normalize(key)));
    // Belt and braces: even with a safe-looking key, the resolved path must
    // stay inside the root.
    if (!full.startsWith(resolve(this.root) + sep)) {
      throw new AppError('VALIDATION', { message: 'That file path is not allowed.' });
    }
    return full;
  }

  async put(key: string, body: Buffer): Promise<StoredObject> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key, bytes: body.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.pathFor(key));
    } catch {
      throw new AppError('NOT_FOUND', { message: 'That file is no longer here.' });
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  publicUrl(key: string): string {
    // Served by the app itself, with the session checked, because a local
    // folder has no public address of its own.
    return `${getServerEnv().APP_URL}/api/media/${key}`;
  }
}

class S3Storage implements StorageProvider {
  readonly name = 's3' as const;
  private client: S3Client | undefined;

  constructor(
    private readonly settings: {
      region: string;
      endpoint: string;
      accessKeyId: string;
      secretAccessKey: string;
    },
    private readonly bucket: string,
    private readonly baseUrl: string,
  ) {}

  /**
   * The AWS SDK is loaded on first use, so a development machine using local
   * storage never pays for parsing ten megabytes it will not call.
   */
  private async connect(): Promise<S3Client> {
    if (!this.client) {
      const { S3Client: Client } = await import('@aws-sdk/client-s3');
      this.client = new Client({
        region: this.settings.region,
        endpoint: this.settings.endpoint,
        credentials: {
          accessKeyId: this.settings.accessKeyId,
          secretAccessKey: this.settings.secretAccessKey,
        },
        // R2 and most S3-compatible stores want the bucket in the path.
        forcePathStyle: true,
      });
    }
    return this.client;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    assertSafeKey(key);
    const [client, { PutObjectCommand }] = await Promise.all([
      this.connect(),
      import('@aws-sdk/client-s3'),
    ]);
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // A year: the key contains the media id, so a changed image is a new
        // key rather than a new version of an old one.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key, bytes: body.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const [client, { GetObjectCommand }] = await Promise.all([
      this.connect(),
      import('@aws-sdk/client-s3'),
    ]);
    const result = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = result.Body;
    if (!body) throw new AppError('NOT_FOUND', { message: 'That file is no longer here.' });
    return Buffer.from(await body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const [client, { DeleteObjectCommand }] = await Promise.all([
      this.connect(),
      import('@aws-sdk/client-s3'),
    ]);
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  publicUrl(key: string): string {
    return `${this.baseUrl.replace(/\/$/u, '')}/${key}`;
  }
}

let provider: StorageProvider | undefined;

/** Replaced in tests with an in-memory store. */
export function setStorageProvider(next: StorageProvider | undefined): void {
  provider = next;
}

export function getStorage(env: StorageEnv = getStorageEnv()): StorageProvider {
  if (provider) return provider;

  if (env.STORAGE_DRIVER === 'local') {
    provider = new LocalStorage(resolve(process.cwd(), env.STORAGE_LOCAL_DIR));
    return provider;
  }

  provider = new S3Storage(
    {
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
    env.S3_BUCKET!,
    env.MEDIA_PUBLIC_BASE_URL!,
  );
  return provider;
}

/** An in-memory provider, for tests. */
export function createMemoryStorage(): StorageProvider & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    name: 'local',
    objects,
    async put(key, body) {
      assertSafeKey(key);
      objects.set(key, body);
      return { key, bytes: body.byteLength };
    },
    async get(key) {
      const value = objects.get(key);
      if (!value) throw new AppError('NOT_FOUND', { message: 'That file is no longer here.' });
      return value;
    },
    async delete(key) {
      objects.delete(key);
    },
    publicUrl(key) {
      return `https://media.test/${key}`;
    },
  };
}
