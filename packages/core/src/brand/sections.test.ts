import { describe, expect, it } from 'vitest';
import {
  applyPatch,
  BRAND_SECTIONS,
  emptyProfile,
  isBrandSection,
  parseProfile,
  parseSection,
  patchSchema,
  type BrandSection,
} from './sections';

const field = <T>(value: T, source: 'user' | 'onboarding' | 'analysis' = 'onboarding') => ({
  value,
  source,
  updatedAt: '2026-09-01T10:00:00.000Z',
});

describe('section schemas', () => {
  it('accepts what onboarding collects', () => {
    const result = patchSchema('business').safeParse({
      name: "Rahim's Kitchen",
      type: 'shop',
      industry: 'Home-made food',
      description: 'Home-cooked Bangladeshi meals delivered in Dhaka.',
    });
    expect(result.success).toBe(true);
  });

  it('requires a business name to be more than whitespace', () => {
    const result = patchSchema('business').safeParse({ name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects a business type it does not know', () => {
    expect(patchSchema('business').safeParse({ type: 'restaurant' }).success).toBe(false);
  });

  it('rejects fields that are not part of the section', () => {
    const result = patchSchema('business').safeParse({ name: 'Shop', role: 'admin' });
    expect(result.success).toBe(false);
  });

  it('drops blank tags instead of failing on them', () => {
    const result = patchSchema('offerings').parse({ items: ['Biryani', '', '  ', 'Cake'] });
    expect(result.items).toEqual(['Biryani', 'Cake']);
  });

  it('needs at least one language for the voice', () => {
    expect(patchSchema('voice').safeParse({ languages: [] }).success).toBe(false);
    expect(patchSchema('voice').safeParse({ languages: ['bn', 'banglish'] }).success).toBe(true);
  });

  it('keeps the posting rhythm within a week', () => {
    expect(patchSchema('contentMix').safeParse({ postsPerWeek: 0 }).success).toBe(false);
    expect(patchSchema('contentMix').safeParse({ postsPerWeek: 22 }).success).toBe(false);
    expect(patchSchema('contentMix').safeParse({ postsPerWeek: 5 }).success).toBe(true);
  });

  it('allows null to clear a field', () => {
    expect(patchSchema('preferences').safeParse({ callToAction: null }).success).toBe(true);
  });

  it('knows its own section names', () => {
    expect(BRAND_SECTIONS).toContain('voice');
    expect(isBrandSection('voice')).toBe(true);
    expect(isBrandSection('passwords')).toBe(false);
  });
});

describe('reading stored sections', () => {
  it('keeps the good fields when one is malformed', () => {
    const section = parseSection('business', {
      name: field("Rahim's Kitchen"),
      type: field('not-a-type'),
      industry: { value: 'Food', source: 'onboarding' },
    });

    expect(section.name?.value).toBe("Rahim's Kitchen");
    expect(section.type).toBeUndefined();
    expect(section.industry).toBeUndefined();
  });

  it('ignores fields the schema no longer has', () => {
    const section = parseSection('business', { name: field('Shop'), legacyField: field('x') });
    expect(Object.keys(section)).toEqual(['name']);
  });

  it('survives junk in the column', () => {
    expect(parseSection('business', null)).toEqual({});
    expect(parseSection('business', 'broken')).toEqual({});
    expect(parseSection('business', [1, 2])).toEqual({});
  });

  it('returns every section, even for an empty profile', () => {
    expect(Object.keys(parseProfile({}))).toEqual(BRAND_SECTIONS);
    expect(emptyProfile().voice).toEqual({});
  });
});

describe('applying a patch', () => {
  const now = new Date('2026-09-26T09:00:00.000Z');

  it('records provenance and the time of the change', () => {
    const { next, changed } = applyPatch<'business'>({}, { name: 'Shop' }, 'onboarding', now);
    expect(next.name).toEqual({
      value: 'Shop',
      source: 'onboarding',
      updatedAt: '2026-09-26T09:00:00.000Z',
    });
    expect(changed).toEqual(['name']);
  });

  it('reports nothing changed when the value is the same', () => {
    const current: BrandSection<'business'> = { name: field('Shop') };
    const { next, changed } = applyPatch(current, { name: 'Shop' }, 'user', now);
    expect(changed).toEqual([]);
    expect(next.name?.source).toBe('onboarding');
  });

  it('clears a field when it is set to null', () => {
    const current: BrandSection<'business'> = { name: field('Shop'), industry: field('Food') };
    const { next, changed } = applyPatch(current, { industry: null }, 'user', now);
    expect(next.industry).toBeUndefined();
    expect(next.name).toBeDefined();
    expect(changed).toEqual(['industry']);
  });

  it('ignores clearing a field that was never set', () => {
    const { changed } = applyPatch<'business'>({}, { industry: null }, 'user', now);
    expect(changed).toEqual([]);
  });

  it('lets the user overwrite what the Page analysis found', () => {
    const current: BrandSection<'business'> = { industry: field('Catering', 'analysis') };
    const { next } = applyPatch(current, { industry: 'Home-made food' }, 'user', now);
    expect(next.industry?.value).toBe('Home-made food');
    expect(next.industry?.source).toBe('user');
  });

  it('never lets the Page analysis overwrite what the user typed', () => {
    const current: BrandSection<'business'> = { industry: field('Home-made food', 'user') };
    const { next, changed } = applyPatch(current, { industry: 'Catering' }, 'analysis', now);
    expect(next.industry?.value).toBe('Home-made food');
    expect(changed).toEqual([]);
  });

  it('lets the analysis fill a gap and correct itself', () => {
    const current: BrandSection<'business'> = { industry: field('Catering', 'analysis') };
    const filled = applyPatch(
      current,
      { industry: 'Bakery', description: 'Cakes' },
      'analysis',
      now,
    );
    expect(filled.next.industry?.value).toBe('Bakery');
    expect(filled.next.description?.value).toBe('Cakes');
    expect(filled.changed).toEqual(['industry', 'description']);
  });

  it('treats an unchanged list as unchanged', () => {
    const current: BrandSection<'offerings'> = { items: field(['Cake', 'Biryani']) };
    const { changed } = applyPatch(current, { items: ['Cake', 'Biryani'] }, 'user', now);
    expect(changed).toEqual([]);
  });
});
