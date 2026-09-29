import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { getUnscopedDb } from '@dpost/db';
import { createContext, type Context } from '../../context';
import { createTestWorld, type TestWorld } from '../../testing/fixtures';
import { updateBrandSections } from '../../services/brand';
import { setModelOverride, type ResolvedModel } from '../models';
import { currentPeriodStart } from '../../services/usage';
import { generateDrafts, rewriteDraft } from './post-writer';

/**
 * The generation pipeline against a real database and a fake model: the
 * quota is charged for what was produced, usage is metered, the quality gate
 * gets a second chance at a bad draft, and a workspace's posts never leak
 * into another's prompt.
 */

let world: TestWorld;
let ctx: Context;

/** Queues the JSON each model call should return, in order. */
function respondWith(...payloads: unknown[]): { calls: string[] } {
  const calls: string[] = [];
  let index = 0;

  const model = new MockLanguageModelV4({
    provider: 'test',
    modelId: 'test-model',
    doGenerate: async (options) => {
      calls.push(JSON.stringify(options.prompt));
      const payload = payloads[Math.min(index++, payloads.length - 1)];
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage: {
          inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 200, text: 200, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });

  const resolved: ResolvedModel = { model, modelId: 'test-model', provider: 'anthropic' };
  setModelOverride(() => resolved);
  return { calls };
}

const post = (body: string, overrides: Record<string, unknown> = {}) => ({
  idea: 'An idea',
  body,
  hashtags: ['homemade'],
  cta: 'Inbox us to order',
  contentType: 'promotional',
  language: 'en',
  needsImage: false,
  ...overrides,
});

beforeAll(async () => {
  world = createTestWorld();
  const workspace = await world.createWorkspace();
  ctx = await createContext({
    userId: workspace.ownerId,
    workspaceId: workspace.id,
    emailVerified: true,
    source: 'web',
  });
  await updateBrandSections(
    ctx,
    {
      business: { name: "Rahim's Kitchen", industry: 'Home-made food' },
      preferences: { contact: '01711-223344' },
    },
    'onboarding',
  );
});

afterEach(async () => {
  setModelOverride(undefined);
  const db = getUnscopedDb();
  await db.usageCounter.deleteMany({ where: { workspaceId: ctx.workspaceId } });
  await db.aIUsageEvent.deleteMany({ where: { workspaceId: ctx.workspaceId } });
  await db.contentPost.deleteMany({ where: { workspaceId: ctx.workspaceId } });
});

afterAll(async () => {
  await world.cleanup();
});

describe('generating drafts', () => {
  it('returns what the model wrote, cleaned up', async () => {
    respondWith({
      posts: [
        post('Fresh batch out of the kitchen this morning.', {
          hashtags: ['#Homemade', 'homemade', ' '],
        }),
      ],
    });

    const result = await generateDrafts(ctx, {
      request: 'something for today',
      language: 'en',
      count: 1,
    });

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.body).toBe('Fresh batch out of the kitchen this morning.');
    // The stray "#" and the duplicate are removed before anyone sees them.
    expect(result.drafts[0]?.hashtags).toEqual(['Homemade']);
    expect(result.meta.stub).toBe(false);
    expect(result.meta.promptVersion).toContain('post-writer.v1');
  });

  it('meters the call and charges the quota for what was produced', async () => {
    respondWith({ posts: [post('One.'), post('Two, a different thing entirely.')] });

    const result = await generateDrafts(ctx, { request: '', language: 'en', count: 2 });
    expect(result.drafts).toHaveLength(2);

    const usage = await getUnscopedDb().aIUsageEvent.findFirst({
      where: { workspaceId: ctx.workspaceId },
    });
    expect(usage).toMatchObject({ feature: 'post_writer', model: 'test-model', inputTokens: 1000 });

    const counter = await getUnscopedDb().usageCounter.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        metric: 'ai_posts',
        periodStart: currentPeriodStart(),
      },
    });
    expect(counter?.count).toBe(2);
    expect(result.quota.used).toBe(2);
  });

  it('asks again when the first answer is in the wrong language', async () => {
    const { calls } = respondWith(
      { posts: [post('Fresh batch this morning.')] },
      { posts: [post('আজ সকালে নতুন রান্না হয়েছে।', { language: 'bn' })] },
    );

    const result = await generateDrafts(ctx, { request: '', language: 'bn', count: 1 });

    expect(calls).toHaveLength(2);
    expect(result.drafts[0]?.body).toContain('আজ');
    expect(result.drafts[0]?.warnings).toEqual([]);
  });

  it('keeps a stubborn draft, with its problems attached, rather than losing it', async () => {
    respondWith({ posts: [post('Fresh batch this morning.')] }); // always English

    const result = await generateDrafts(ctx, { request: '', language: 'bn', count: 1 });

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.warnings.map((warning) => warning.code)).toContain('language');
  });

  it('flags a price that is nowhere in the brand profile', async () => {
    respondWith({ posts: [post('Everything at ৳99 this weekend only.')] });

    const result = await generateDrafts(ctx, { request: '', language: 'en', count: 1 });
    const warnings = result.drafts[0]?.warnings ?? [];
    expect(warnings.map((warning) => warning.code)).toContain('unverified_detail');
  });

  it('refuses when the plan has nothing left, without calling the model', async () => {
    const { calls } = respondWith({ posts: [post('Never asked for.')] });
    await getUnscopedDb().usageCounter.create({
      data: {
        workspaceId: ctx.workspaceId,
        metric: 'ai_posts',
        periodStart: currentPeriodStart(),
        count: 30, // the Free plan's monthly allowance
      },
    });

    await expect(
      generateDrafts(ctx, { request: '', language: 'en', count: 1 }),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(calls).toEqual([]);
  });

  it('never puts another workspace’s posts in the prompt', async () => {
    const other = await world.createWorkspace();
    const otherCtx = await createContext({
      userId: other.ownerId,
      workspaceId: other.id,
      emailVerified: true,
      source: 'web',
    });
    await getUnscopedDb().contentPost.create({
      data: {
        workspaceId: other.id,
        body: 'A secret post belonging to another business',
        createdById: other.ownerId,
      },
    });

    const { calls } = respondWith({ posts: [post('Something of our own.')] });
    await generateDrafts(ctx, { request: '', language: 'en', count: 1 });

    expect(calls[0]).not.toContain('secret post');
    expect(calls[0]).toContain("Rahim's Kitchen");
    await getUnscopedDb().contentPost.deleteMany({ where: { workspaceId: other.id } });
    expect(otherCtx.workspaceId).not.toBe(ctx.workspaceId);
  });
});

describe('rewriting a draft', () => {
  it('returns the rewritten post and charges one from the allowance', async () => {
    respondWith({
      body: 'Fresh from the kitchen this morning. Order before noon.',
      hashtags: ['#homemade'],
      cta: 'Inbox us to order',
    });

    const result = await rewriteDraft(ctx, {
      action: 'improve',
      body: 'fresh batch today',
      hashtags: [],
      cta: null,
      language: 'en',
    });

    expect(result.post.body).toContain('Fresh from the kitchen');
    expect(result.post.hashtags).toEqual(['homemade']);
    expect(result.quota.used).toBe(1);

    const usage = await getUnscopedDb().aIUsageEvent.findFirst({
      where: { workspaceId: ctx.workspaceId },
    });
    expect(usage?.feature).toBe('rewrite_improve');
  });

  it('warns when the rewrite comes back in the wrong language', async () => {
    respondWith({ body: 'Still in English', hashtags: [], cta: null });

    const result = await rewriteDraft(ctx, {
      action: 'translate',
      body: 'Fresh batch today',
      hashtags: [],
      cta: null,
      language: 'bn',
    });

    expect(result.warnings.map((warning) => warning.code)).toContain('language');
  });
});
