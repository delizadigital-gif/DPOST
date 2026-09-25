import { getBrand, getBrandCard } from '@dpost/core';
import { route } from '@/lib/api/route';

/**
 * The whole Brand Brain: profile, memories and the rendered card. The card
 * is included because it is what the AI actually receives — an integration
 * (or a support conversation) should never have to guess at it.
 */
export const GET = route(
  { auth: 'member', permission: 'brand:read', rateLimit: 'read' },
  async ({ ctx }) => {
    const [brand, card] = await Promise.all([getBrand(ctx), getBrandCard(ctx)]);
    return { ...brand, card };
  },
);
