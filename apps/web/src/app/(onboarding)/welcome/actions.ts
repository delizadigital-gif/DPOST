'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  completeOnboarding,
  patchSchema,
  updateBrandSection,
  updateBrandSections,
} from '@dpost/core';
import { action, type ActionResult } from '@/lib/api/action';

/**
 * What each onboarding step saves. Everything is written with the source
 * `onboarding`, which is what lets the Brand Brain show "from setup" next to
 * a value and lets a later Page analysis fill gaps without overwriting it.
 *
 * These deliberately don't redirect: the wizard navigates on the client
 * after a successful save, so a failed save can show its message on the
 * step the user is already looking at.
 */

const audienceInput = z.object({
  audience: patchSchema('audience'),
  offerings: patchSchema('offerings'),
});

const voiceInput = z.object({
  voice: patchSchema('voice'),
  contentMix: patchSchema('contentMix'),
});

export async function saveBusinessStep(values: unknown): Promise<ActionResult<null>> {
  return action(
    { input: patchSchema('business'), permission: 'brand:update' },
    async ({ ctx, input }) => {
      await updateBrandSection(ctx, 'business', input, 'onboarding');
      revalidatePath('/brand');
      return null;
    },
    values,
  );
}

export async function saveAudienceStep(values: unknown): Promise<ActionResult<null>> {
  return action(
    { input: audienceInput, permission: 'brand:update' },
    async ({ ctx, input }) => {
      await updateBrandSections(ctx, input, 'onboarding');
      revalidatePath('/brand');
      return null;
    },
    values,
  );
}

export async function saveVoiceStep(values: unknown): Promise<ActionResult<null>> {
  return action(
    { input: voiceInput, permission: 'brand:update' },
    async ({ ctx, input }) => {
      await updateBrandSections(ctx, input, 'onboarding');
      revalidatePath('/brand');
      return null;
    },
    values,
  );
}

/**
 * Ends the wizard. `dismissed` separates "I answered the questions" from
 * "I skipped setup", so we never tell the AI it knows a business it doesn't.
 */
export async function finishOnboarding(dismissed = false): Promise<ActionResult<null>> {
  return action({ permission: 'workspace:update' }, async ({ ctx }) => {
    await completeOnboarding(ctx, { dismissed });
    revalidatePath('/', 'layout');
    return null;
  });
}
