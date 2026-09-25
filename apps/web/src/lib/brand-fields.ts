import {
  BUSINESS_TYPES,
  EMOJI_USE,
  GOALS,
  HASHTAG_STYLES,
  LANGUAGES,
  TONES,
  type BrandSectionName,
} from '@dpost/core/brand';

/**
 * How each brand field is shown and edited. One description, two readers:
 * the Brand Brain cards render from it, and the edit dialog builds its form
 * from it. A new field is added to the zod schema in `@dpost/core` and to
 * this list, and it appears in both places — there is no third copy to
 * forget.
 */

export type FieldKind = 'text' | 'longtext' | 'tags' | 'choice' | 'multi' | 'number' | 'pillars';

export interface FieldConfig {
  key: string;
  kind: FieldKind;
  /** Allowed values for `choice` and `multi`, in display order. */
  options?: readonly string[];
  /** Which `options.*` translation group holds the labels. */
  optionSet?: string;
  maxLength?: number;
  maxItems?: number;
  min?: number;
  max?: number;
}

export const SECTION_FIELDS: Record<BrandSectionName, readonly FieldConfig[]> = {
  business: [
    { key: 'name', kind: 'text', maxLength: 100 },
    { key: 'type', kind: 'choice', options: BUSINESS_TYPES, optionSet: 'businessType' },
    { key: 'industry', kind: 'text', maxLength: 60 },
    { key: 'description', kind: 'longtext', maxLength: 600 },
  ],
  offerings: [
    { key: 'items', kind: 'tags', maxItems: 20, maxLength: 80 },
    { key: 'priceRange', kind: 'text', maxLength: 60 },
  ],
  audience: [
    { key: 'description', kind: 'longtext', maxLength: 400 },
    { key: 'locations', kind: 'tags', maxItems: 10, maxLength: 60 },
    { key: 'ageRange', kind: 'text', maxLength: 40 },
    { key: 'interests', kind: 'tags', maxItems: 15, maxLength: 40 },
  ],
  voice: [
    { key: 'tone', kind: 'choice', options: TONES, optionSet: 'tone' },
    { key: 'languages', kind: 'multi', options: LANGUAGES, optionSet: 'language' },
    { key: 'emojiUse', kind: 'choice', options: EMOJI_USE, optionSet: 'emoji' },
    { key: 'bannedWords', kind: 'tags', maxItems: 25, maxLength: 40 },
  ],
  contentMix: [
    { key: 'goals', kind: 'multi', options: GOALS, optionSet: 'goal' },
    { key: 'postsPerWeek', kind: 'number', min: 1, max: 21 },
    { key: 'pillars', kind: 'pillars', maxItems: 8 },
  ],
  preferences: [
    { key: 'hashtags', kind: 'choice', options: HASHTAG_STYLES, optionSet: 'hashtags' },
    { key: 'callToAction', kind: 'text', maxLength: 120 },
    { key: 'contact', kind: 'text', maxLength: 200 },
  ],
};

/** The order the cards appear in, roughly "who you are" → "how you sound". */
export const SECTION_ORDER: readonly BrandSectionName[] = [
  'business',
  'offerings',
  'audience',
  'voice',
  'contentMix',
  'preferences',
];

export interface Pillar {
  name: string;
  weight: number;
}

export function isPillarList(value: unknown): value is Pillar[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Pillar).name === 'string' &&
        typeof (item as Pillar).weight === 'number',
    )
  );
}
