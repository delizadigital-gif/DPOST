import { rewriteDraft } from '../ai/pipelines/post-writer';
import type { QualityIssue } from '../ai/quality';
import type { QuotaState } from '../ai/usage';
import type { Context } from '../context';
import { getPost, updatePost, type PostSummary } from './posts';

/**
 * Rewriting a post that is already saved, with the owner's own instruction
 * ("make it shorter", "mention free delivery").
 *
 * It goes through the same metered, quality-checked pipeline as the
 * composer, and then through the same `updatePost` as a hand edit — so the
 * previous version is snapshotted as a revision and an approved post drops
 * back to review. Regeneration is just another edit, with a machine holding
 * the pen.
 */

export interface RegeneratePostResult {
  post: PostSummary;
  warnings: QualityIssue[];
  quota: QuotaState;
  /** True when a stub produced this instead of a model. */
  stub: boolean;
}

export async function regeneratePost(
  ctx: Context,
  postId: string,
  instruction?: string,
): Promise<RegeneratePostResult> {
  const existing = await getPost(ctx, postId);

  const rewritten = await rewriteDraft(ctx, {
    action: 'improve',
    body: existing.body,
    hashtags: existing.hashtags,
    cta: existing.cta,
    language: existing.language,
    instruction,
  });

  const post = await updatePost(
    ctx,
    postId,
    {
      body: rewritten.post.body,
      hashtags: rewritten.post.hashtags,
      cta: rewritten.post.cta,
    },
    'regenerate',
    instruction,
  );

  return {
    post,
    warnings: rewritten.warnings,
    quota: rewritten.quota,
    stub: rewritten.meta.stub,
  };
}
