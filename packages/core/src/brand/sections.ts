import { z } from 'zod';

/**
 * The Brand Brain: what DPOST knows about a business, split into six
 * sections. Everything the AI writes is derived from this, so the shapes
 * live here, in one place, and are used by onboarding, the Brand Brain
 * screen, the REST API and (from Phase 8) the Page analysis.
 *
 * Every field is optional except `business.name`. A shop owner who answers
 * three questions should still get usable posts; the AI just has less to
 * work with.
 */

/** Where a value came from. Shown to the user as a provenance tag. */
export const BRAND_SOURCES = ['user', 'onboarding', 'analysis'] as const;
export type BrandSource = (typeof BRAND_SOURCES)[number];
const sourceSchema = z.enum(BRAND_SOURCES);

const shortText = (max: number) => z.string().trim().min(1).max(max);

/**
 * A list of short free-text items (products, locations, interests). Blank
 * entries are dropped rather than rejected, because tag inputs produce them
 * whenever someone presses Enter twice.
 */
const tags = (max: number, itemMax = 80) =>
  z
    .array(z.string().trim().max(itemMax))
    .max(max)
    .transform((items) => items.filter(Boolean));

export const BUSINESS_TYPES = ['shop', 'brand', 'creator', 'service', 'agency', 'other'] as const;
export const TONES = ['friendly', 'professional', 'playful', 'premium', 'bold'] as const;
/** Bangla and Banglish (Bangla written in Latin script) are first-class here. */
export const LANGUAGES = ['en', 'bn', 'banglish'] as const;
export const EMOJI_USE = ['none', 'light', 'moderate', 'heavy'] as const;
export const GOALS = ['sales', 'awareness', 'engagement', 'traffic', 'loyalty'] as const;
export const HASHTAG_STYLES = ['none', 'few', 'many'] as const;

const business = z.object({
  name: shortText(100),
  type: z.enum(BUSINESS_TYPES),
  industry: shortText(60),
  description: z.string().trim().max(600),
});

const offerings = z.object({
  items: tags(20),
  priceRange: z.string().trim().max(60),
});

const audience = z.object({
  description: z.string().trim().max(400),
  locations: tags(10, 60),
  ageRange: z.string().trim().max(40),
  interests: tags(15, 40),
});

const voice = z.object({
  tone: z.enum(TONES),
  languages: z.array(z.enum(LANGUAGES)).min(1).max(LANGUAGES.length),
  emojiUse: z.enum(EMOJI_USE),
  /** Words the AI must never use. Enforced by the quality gate in Phase 6. */
  bannedWords: tags(25, 40),
});

const contentMix = z.object({
  goals: z.array(z.enum(GOALS)).max(GOALS.length),
  postsPerWeek: z.number().int().min(1).max(21),
  /**
   * Content pillars and their share of the plan. Weights are percentages;
   * they are normalised when rendered rather than forced to total 100, so a
   * half-finished edit is still valid data.
   */
  pillars: z
    .array(z.object({ name: shortText(40), weight: z.number().int().min(0).max(100) }))
    .max(8),
});

const preferences = z.object({
  hashtags: z.enum(HASHTAG_STYLES),
  callToAction: z.string().trim().max(120),
  /**
   * Phone number, address or order link. The AI is forbidden from inventing
   * contact details, so this is the only place it can get them.
   */
  contact: z.string().trim().max(200),
});

export const SECTION_VALUES = { business, offerings, audience, voice, contentMix, preferences };

export const BRAND_SECTIONS = Object.keys(SECTION_VALUES) as BrandSectionName[];
export type BrandSectionName = keyof typeof SECTION_VALUES;
export type BrandValues<S extends BrandSectionName> = z.infer<(typeof SECTION_VALUES)[S]>;

export function isBrandSection(value: string): value is BrandSectionName {
  return Object.hasOwn(SECTION_VALUES, value);
}

/** A stored value together with where it came from and when. */
export interface BrandField<T> {
  value: T;
  source: BrandSource;
  updatedAt: string;
}

export type BrandSection<S extends BrandSectionName> = {
  [K in keyof BrandValues<S>]?: BrandField<BrandValues<S>[K]>;
};

export type BrandProfileData = { [S in BrandSectionName]: BrandSection<S> };

/** The wrapper each field is stored in: `{ value, source, updatedAt }`. */
function fieldSchema(value: z.ZodType) {
  return z.object({ value, source: sourceSchema, updatedAt: z.iso.datetime() });
}

/**
 * Reads one stored section, field by field.
 *
 * Whole-object parsing is wrong here: one malformed field (a value written
 * by an older shape, or by a future Page analysis) would blank the entire
 * section. Instead every field is validated on its own and only the bad
 * ones are dropped, so the user never loses more than what actually broke.
 */
export function parseSection<S extends BrandSectionName>(
  section: S,
  stored: unknown,
): BrandSection<S> {
  const result: Record<string, unknown> = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return result as never;

  const shape = SECTION_VALUES[section].shape as Record<string, z.ZodType>;
  for (const [key, raw] of Object.entries(stored as Record<string, unknown>)) {
    const valueSchema = shape[key];
    if (!valueSchema) continue;
    const parsed = fieldSchema(valueSchema).safeParse(raw);
    if (parsed.success) result[key] = parsed.data;
  }
  return result as BrandSection<S>;
}

export function parseProfile(stored: Partial<Record<BrandSectionName, unknown>>): BrandProfileData {
  return Object.fromEntries(
    BRAND_SECTIONS.map((section) => [section, parseSection(section, stored[section])]),
  ) as BrandProfileData;
}

export function emptyProfile(): BrandProfileData {
  return Object.fromEntries(BRAND_SECTIONS.map((section) => [section, {}])) as BrandProfileData;
}

/**
 * What an update accepts: any subset of a section's fields, where `null`
 * means "clear this field". Onboarding sends one or two fields per step and
 * the Brand Brain sends one card at a time, so partial is the normal case.
 */
export function patchSchema<S extends BrandSectionName>(section: S) {
  const shape = SECTION_VALUES[section].shape as Record<string, z.ZodType>;
  return z
    .object(
      Object.fromEntries(
        Object.entries(shape).map(([key, schema]) => [key, schema.nullable().optional()]),
      ),
    )
    .strict();
}

export type BrandPatch<S extends BrandSectionName> = {
  [K in keyof BrandValues<S>]?: BrandValues<S>[K] | null;
};

/**
 * Applies a patch to a stored section.
 *
 * The one rule with teeth: **the user wins over the machine.** A value the
 * person typed is never overwritten by Page analysis (Phase 8) — analysis
 * only fills gaps and updates what it wrote before. Without this, a nightly
 * re-analysis could quietly undo someone's corrections.
 */
export function applyPatch<S extends BrandSectionName>(
  current: BrandSection<S>,
  patch: BrandPatch<S>,
  source: BrandSource,
  now = new Date(),
): { next: BrandSection<S>; changed: string[] } {
  const next: Record<string, unknown> = { ...current };
  const changed: string[] = [];
  const updatedAt = now.toISOString();

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = (current as Record<string, BrandField<unknown> | undefined>)[key];
    if (source === 'analysis' && existing && existing.source !== 'analysis') continue;

    if (value === null) {
      if (!existing) continue;
      delete next[key];
    } else {
      if (existing && JSON.stringify(existing.value) === JSON.stringify(value)) continue;
      next[key] = { value, source, updatedAt };
    }
    changed.push(key);
  }

  return { next: next as BrandSection<S>, changed };
}
