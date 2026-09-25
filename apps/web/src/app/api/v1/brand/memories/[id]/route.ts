import { deleteBrandMemory } from '@dpost/core';
import { route } from '@/lib/api/route';

export const DELETE = route(
  { auth: 'member', permission: 'brand:update', rateLimit: 'mutation' },
  async ({ ctx, params }) => {
    await deleteBrandMemory(ctx, String(params.id));
    return { deleted: true };
  },
);
