import { z } from 'zod';
import { addBrandMemory } from '@dpost/core';
import { route } from '@/lib/api/route';

const body = z.object({
  content: z.string().trim().min(1).max(500),
  category: z.enum(['voice', 'audience', 'product', 'policy', 'schedule', 'other']),
});

export const POST = route(
  { auth: 'member', permission: 'brand:update', rateLimit: 'mutation', body },
  ({ ctx, body }) => addBrandMemory(ctx, body),
);
