import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { getUnscopedDb } from '@dpost/db';
import { createContext, type Context } from '../../context';
import { createTestWorld, type TestWorld } from '../../testing/fixtures';
import { createMemoryStorage, setStorageProvider } from '../../storage';
import { setModelOverride, type ResolvedModel } from '../models';
import { currentPeriodStart } from '../../services/usage';
import { setImageProvider, type ImageProvider } from './provider';
import { generatePostImage, writeImagePrompt } from './pipeline';

/**
 * Making an image for a post: the brief the AI writes, the picture that
 * comes back, and where both end up.
 */

let world: TestWorld;
let ctx: Context;
let storage: ReturnType<typeof createMemoryStorage>;

function respondWith(payload: unknown) {
  const model = new MockLanguageModelV4({
    provider: 'test',
    modelId: 'test-fast',
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: {
        inputTokens: { total: 500, noCache: 500, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 90, text: 90, reasoning: 0 },
      },
      warnings: [],
    }),
  });
  const resolved: ResolvedModel = { model, modelId: 'test-fast', provider: 'anthropic' };
  setModelOverride(() => resolved);
}

const PLAN = {
  prompt: 'A plate of kacchi biryani on a wooden table, warm afternoon light, shot from above.',
  negativePrompt: 'text, letters, logos, watermarks',
  altText: 'A plate of kacchi biryani on a wooden table',
};

beforeAll(async () => {
  world = createTestWorld();
  const workspace = await world.createWorkspace();
  ctx = await createContext({
    userId: workspace.ownerId,
    workspaceId: workspace.id,
    emailVerified: true,
    source: 'web',
  });
});

beforeEach(() => {
  storage = createMemoryStorage();
  setStorageProvider(storage);
});

afterEach(async () => {
  setStorageProvider(undefined);
  setModelOverride(undefined);
  setImageProvider(undefined);
  const db = getUnscopedDb();
  await db.mediaAsset.deleteMany({ where: { workspaceId: ctx.workspaceId } });
  await db.aIUsageEvent.deleteMany({ where: { workspaceId: ctx.workspaceId } });
  await db.usageCounter.deleteMany({ where: { workspaceId: ctx.workspaceId } });
});

afterAll(async () => {
  await world.cleanup();
});

describe('writing the brief', () => {
  it('turns a caption into a description of a scene', async () => {
    respondWith(PLAN);
    const plan = await writeImagePrompt(ctx, {
      postBody: 'Fresh kacchi today, order before noon.',
      aspect: '1:1',
    });

    expect(plan.prompt).toContain('kacchi');
    expect(plan.altText).toBeTruthy();
  });

  it('tells the model to keep words out of the picture', async () => {
    const calls: string[] = [];
    const model = new MockLanguageModelV4({
      provider: 'test',
      modelId: 'test-fast',
      doGenerate: async (options) => {
        calls.push(JSON.stringify(options));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(PLAN) }],
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        };
      },
    });
    setModelOverride(() => ({ model, modelId: 'test-fast', provider: 'anthropic' }));

    await writeImagePrompt(ctx, { postBody: 'Eid collection is here.', aspect: '1:1' });

    // Image models garble writing, Bengali script worst of all, so wording is
    // added afterwards by us — never asked of the model.
    expect(calls[0]).toContain('Never ask for text');
    expect(calls[0]).toContain('Bengali');
  });

  it('meters the call', async () => {
    respondWith(PLAN);
    await writeImagePrompt(ctx, { postBody: 'A post.', aspect: '1:1' });

    const usage = await getUnscopedDb().aIUsageEvent.findFirst({
      where: { workspaceId: ctx.workspaceId },
    });
    expect(usage?.feature).toBe('image_prompt');
  });
});

describe('making the image', () => {
  it('produces a real image file and puts it in the library', async () => {
    respondWith(PLAN);
    const result = await generatePostImage(ctx, { postBody: 'Fresh kacchi today.' });

    expect(result.media.status).toBe('ready');
    expect(result.media.source).toBe('ai');
    expect(result.media.width).toBeGreaterThan(0);
    // The placeholder is labelled, so nobody mistakes it for a photograph.
    expect(result.stub).toBe(true);
    expect(result.provider).toBe('stub');

    const stored = [...storage.objects.values()];
    expect(stored).toHaveLength(2);
    const decoded = await sharp(stored[0]!).metadata();
    expect(decoded.width).toBeGreaterThan(0);
  });

  it('keeps the prompt and the description with the image', async () => {
    respondWith(PLAN);
    const result = await generatePostImage(ctx, { postBody: 'Fresh kacchi today.' });

    expect(result.media.prompt).toBe(PLAN.prompt);
    expect(result.media.altText).toBe(PLAN.altText);
  });

  it('uses the words the owner typed, without asking the model', async () => {
    const model = vi.fn();
    setModelOverride(() => {
      model();
      throw new Error('the model should not be called');
    });

    const result = await generatePostImage(ctx, {
      postBody: 'Anything.',
      prompt: 'A close-up of a cup of tea on a rainy windowsill',
    });

    expect(result.prompt).toContain('rainy windowsill');
    expect(model).not.toHaveBeenCalled();
  });

  it('counts against the image allowance, not the post one', async () => {
    respondWith(PLAN);
    await generatePostImage(ctx, { postBody: 'A post.' });

    const counters = await getUnscopedDb().usageCounter.findMany({
      where: { workspaceId: ctx.workspaceId, periodStart: currentPeriodStart() },
    });
    const images = counters.find((counter) => counter.metric === 'ai_images');
    expect(images?.count).toBe(1);
    expect(counters.find((counter) => counter.metric === 'ai_posts')).toBeUndefined();
  });

  it('refuses when the image allowance is spent', async () => {
    respondWith(PLAN);
    await getUnscopedDb().usageCounter.create({
      data: {
        workspaceId: ctx.workspaceId,
        metric: 'ai_images',
        periodStart: currentPeriodStart(),
        count: 5, // the Free plan's monthly images
      },
    });

    await expect(generatePostImage(ctx, { postBody: 'A post.' })).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
    expect(storage.objects.size).toBe(0);
  });

  it('passes the brief to whichever provider is installed', async () => {
    respondWith(PLAN);
    const seen: string[] = [];
    const fake: ImageProvider = {
      id: 'fake',
      async generate(request) {
        seen.push(request.prompt);
        return {
          bytes: await sharp({
            create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } },
          })
            .png()
            .toBuffer(),
          mimeType: 'image/png',
          provider: 'fake',
          stub: false,
        };
      },
    };
    setImageProvider(fake);

    const result = await generatePostImage(ctx, { postBody: 'Fresh kacchi today.' });
    expect(seen[0]).toBe(PLAN.prompt);
    expect(result.stub).toBe(false);
    expect(result.provider).toBe('fake');
  });
});
