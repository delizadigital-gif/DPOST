import { describe, expect, it } from 'vitest';
import {
  FACEBOOK_MAX_LENGTH,
  MAX_HASHTAGS,
  RECOMMENDED_MAX_LENGTH,
  SEE_MORE_LENGTH,
  validatePost,
} from './validate';

const codes = (post: Parameters<typeof validatePost>[0]) =>
  validatePost(post).issues.map((issue) => issue.code);

describe('Facebook post rules', () => {
  it('accepts an ordinary post', () => {
    const result = validatePost({
      body: 'Fresh batch out of the kitchen this morning. Order before noon.',
      hashtags: ['homemade', 'dhaka'],
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('refuses an empty post', () => {
    expect(validatePost({ body: '   ' }).ok).toBe(false);
    expect(codes({ body: '' })).toContain('empty');
  });

  it('refuses a post past what Facebook accepts', () => {
    const result = validatePost({ body: 'a'.repeat(FACEBOOK_MAX_LENGTH + 1) });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('over_platform_limit');
  });

  it('warns, but allows, a very long post', () => {
    const result = validatePost({ body: 'a'.repeat(RECOMMENDED_MAX_LENGTH + 1) });
    expect(result.ok).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('too_long');
  });

  it('warns when the feed will hide the end', () => {
    expect(codes({ body: 'a'.repeat(SEE_MORE_LENGTH + 1) })).toContain('see_more');
  });

  it('counts the hashtag line towards the length', () => {
    const body = 'a'.repeat(SEE_MORE_LENGTH - 10);
    expect(codes({ body })).not.toContain('see_more');
    expect(codes({ body, hashtags: ['dhaka', 'homemade'] })).toContain('see_more');
  });

  it('refuses more hashtags than Facebook rewards', () => {
    const hashtags = Array.from({ length: MAX_HASHTAGS + 1 }, (_, index) => `tag${index}`);
    expect(validatePost({ body: 'Post', hashtags }).ok).toBe(false);
  });

  it('nudges at five hashtags without blocking', () => {
    const result = validatePost({ body: 'Post', hashtags: ['a', 'b', 'c', 'd', 'e'] });
    expect(result.ok).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('hashtag_heavy');
  });

  it('refuses a hashtag with a space in it', () => {
    expect(validatePost({ body: 'Post', hashtags: ['home made'] }).ok).toBe(false);
  });

  it('accepts a Bangla hashtag', () => {
    expect(validatePost({ body: 'Post', hashtags: ['ঢাকা'] }).ok).toBe(true);
  });

  it('explains that an image replaces the link preview', () => {
    expect(
      codes({ body: 'See https://example.com', link: 'https://example.com', hasImage: true }),
    ).toContain('link_with_image');
  });
});
