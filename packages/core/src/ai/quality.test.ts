import { describe, expect, it } from 'vitest';
import {
  checkDraft,
  languageMatches,
  opener,
  similarity,
  unverifiedDetails,
  type QualityContext,
} from './quality';
import type { PostDraft } from './schemas';

const draft = (body: string, overrides: Partial<PostDraft> = {}): PostDraft => ({
  idea: 'An idea',
  body,
  hashtags: ['homemade'],
  cta: 'Inbox us to order',
  contentType: 'promotional',
  language: 'en',
  needsImage: false,
  ...overrides,
});

const context = (overrides: Partial<QualityContext> = {}): QualityContext => ({
  language: 'en',
  reference: 'Brand: a home kitchen in Dhaka. Contact: 01711-223344. Price range: 250-1500 taka.',
  ...overrides,
});

describe('language checking', () => {
  it('accepts Bengali script for Bangla', () => {
    expect(languageMatches('আজ সকালে রান্না শেষ হলো', 'bn')).toBe(true);
    expect(languageMatches('Fresh batch this morning', 'bn')).toBe(false);
  });

  it('rejects Bengali script for Banglish, which is written in Latin letters', () => {
    expect(languageMatches('Aaj shokale ranna sesh holo', 'banglish')).toBe(true);
    expect(languageMatches('আজ ranna sesh', 'banglish')).toBe(false);
  });

  it('rejects Bangla where English was asked for', () => {
    expect(languageMatches('আজ সকালে', 'en')).toBe(false);
    expect(languageMatches('Fresh batch', 'en')).toBe(true);
  });

  it('requires both scripts for mixed', () => {
    expect(languageMatches('আজ fresh batch এসেছে', 'mixed')).toBe(true);
    expect(languageMatches('Fresh batch today', 'mixed')).toBe(false);
    expect(languageMatches('আজ নতুন এসেছে', 'mixed')).toBe(false);
  });
});

describe('similarity', () => {
  it('sees an identical post', () => {
    const text = 'Fresh biryani out of the kitchen this morning, order before noon';
    expect(similarity(text, text)).toBe(1);
  });

  it('sees a lightly reworded post', () => {
    const first = 'Fresh biryani out of the kitchen this morning, order before noon please';
    const second = 'Fresh biryani out of the kitchen this morning, order before noon today';
    expect(similarity(first, second)).toBeGreaterThan(0.6);
  });

  it('does not confuse two different posts', () => {
    const first = 'Fresh biryani out of the kitchen this morning';
    const second = 'Our packaging changed this month to sealed boxes';
    expect(similarity(first, second)).toBeLessThan(0.2);
  });

  it('ignores punctuation, case and Bengali numerals', () => {
    expect(similarity('Order 5 plates today!', 'order ৫ plates today')).toBe(1);
  });
});

describe('openers', () => {
  it('takes the first six words, normalised', () => {
    expect(opener('Fresh batch, out of the kitchen this morning')).toBe(
      'fresh batch out of the kitchen',
    );
  });
});

describe('unverified details', () => {
  const reference = 'Contact details: 01711-223344. Price range: ৳250–৳1,500.';

  it('accepts a price that is in the brand profile', () => {
    expect(unverifiedDetails('Plates from ৳250 today', reference)).toEqual([]);
  });

  it('flags a price nobody gave us', () => {
    expect(unverifiedDetails('Special today, only ৳99', reference)[0]).toContain('a price');
  });

  it('flags a phone number that is not ours', () => {
    expect(unverifiedDetails('Call 01999-888777 to order', reference)[0]).toContain(
      'a phone number',
    );
  });

  it('accepts our own phone number, however it is written', () => {
    expect(unverifiedDetails('Call 01711 223344 to order', reference)).toEqual([]);
  });

  it('flags an invented discount', () => {
    expect(unverifiedDetails('Get 50% off this week', reference)[0]).toContain('a discount');
  });

  it('matches Bengali numerals against the same fact', () => {
    expect(unverifiedDetails('দাম ২৫০ টাকা', reference)).toEqual([]);
  });
});

describe('the gate', () => {
  it('passes a clean draft', () => {
    const report = checkDraft(draft('Fresh batch out of the kitchen this morning.'), context());
    expect(report.blocked).toBe(false);
    expect(report.issues).toEqual([]);
  });

  it('blocks the wrong language', () => {
    const report = checkDraft(draft('Fresh batch today'), context({ language: 'bn' }));
    expect(report.blocked).toBe(true);
    expect(report.issues[0]?.code).toBe('language');
  });

  it('blocks a phrase the brand bans', () => {
    const report = checkDraft(
      draft('Unlock the taste of home cooking'),
      context({ bannedWords: [] }),
    );
    expect(report.issues.some((issue) => issue.code === 'banned_phrase')).toBe(true);
    expect(report.blocked).toBe(true);
  });

  it('blocks a word the owner asked us never to use', () => {
    const report = checkDraft(
      draft('The cheapest food in Dhaka'),
      context({ bannedWords: ['cheapest'] }),
    );
    expect(report.issues.some((issue) => issue.code === 'banned_phrase')).toBe(true);
  });

  it('blocks a near-duplicate of a recent post', () => {
    const body = 'Fresh biryani out of the kitchen this morning, order before noon please';
    const report = checkDraft(draft(body), context({ recentPosts: [`${body} today`] }));
    expect(report.issues.some((issue) => issue.code === 'duplicate')).toBe(true);
  });

  it('blocks two drafts in the same batch that open identically', () => {
    const first = draft('Fresh batch out of the kitchen this morning. Order before noon.');
    const second = draft('Fresh batch out of the kitchen today. We start at six.');
    const report = checkDraft(second, context(), [first]);
    expect(report.issues.some((issue) => issue.code === 'repeated_opener')).toBe(true);
  });

  it('only flags an invented price, so the owner decides', () => {
    const report = checkDraft(draft('Everything at ৳99 this weekend'), context());
    expect(report.blocked).toBe(false);
    expect(report.issues[0]?.code).toBe('unverified_detail');
    expect(report.issues[0]?.level).toBe('flag');
  });

  it('blocks a post over the platform limit', () => {
    const report = checkDraft(draft('a'.repeat(70_000)), context());
    expect(report.blocked).toBe(true);
    expect(report.issues.some((issue) => issue.code === 'platform')).toBe(true);
  });

  it('flags, but keeps, a post that is merely long', () => {
    const report = checkDraft(draft('word '.repeat(150)), context());
    expect(report.blocked).toBe(false);
    expect(report.issues.some((issue) => issue.code === 'platform')).toBe(true);
  });
});
