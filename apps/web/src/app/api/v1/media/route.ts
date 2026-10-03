import { z } from 'zod';
import { getStorageEnv } from '@dpost/config';
import { AppError, listMedia, uploadMedia } from '@dpost/core';
import { route } from '@/lib/api/route';

const query = z.object({
  source: z
    .string()
    .optional()
    .transform((raw) => raw?.split(',').filter(Boolean) ?? [])
    .pipe(z.array(z.enum(['upload', 'ai', 'brand_asset', 'imported']))),
  q: z.string().trim().max(200).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = route(
  { auth: 'member', permission: 'media:read', rateLimit: 'read', query },
  ({ ctx, query }) =>
    listMedia(ctx, {
      source: query.source,
      ...(query.q ? { search: query.q } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    }),
);

/**
 * Uploading an image.
 *
 * Multipart rather than JSON, so the browser streams the file instead of
 * base64-encoding it into a string a third larger. The size is checked
 * against the header first, so an oversized upload is refused before it is
 * read into memory.
 */
export const POST = route(
  { auth: 'member', permission: 'media:upload', rateLimit: 'upload' },
  async ({ ctx, request }) => {
    const maxBytes = getStorageEnv().MAX_UPLOAD_MB * 1024 * 1024;
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > maxBytes * 1.1) {
      throw new AppError('VALIDATION', {
        message: `That file is larger than ${getStorageEnv().MAX_UPLOAD_MB} MB.`,
      });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      throw new AppError('VALIDATION', { message: 'No file was sent.' });
    }
    if (file.size > maxBytes) {
      throw new AppError('VALIDATION', {
        message: `That file is larger than ${getStorageEnv().MAX_UPLOAD_MB} MB.`,
      });
    }

    const altText = form?.get('altText');
    return uploadMedia(ctx, {
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      ...(typeof altText === 'string' && altText.trim() ? { altText: altText.trim() } : {}),
    });
  },
);
