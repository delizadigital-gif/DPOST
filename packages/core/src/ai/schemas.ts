import { z } from 'zod';

/**
 * What the model must return.
 *
 * These schemas are sent to the provider as JSON Schema, so they stay plain:
 * no transforms, no defaults, nothing that only exists on our side. Tidying
 * up (stripping a stray `#`, trimming) happens afterwards in
 * `normaliseDraft`, where it can be tested on its own.
 */

export const CONTENT_LANGUAGES = ['en', 'bn', 'banglish', 'mixed'] as const;
export type ContentLanguageCode = (typeof CONTENT_LANGUAGES)[number];

export const CONTENT_TYPES = [
  'promotional',
  'educational',
  'inspirational',
  'engagement',
  'product_showcase',
  'announcement',
  'storytelling',
  'tips',
  'offer',
  'question',
  'behind_the_scenes',
  'testimonial',
] as const;
export type ContentTypeCode = (typeof CONTENT_TYPES)[number];

export const MAX_DRAFTS_PER_REQUEST = 5;

export const postDraftSchema = z.object({
  idea: z.string().min(1).max(80).describe('A short English label for this idea, for the owner'),
  body: z.string().min(1).max(3000).describe('The post exactly as it should appear'),
  hashtags: z.array(z.string().max(40)).max(6).describe('Hashtags without the # sign'),
  cta: z
    .string()
    .max(160)
    .nullable()
    .describe('The call to action, or null if the post needs none'),
  contentType: z.enum(CONTENT_TYPES),
  language: z.enum(CONTENT_LANGUAGES),
  needsImage: z.boolean().describe('Whether this post would work better with a photo'),
});

export type PostDraft = z.infer<typeof postDraftSchema>;

export const postDraftsSchema = z.object({
  posts: z.array(postDraftSchema).min(1).max(MAX_DRAFTS_PER_REQUEST),
});

/** A rewrite returns one post: the user is editing a specific draft. */
export const rewriteResultSchema = z.object({
  body: z.string().min(1).max(3000),
  hashtags: z.array(z.string().max(40)).max(6),
  cta: z.string().max(160).nullable(),
});

export type RewriteResult = z.infer<typeof rewriteResultSchema>;

/** Hashtags are stored without the leading `#`; the interface adds it back. */
export function normaliseHashtags(hashtags: readonly string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of hashtags) {
    const tag = raw.replace(/^#+/u, '').replace(/\s+/gu, '').trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(tag);
  }
  return cleaned;
}

export function normaliseDraft(draft: PostDraft): PostDraft {
  const cta = draft.cta?.trim();
  return {
    ...draft,
    idea: draft.idea.trim(),
    body: draft.body.trim(),
    hashtags: normaliseHashtags(draft.hashtags),
    cta: cta ? cta : null,
  };
}
