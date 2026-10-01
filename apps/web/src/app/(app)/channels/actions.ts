'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { connectPages, disconnectChannel, listAvailablePages } from '@dpost/core';
import { action, type ActionResult } from '@/lib/api/action';

/**
 * Connecting and disconnecting Pages.
 *
 * The Page tokens are never sent to the browser: the picker sends back only
 * the ids it chose, and the server fetches the matching tokens again from
 * Facebook before storing them encrypted.
 */

const idList = z.array(z.string().min(1)).min(1).max(50);

export async function connectSelectedPages(
  accountId: string,
  pageIds: unknown,
): Promise<ActionResult<{ connected: number }>> {
  return action(
    { input: idList, permission: 'social:connect' },
    async ({ ctx, input }) => {
      const available = await listAvailablePages(ctx, accountId);
      const chosen = available.filter((page) => input.includes(page.id));
      await connectPages(ctx, accountId, chosen);
      revalidatePath('/channels');
      return { connected: chosen.length };
    },
    pageIds,
  );
}

export async function disconnect(channelId: unknown): Promise<ActionResult<null>> {
  return action(
    { input: z.uuid(), permission: 'social:connect' },
    async ({ ctx, input }) => {
      await disconnectChannel(ctx, input);
      revalidatePath('/channels');
      return null;
    },
    channelId,
  );
}
