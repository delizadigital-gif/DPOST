import { generateObject } from 'ai';
import { assertCan } from '../../authz/permissions';
import type { Context } from '../../context';
import { AppError } from '../../lib/errors';
import { getBrand, getBrandCard } from '../../services/brand';
import { getModel } from '../models';
import {
  buildPostWriterPrompt,
  buildRewritePrompt,
  type RewriteAction,
} from '../prompts/post-writer.v1';
import { checkDraft, opener, type QualityContext, type QualityIssue } from '../quality';
import {
  MAX_DRAFTS_PER_REQUEST,
  normaliseDraft,
  normaliseHashtags,
  postDraftsSchema,
  rewriteResultSchema,
  type ContentLanguageCode,
  type PostDraft,
  type RewriteResult,
} from '../schemas';
import { assertCanUse, getQuota, recordQuotaUsage, withUsage, type QuotaState } from '../usage';

/**
 * Writing posts: the first thing in DPOST that costs money, so the order of
 * operations matters.
 *
 *   quota check → build prompt → one model call → quality gate →
 *   one retry for blocked drafts → meter usage → count against the quota
 *
 * The quota is checked before the call and counted after it, so a failed
 * generation never eats someone's monthly allowance.
 */

/** How many recent posts feed the "don't repeat yourself" list. */
const RECENT_POSTS_FOR_CONTEXT = 40;
const MAX_ATTEMPTS = 2;
const TEMPERATURE = 0.85;

export interface GeneratedDraft extends PostDraft {
  /** Problems worth showing the user. Empty when the draft came back clean. */
  warnings: QualityIssue[];
}

export interface GenerationMeta {
  provider: string;
  modelId: string;
  promptVersion: string;
  /** True when a stub produced this instead of a model (never in production). */
  stub: boolean;
}

export interface GenerateDraftsInput {
  request: string;
  language: ContentLanguageCode;
  count: number;
}

export interface GenerateDraftsResult {
  drafts: GeneratedDraft[];
  meta: GenerationMeta;
  quota: QuotaState;
}

interface ModelCall {
  inputTokens: number;
  outputTokens: number;
}

export async function generateDrafts(
  ctx: Context,
  input: GenerateDraftsInput,
): Promise<GenerateDraftsResult> {
  assertCan(ctx.role, 'ai:use');

  const count = Math.min(Math.max(Math.trunc(input.count), 1), MAX_DRAFTS_PER_REQUEST);
  await assertCanUse(ctx, 'aiPosts', count);

  const [{ profile }, brandCard, recent, timezone] = await Promise.all([
    getBrand(ctx),
    getBrandCard(ctx),
    recentPostBodies(ctx),
    workspaceTimezone(ctx),
  ]);

  const quality: QualityContext = {
    language: input.language,
    bannedWords: profile.voice.bannedWords?.value ?? [],
    reference: `${brandCard}\n${input.request}`,
    recentPosts: recent,
  };

  const { model, modelId, provider } = getModel('smart');
  const spend: ModelCall = { inputTokens: 0, outputTokens: 0 };
  let promptVersion = '';

  const ask = async (howMany: number, avoid: string[]): Promise<PostDraft[]> => {
    const { system, prompt, version } = buildPostWriterPrompt({
      brandCard,
      language: input.language,
      count: howMany,
      request: input.request,
      avoidOpeners: avoid,
      today: today(timezone),
    });
    promptVersion = version;

    const result = await generateObject({
      model,
      schema: postDraftsSchema,
      system,
      prompt,
      temperature: TEMPERATURE,
    }).catch((error: unknown) => {
      throw providerError(error);
    });

    spend.inputTokens += result.usage.inputTokens ?? 0;
    spend.outputTokens += result.usage.outputTokens ?? 0;
    return result.object.posts.map(normaliseDraft);
  };

  const drafts = await withUsage(ctx, 'post_writer', async () => {
    const avoid = recent.slice(0, 12).map(opener).filter(Boolean);
    let accepted: GeneratedDraft[] = [];
    let candidates = await ask(count, avoid);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const blocked: PostDraft[] = [];
      for (const draft of candidates) {
        const siblings = [...accepted, ...candidates.filter((other) => other !== draft)];
        const report = checkDraft(draft, quality, siblings);
        if (report.blocked && attempt < MAX_ATTEMPTS) {
          blocked.push(draft);
        } else {
          // Last attempt: keep it, with its problems visible to the user.
          accepted.push({ ...draft, warnings: report.issues });
        }
      }

      if (blocked.length === 0) break;
      candidates = await ask(blocked.length, [
        ...avoid,
        ...accepted.map((draft) => opener(draft.body)),
        ...blocked.map((draft) => opener(draft.body)),
      ]);
    }

    accepted = accepted.slice(0, count);
    return {
      result: accepted,
      usage: { provider, modelId, ...spend },
    };
  });

  await recordQuotaUsage(ctx, 'aiPosts', drafts.length);
  const quota = await getQuota(ctx, 'aiPosts');

  return {
    drafts,
    meta: { provider, modelId, promptVersion, stub: provider === 'stub' },
    quota,
  };
}

