import { AppError, isBrandSection, updateBrandSection } from '@dpost/core';
import { route } from '@/lib/api/route';
import { z } from 'zod';

/**
 * Updates one section. The body is validated against that section's own
 * schema inside the service, so this handler only has to check that the
 * section in the URL is a real one.
 */
export const PATCH = route(
  {
    auth: 'member',
    permission: 'brand:update',
    rateLimit: 'mutation',
    body: z.record(z.string(), z.unknown()),
  },
  async ({ ctx, params, body }) => {
    const section = String(params.section);
    if (!isBrandSection(section)) {
      throw new AppError('NOT_FOUND', { message: 'Unknown part of the brand profile.' });
    }
    return updateBrandSection(ctx, section, body, 'user');
  },
);
