import { z } from 'zod';
import type { MemoryCategory, MemorySource, Prisma } from '@dpost/db';
import { assertCan } from '../authz/permissions';
import type { Context } from '../context';
import { AppError } from '../lib/errors';
import { renderBrandCard, type MemoryForCard } from '../brand/card';
import {
  applyPatch,
  BRAND_SECTIONS,
  emptyProfile,
  parseProfile,
  parseSection,
  patchSchema,
  type BrandPatch,
  type BrandProfileData,
  type BrandSectionName,
  type BrandSource,
} from '../brand/sections';
import { recordAudit } from './audit';

/**
 * Reading and writing the Brand Brain. Onboarding, the Brand Brain screen,
 * the REST API and (later) the AI's `update_brand_profile` tool all come
 * through here, so validation, provenance and the version bump can't be
 * skipped by any one of them.
 */

/**
 * Each workspace keeps at most this many memories. The cap exists because
 * memories are pasted into prompts: unbounded growth would silently raise
 * the cost of every generation.
 */
export const MAX_MEMORIES = 100;
const MAX_MEMORY_LENGTH = 500;

/** The profile columns, minus `analysis`. Small enough to always read whole. */
const SECTION_SELECT = {
  version: true,
  business: true,
  offerings: true,
  audience: true,
  voice: true,
  contentMix: true,
  preferences: true,
} as const;

export interface BrandMemorySummary {
  id: string;
  content: string;
  category: MemoryCategory;
  source: MemorySource;
  createdAt: Date;
}

export interface BrandOverview {
  profile: BrandProfileData;
  memories: BrandMemorySummary[];
  /** Bumped on every change; the cache key for prompts built from this brand. */
  version: number;
  updatedAt: Date | null;
  /** Page analysis output, from Phase 8. Null until a Page is connected. */
  analysis: Prisma.JsonValue | null;
}

export async function getBrand(ctx: Context): Promise<BrandOverview> {
  assertCan(ctx.role, 'brand:read');

  const [profile, memories] = await Promise.all([
    ctx.db.brandProfile.findUnique({ where: { workspaceId: ctx.workspaceId } }),
    ctx.db.brandMemory.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_MEMORIES,
      select: { id: true, content: true, category: true, source: true, createdAt: true },
    }),
  ]);

  return {
    profile: profile ? parseProfile(profile) : emptyProfile(),
    memories,
    version: profile?.version ?? 0,
    updatedAt: profile?.updatedAt ?? null,
    analysis: profile?.analysis ?? null,
  };
}

/**
 * The exact text the AI will be given for this workspace. It is rendered
 * from stored data by `renderBrandCard`, and the Brand Brain screen shows
 * it verbatim — if a post sounds wrong, the user can see why.
 */
export async function getBrandCard(ctx: Context): Promise<string> {
  const [{ profile, memories }, workspace] = await Promise.all([
    getBrand(ctx),
    ctx.db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { name: true } }),
  ]);
  return renderBrandCard({
    profile,
    memories: memories as MemoryForCard[],
    ...(workspace ? { workspaceName: workspace.name } : {}),
  });
}

export interface UpdateSectionResult {
  version: number;
  /** Field names that actually changed. Empty when the patch was a no-op. */
  changed: string[];
}

/**
 * Updates one section. The patch is validated against that section's schema,
 * merged field by field with provenance, and the profile version is bumped.
 *
 * The write is conditional on the version we just read (`updateMany` with
 * that version in the `where`). Two edits landing at the same moment would
 * otherwise silently drop one; instead the loser retries against fresh data.
 */
export async function updateBrandSection<S extends BrandSectionName>(
  ctx: Context,
  section: S,
  patch: BrandPatch<S>,
  source: BrandSource = 'user',
): Promise<UpdateSectionResult> {
  assertCan(ctx.role, 'brand:update');

  const parsed = patchSchema(section).safeParse(patch);
  if (!parsed.success) {
    throw new AppError('VALIDATION', {
      details: { fields: z.flattenError(parsed.error).fieldErrors },
    });
  }
  const values = parsed.data as BrandPatch<S>;

  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await ctx.db.brandProfile.findUnique({
      where: { workspaceId: ctx.workspaceId },
      select: SECTION_SELECT,
    });

    const current = parseSection(section, existing?.[section]);
    const { next, changed } = applyPatch(current, values, source);
    if (existing && changed.length === 0) return { version: existing.version, changed };

    // A computed key is the whole point here (one service for six sections),
    // and `BrandSectionName` is exactly the set of JSON columns.
    const sectionData = { [section]: next as Prisma.InputJsonValue };

    if (!existing) {
      // First write for this workspace. A duplicate key means another
      // request created the row between our read and insert, so retry.
      try {
        const created = await ctx.db.brandProfile.create({
          data: { workspaceId: ctx.workspaceId, version: 1, ...sectionData },
          select: { version: true },
        });
        await auditChange(ctx, section, changed, source);
        return { version: created.version, changed };
      } catch {
        continue;
      }
    }

    const { count } = await ctx.db.brandProfile.updateMany({
      where: { workspaceId: ctx.workspaceId, version: existing.version },
      data: { ...sectionData, version: existing.version + 1 },
    });
    if (count === 1) {
      await auditChange(ctx, section, changed, source);
      return { version: existing.version + 1, changed };
    }
  }

  throw new AppError('CONFLICT', {
    message: 'Your brand profile was being changed elsewhere. Please try again.',
  });
}