export interface RewriteDraftInput {
  action: RewriteAction;
  body: string;
  hashtags: string[];
  cta: string | null;
  language: ContentLanguageCode;
  /** Free text from the owner, when regenerating a post from the calendar. */
  instruction?: string | undefined;
}

export interface RewriteDraftResult {
  post: RewriteResult;
  warnings: QualityIssue[];
  meta: GenerationMeta;
  quota: QuotaState;
}

/**
 * One editing action on a draft the user is already looking at. It costs a
 * model call, so it counts against the same allowance as generating a post —
 * the interface says so before the user spends one.
 */
export async function rewriteDraft(
  ctx: Context,
  input: RewriteDraftInput,
): Promise<RewriteDraftResult> {
  assertCan(ctx.role, 'ai:use');
  await assertCanUse(ctx, 'aiPosts', 1);

  const [{ profile }, brandCard] = await Promise.all([getBrand(ctx), getBrandCard(ctx)]);
  const { model, modelId, provider } = getModel('smart');
  const { system, prompt, version } = buildRewritePrompt({ brandCard, ...input });

  const { post, warnings } = await withUsage(ctx, `rewrite_${input.action}`, async () => {
    const result = await generateObject({
      model,
      schema: rewriteResultSchema,
      system,
      prompt,
      temperature: input.action === 'hashtags' ? 0.4 : 0.7,
    }).catch((error: unknown) => {
      throw providerError(error);
    });

    const rewritten: RewriteResult = {
      body: result.object.body.trim(),
      hashtags: normaliseHashtags(result.object.hashtags),
      cta: result.object.cta?.trim() || null,
    };

    const report = checkDraft(
      {
        ...rewritten,
        idea: 'rewrite',
        contentType: 'promotional',
        language: input.language,
        needsImage: false,
      },
      {
        language: input.language,
        bannedWords: profile.voice.bannedWords?.value ?? [],
        reference: `${brandCard}\n${input.body}`,
      },
    );

    return {
      result: { post: rewritten, warnings: report.issues },
      usage: {
        provider,
        modelId,
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
    };
  });

  await recordQuotaUsage(ctx, 'aiPosts', 1);

  return {
    post,
    warnings,
    meta: { provider, modelId, promptVersion: version, stub: provider === 'stub' },
    quota: await getQuota(ctx, 'aiPosts'),
  };
}

async function recentPostBodies(ctx: Context): Promise<string[]> {
  const posts = await ctx.db.contentPost.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: RECENT_POSTS_FOR_CONTEXT,
    select: { body: true },
  });
  return posts.map((post) => post.body);
}

async function workspaceTimezone(ctx: Context): Promise<string> {
  const workspace = await ctx.db.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { timezone: true },
  });
  return workspace?.timezone ?? 'Asia/Dhaka';
}

/** Today in the workspace's own timezone, so "this week" means something. */
function today(timezone: string): string | undefined {
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: timezone }).format(
      new Date(),
    );
  } catch {
    return undefined;
  }
}

/**
 * Anything the provider throws becomes one honest message. The real error is
 * logged by the route wrapper; the user is told the model didn't answer,
 * not given a stack trace.
 */
function providerError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError('PLATFORM_ERROR', {
    message: "The AI didn't answer. Please try again in a moment.",
    cause: error,
  });
}
