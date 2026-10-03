import { getStorageEnv } from '@dpost/config';
import { createContext, getStorage, workspaceOfKey } from '@dpost/core';
import { getSession } from '@/lib/auth/session';

/**
 * Serves a file from local storage.
 *
 * Only the local driver needs this: an object store has its own public
 * address. The key's first segment is the workspace that owns the file, and
 * it is checked against the signed-in user's workspace — otherwise anyone
 * with a key could read another business's images.
 *
 * In production the driver is S3-compatible, so this route is a development
 * convenience, not the serving path.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const env = getStorageEnv();
  if (env.STORAGE_DRIVER !== 'local') {
    return new Response('Not found', { status: 404 });
  }

  const { key: segments } = await context.params;
  const key = segments.join('/');
  const owner = workspaceOfKey(key);
  if (!owner) return new Response('Not found', { status: 404 });

  const session = await getSession(request);
  if (!session) return new Response('Unauthorised', { status: 401 });

  const ctx = await createContext({
    userId: session.userId,
    workspaceId: session.activeWorkspaceId,
    emailVerified: session.emailVerified,
    source: 'web',
  }).catch(() => null);

  // A key from another workspace is simply not found: the answer should not
  // tell a stranger whether the file exists.
  if (!ctx || ctx.workspaceId !== owner) return new Response('Not found', { status: 404 });

  try {
    const bytes = await getStorage().get(key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': key.endsWith('.webp')
          ? 'image/webp'
          : key.endsWith('.gif')
            ? 'image/gif'
            : 'image/jpeg',
        // Private: the file is behind a session, so no shared cache may hold it.
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
