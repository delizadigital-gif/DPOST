import { generateObject } from 'ai';
import { z } from 'zod';
import { assertCan } from '../../authz/permissions';
import type { Context } from '../../context';
import { AppError } from '../../lib/errors';
import { getBrandCard } from '../../services/brand';
import { uploadMedia, type MediaSummary } from '../../services/media';
import { getModel } from '../models';
import { assertCanUse, recordQuotaUsage, withUsage, type QuotaState } from '../usage';
import { getImageProvider, type ImageAspect } from './provider';

/**
 * Turning a post into a picture.
 *
 * ```
 * post text + brand  ─►  fast model writes an image prompt
 *                    ─►  ImageProvider makes the picture
 *                    ─►  the usual upload path: re-encode, thumbnail, store
 * ```
 *
 * The prompt writer exists because a caption is not an image brief: "Eid
 * collection is here, 12 new designs" has to become a description of a
 * scene. It also enforces the two rules that matter for this audience —
 * **no text inside the image**, because models mangle Bengali script, and a
 * setting that looks like Bangladesh rather than a stock-photo version of it.
 */

const imagePromptSchema = z.object({
  prompt: z
    .string()
    .min(20)
    .max(600)
    .describe('What the picture shows: subject, setting, light, framing. No text in the image.'),
  negativePrompt: z.string().max(300).describe('What to keep out of the picture'),
  altText: z.string().min(5).max(200).describe('A plain description for screen readers'),
});

export type ImagePromptPlan = z.infer<typeof imagePromptSchema>;

const PROMPT_WRITER_VERSION = 'image-prompt.v1';

export interface WriteImagePromptInput {
  postBody: string;
  aspect: ImageAspect;
}

export async function writeImagePrompt(
  ctx: Context,
  input: WriteImagePromptInput,
): Promise<ImagePromptPlan> {
  const brandCard = await getBrandCard(ctx);
  const { model, modelId, provider } = getModel('fast');

  return withUsage(ctx, 'image_prompt', async () => {
    const result = await generateObject({
      model,
      schema: imagePromptSchema,
      system: `You write briefs for an image generator, for a small business's social media post.

Describe one clear scene: what is in it, where it is, how it is lit, how it is framed. Real and specific, not a stock photograph.

Never ask for text, words, letters, numbers or logos inside the image. Image models garble writing, and Bengali script worst of all — any wording is added afterwards by the app, not by the model.

If the business is in Bangladesh, the setting should look like Bangladesh: the right street, the right light, the right people, without turning it into a postcard.`,
      prompt: `<brand_data>\n${brandCard}\n</brand_data>\n\nThe post this image goes with:\n<post>\n${input.postBody.trim()}\n</post>\n\nWrite the image brief.`,
      temperature: 0.7,
    }).catch((error: unknown) => {
      throw new AppError('PLATFORM_ERROR', {
        message: "The AI couldn't describe an image for this post. Please try again.",
        cause: error,
      });
    });

    return {
      result: result.object,
      usage: {
        provider,
        modelId,
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
    };
  });
}

export interface GenerateImageInput {
  postBody: string;
  aspect?: ImageAspect;
  /** Skips the prompt writer when the user typed their own description. */
  prompt?: string;
}

export interface GenerateImageResult {
  media: MediaSummary;
  prompt: string;
  altText: string;
  provider: string;
  /** True when a placeholder was produced instead of a generated image. */
  stub: boolean;
  quota: QuotaState;
}

/**
 * The whole path, metered and inside the plan's allowance. Images have their
 * own allowance because they cost several times what a post does.
 */
export async function generatePostImage(
  ctx: Context,
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  assertCan(ctx.role, 'ai:use');
  assertCan(ctx.role, 'media:upload');
  await assertCanUse(ctx, 'aiImages', 1);

  const aspect = input.aspect ?? '1:1';
  const plan = input.prompt?.trim()
    ? {
        prompt: input.prompt.trim(),
        negativePrompt: '',
        altText: input.prompt.trim().slice(0, 200),
      }
    : await writeImagePrompt(ctx, { postBody: input.postBody, aspect });

  const provider = getImageProvider();
  const generated = await provider.generate({
    prompt: plan.prompt,
    ...(plan.negativePrompt ? { negativePrompt: plan.negativePrompt } : {}),
    aspect,
  });

  const media = await uploadMedia(ctx, {
    bytes: generated.bytes,
    filename: `ai-${Date.now()}.png`,
    altText: plan.altText,
    source: 'ai',
    prompt: plan.prompt,
    provider: generated.provider,
  });

  await recordQuotaUsage(ctx, 'aiImages', 1);
  const { getQuota } = await import('../usage');

  return {
    media,
    prompt: plan.prompt,
    altText: plan.altText,
    provider: generated.provider,
    stub: generated.stub,
    quota: await getQuota(ctx, 'aiImages'),
  };
}

export { PROMPT_WRITER_VERSION };