/** Field names only: the audit log records what changed, never the values. */
function auditChange(
  ctx: Context,
  section: string,
  changed: string[],
  source: BrandSource,
): Promise<void> {
  return recordAudit(ctx, {
    action: 'brand.update',
    targetType: 'brand_profile',
    targetId: ctx.workspaceId,
    metadata: { section, fields: changed, source },
  });
}

export interface AddMemoryInput {
  content: string;
  category: MemoryCategory;
  /** `settings` from the Brand Brain screen, `chat` from the AI assistant. */
  source?: MemorySource;
}

export async function addBrandMemory(
  ctx: Context,
  input: AddMemoryInput,
): Promise<BrandMemorySummary> {
  assertCan(ctx.role, 'brand:update');

  const content = input.content.trim();
  if (!content) throw new AppError('VALIDATION', { message: 'Write something to remember.' });
  if (content.length > MAX_MEMORY_LENGTH) {
    throw new AppError('VALIDATION', {
      message: `Keep it under ${MAX_MEMORY_LENGTH} characters — short rules work best.`,
    });
  }

  const count = await ctx.db.brandMemory.count();
  if (count >= MAX_MEMORIES) {
    throw new AppError('CONFLICT', {
      message: `You've saved ${MAX_MEMORIES} memories. Delete one to add another.`,
    });
  }

  const memory = await ctx.db.brandMemory.create({
    data: {
      workspaceId: ctx.workspaceId,
      content,
      category: input.category,
      source: input.source ?? 'settings',
      createdById: ctx.userId,
    },
    select: { id: true, content: true, category: true, source: true, createdAt: true },
  });

  await bumpVersion(ctx);
  await recordAudit(ctx, {
    action: 'brand.memory.add',
    targetType: 'brand_memory',
    targetId: memory.id,
    metadata: { category: memory.category, source: memory.source },
  });
  return memory;
}

export async function deleteBrandMemory(ctx: Context, id: string): Promise<void> {
  assertCan(ctx.role, 'brand:update');

  // `deleteMany` rather than `delete`: it is scoped to this workspace, so an
  // ID from another workspace deletes nothing instead of throwing.
  const { count } = await ctx.db.brandMemory.deleteMany({ where: { id } });
  if (count === 0) throw new AppError('NOT_FOUND', { message: "That memory doesn't exist." });

  await bumpVersion(ctx);
  await recordAudit(ctx, {
    action: 'brand.memory.delete',
    targetType: 'brand_memory',
    targetId: id,
  });
}

/**
 * Memories are part of the brand card, so adding or removing one has to
 * invalidate the prompt cache exactly as a profile edit does.
 */
async function bumpVersion(ctx: Context): Promise<void> {
  const { count } = await ctx.db.brandProfile.updateMany({
    where: { workspaceId: ctx.workspaceId },
    data: { version: { increment: 1 } },
  });
  if (count === 0) {
    await ctx.db.brandProfile
      .create({ data: { workspaceId: ctx.workspaceId, version: 1 } })
      .catch(() => undefined);
  }
}

export interface OnboardingStatus {
  completedAt: Date | null;
  /** True once the welcome wizard has been finished or dismissed. */
  done: boolean;
}

export async function getOnboardingStatus(ctx: Context): Promise<OnboardingStatus> {
  assertCan(ctx.role, 'workspace:read');
  const workspace = await ctx.db.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { onboardingCompletedAt: true },
  });
  const completedAt = workspace?.onboardingCompletedAt ?? null;
  return { completedAt, done: completedAt !== null };
}

/**
 * Marks the welcome wizard as finished. `dismissed` records that the user
 * chose to skip rather than answer — both end the redirect to onboarding,
 * but only one of them means "the AI has what it needs".
 */
export async function completeOnboarding(
  ctx: Context,
  { dismissed = false }: { dismissed?: boolean } = {},
): Promise<void> {
  assertCan(ctx.role, 'workspace:update');

  const { completedAt } = await getOnboardingStatus(ctx);
  if (completedAt) return;

  await ctx.db.workspace.update({
    where: { id: ctx.workspaceId },
    data: { onboardingCompletedAt: new Date() },
  });
  await recordAudit(ctx, {
    action: 'onboarding.complete',
    targetType: 'workspace',
    targetId: ctx.workspaceId,
    metadata: { dismissed },
  });
}

/**
 * Updates several sections in one call, which is what an onboarding step
 * does (audience and offerings are one question to the user, two sections
 * to us). Sections are written one at a time; a failure part-way leaves the
 * earlier sections saved, which is the right trade here — every field is
 * independently valid, and losing answers someone already typed is worse.
 */
export async function updateBrandSections(
  ctx: Context,
  patches: { [S in BrandSectionName]?: BrandPatch<S> },
  source: BrandSource = 'user',
): Promise<UpdateSectionResult> {
  let version = 0;
  const changed: string[] = [];

  for (const section of BRAND_SECTIONS) {
    const patch = patches[section];
    if (!patch) continue;
    const result = await updateBrandSection(ctx, section, patch, source);
    version = result.version;
    changed.push(...result.changed.map((field) => `${section}.${field}`));
  }

  return { version, changed };
}
