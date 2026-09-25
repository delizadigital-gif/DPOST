import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getUnscopedDb } from '@dpost/db';
import { createContext, type Context } from '../context';
import { AppError } from '../lib/errors';
import { createTestWorld, type TestWorld } from '../testing/fixtures';
import {
  addBrandMemory,
  completeOnboarding,
  deleteBrandMemory,
  getBrand,
  getBrandCard,
  getOnboardingStatus,
  updateBrandSection,
  updateBrandSections,
} from './brand';

/**
 * The Brand Brain against a real database: provenance, the version bump the
 * prompt cache depends on, and the isolation rules that keep one workspace's
 * brand out of another's prompts.
 */

let world: TestWorld;
let ctx: Context;
let otherCtx: Context;

beforeAll(async () => {
  world = createTestWorld();
  const workspace = await world.createWorkspace();
  ctx = await createContext({
    userId: workspace.ownerId,
    workspaceId: workspace.id,
    emailVerified: true,
    source: 'web',
  });

  const other = await world.createWorkspace();
  otherCtx = await createContext({
    userId: other.ownerId,
    workspaceId: other.id,
    emailVerified: true,
    source: 'web',
  });
});

afterAll(async () => {
  await world.cleanup();
});

describe('reading and writing the profile', () => {
  it('starts empty, with every section present', async () => {
    const brand = await getBrand(otherCtx);
    expect(brand.version).toBe(0);
    expect(brand.profile.business).toEqual({});
    expect(brand.memories).toEqual([]);
  });

  it('saves an answer with its provenance', async () => {
    const result = await updateBrandSection(
      ctx,
      'business',
      { name: "Rahim's Kitchen", type: 'shop' },
      'onboarding',
    );
    expect(result.changed).toEqual(['name', 'type']);

    const { profile } = await getBrand(ctx);
    expect(profile.business.name?.value).toBe("Rahim's Kitchen");
    expect(profile.business.type?.source).toBe('onboarding');
  });

  it('bumps the version on every change, so prompt caches expire', async () => {
    const before = (await getBrand(ctx)).version;
    await updateBrandSection(ctx, 'business', { industry: 'Home-made food' });
    expect((await getBrand(ctx)).version).toBe(before + 1);
  });

  it('does not bump the version when nothing actually changed', async () => {
    const before = (await getBrand(ctx)).version;
    const result = await updateBrandSection(ctx, 'business', { industry: 'Home-made food' });
    expect(result.changed).toEqual([]);
    expect((await getBrand(ctx)).version).toBe(before);
  });

  it('rejects a value the section does not allow', async () => {
    await expect(updateBrandSection(ctx, 'contentMix', { postsPerWeek: 99 })).rejects.toMatchObject(
      { code: 'VALIDATION' },
    );
  });

  it('never lets the Page analysis overwrite an answer from a person', async () => {
    await updateBrandSection(ctx, 'business', { industry: 'Catering' }, 'user');
    const result = await updateBrandSection(ctx, 'business', { industry: 'Bakery' }, 'analysis');

    expect(result.changed).toEqual([]);
    const { profile } = await getBrand(ctx);
    expect(profile.business.industry?.value).toBe('Catering');
    expect(profile.business.industry?.source).toBe('user');
  });

  it('clears a field when it is set to null', async () => {
    await updateBrandSection(ctx, 'preferences', { callToAction: 'Inbox us' });
    await updateBrandSection(ctx, 'preferences', { callToAction: null });
    const { profile } = await getBrand(ctx);
    expect(profile.preferences.callToAction).toBeUndefined();
  });

  it('writes several sections in one step, as onboarding does', async () => {
    const result = await updateBrandSections(
      ctx,
      {
        audience: { description: 'Working families in Dhaka' },
        offerings: { items: ['Biryani', 'Cakes'] },
      },
      'onboarding',
    );
    expect(result.changed).toEqual(['offerings.items', 'audience.description']);

    const { profile } = await getBrand(ctx);
    expect(profile.offerings.items?.value).toEqual(['Biryani', 'Cakes']);
  });

  it('records the change in the audit log, without the values', async () => {
    await updateBrandSection(ctx, 'voice', { tone: 'friendly' });
    const entry = await getUnscopedDb().auditLog.findFirst({
      where: { workspaceId: ctx.workspaceId, action: 'brand.update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry?.metadata).toMatchObject({ section: 'voice', fields: ['tone'], source: 'user' });
  });
});

describe('memories', () => {
  it('saves one and counts it in the version', async () => {
    const before = (await getBrand(ctx)).version;
    const memory = await addBrandMemory(ctx, {
      content: 'Never call our food cheap',
      category: 'policy',
    });

    expect(memory.source).toBe('settings');
    const brand = await getBrand(ctx);
    expect(brand.version).toBe(before + 1);
    expect(brand.memories[0]?.content).toBe('Never call our food cheap');
  });

  it('refuses an empty one', async () => {
    await expect(addBrandMemory(ctx, { content: '   ', category: 'other' })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('deletes one', async () => {
    const memory = await addBrandMemory(ctx, { content: 'Post at 8pm', category: 'schedule' });
    await deleteBrandMemory(ctx, memory.id);
    const { memories } = await getBrand(ctx);
    expect(memories.map((item) => item.id)).not.toContain(memory.id);
  });

  it('cannot delete a memory belonging to another workspace', async () => {
    const mine = await addBrandMemory(ctx, { content: 'Ours alone', category: 'other' });
    await expect(deleteBrandMemory(otherCtx, mine.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const { memories } = await getBrand(ctx);
    expect(memories.map((item) => item.id)).toContain(mine.id);
  });
});

describe('isolation between workspaces', () => {
  it('keeps one workspace’s brand out of another’s', async () => {
    await updateBrandSection(otherCtx, 'business', { name: 'Different Shop' });

    const mine = await getBrand(ctx);
    const theirs = await getBrand(otherCtx);
    expect(mine.profile.business.name?.value).toBe("Rahim's Kitchen");
    expect(theirs.profile.business.name?.value).toBe('Different Shop');
    expect(theirs.memories).toEqual([]);
  });

  it('builds the card from the workspace in the context only', async () => {
    const card = await getBrandCard(ctx);
    expect(card).toContain("Rahim's Kitchen");
    expect(card).toContain('Never call our food cheap');
    expect(card).not.toContain('Different Shop');
  });

  it('refuses a viewer trying to edit', async () => {
    const viewer = await world.createUser();
    await world.addMember(ctx.workspaceId, viewer.id, 'viewer');
    const viewerCtx = await createContext({
      userId: viewer.id,
      workspaceId: ctx.workspaceId,
      emailVerified: true,
      source: 'web',
    });

    await expect(getBrand(viewerCtx)).resolves.toBeDefined();
    await expect(
      updateBrandSection(viewerCtx, 'business', { name: 'Hijack' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('onboarding status', () => {
  it('is not done until it is completed', async () => {
    expect((await getOnboardingStatus(ctx)).done).toBe(false);

    await completeOnboarding(ctx, { dismissed: true });
    const status = await getOnboardingStatus(ctx);
    expect(status.done).toBe(true);
    expect(status.completedAt).toBeInstanceOf(Date);
  });

  it('keeps the first completion time when called again', async () => {
    const first = (await getOnboardingStatus(ctx)).completedAt;
    await completeOnboarding(ctx);
    expect((await getOnboardingStatus(ctx)).completedAt).toEqual(first);
  });

  it('records whether setup was answered or skipped', async () => {
    const entry = await getUnscopedDb().auditLog.findFirst({
      where: { workspaceId: ctx.workspaceId, action: 'onboarding.complete' },
    });
    expect(entry?.metadata).toMatchObject({ dismissed: true });
  });
});
