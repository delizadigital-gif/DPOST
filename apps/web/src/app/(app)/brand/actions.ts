'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  addBrandMemory,
  deleteBrandMemory,
  isBrandSection,
  patchSchema,
  updateBrandSection,
  type BrandSectionName,
} from '@dpost/core';
import { action, type ActionResult } from '@/lib/api/action';

/**
 * Edits made on the Brand Brain screen. These are written with the source
 * `user`, which pins them: a later Page analysis may fill empty fields but
 * will never overwrite something a person typed here.
 */

const memoryCategories = ['voice', 'audience', 'product', 'policy', 'schedule', 'other'] as const;

const memoryInput = z.object({
  content: z.string().trim().min(1, 'Write something to remember').max(500),
  category: z.enum(memoryCategories),
});

/**
 * One action for all six sections: the section name is validated against
 * the known list, then the values against that section's own schema, so a
 * tampered form can't write to a field that doesn't exist.
 */
export async function updateSection(section: string, values: unknown): Promise<ActionResult<null>> {
  if (!isBrandSection(section)) {
    return { ok: false, error: { message: 'Unknown part of the brand profile.' } };
  }
  const name: BrandSectionName = section;

  return action(
    { input: patchSchema(name), permission: 'brand:update' },
    async ({ ctx, input }) => {
      await updateBrandSection(ctx, name, input, 'user');
      revalidatePath('/brand');
      return null;
    },
    values,
  );
}

export async function addMemory(values: unknown): Promise<ActionResult<null>> {
  return action(
    { input: memoryInput, permission: 'brand:update' },
    async ({ ctx, input }) => {
      await addBrandMemory(ctx, { content: input.content, category: input.category });
      revalidatePath('/brand');
      return null;
    },
    values,
  );
}

export async function removeMemory(id: string): Promise<ActionResult<null>> {
  return action(
    { input: z.uuid(), permission: 'brand:update' },
    async ({ ctx, input }) => {
      await deleteBrandMemory(ctx, input);
      revalidatePath('/brand');
      return null;
    },
    id,
  );
}
