/**
 * What a Facebook Page post may contain. A pure module with no network and
 * no database, so both the composer (as you type) and the quality gate (on
 * generated drafts) can use exactly the same rules, and Phase 8's publisher
 * can refuse to send something Facebook would reject.
 *
 * The hard limits come from the platform; the softer ones are advice about
 * how the feed actually behaves.
 */

/** Facebook's own maximum for a Page post. Nothing may exceed it. */
export const FACEBOOK_MAX_LENGTH = 63_206;
/** Our own ceiling: past this, a post stops being a post. */
export const RECOMMENDED_MAX_LENGTH = 2_000;
/** Roughly where the feed collapses a post behind "See more". */
export const SEE_MORE_LENGTH = 480;
export const MAX_HASHTAGS = 6;
export const RECOMMENDED_HASHTAGS = 4;

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  /** Stable code, so the UI can translate the message. */
  code:
    | 'empty'
    | 'too_long'
    | 'over_platform_limit'
    | 'too_many_hashtags'
    | 'hashtag_invalid'
    | 'link_with_image'
    | 'see_more'
    | 'hashtag_heavy';
  level: IssueLevel;
  message: string;
}

export interface PostForValidation {
  body: string;
  hashtags?: string[];
  link?: string | null;
  /** Whether the post will carry an image (Phase 9 attaches them). */
  hasImage?: boolean;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/**
 * A hashtag Facebook will actually linkify: letters, digits, underscore.
 * Combining marks count too, or Bangla hashtags (#ঢাকা) would be rejected —
 * the vowel signs are marks, not letters.
 */
const VALID_HASHTAG = /^[\p{L}\p{M}\p{N}_]+$/u;

export function validatePost(post: PostForValidation): ValidationResult {
  const issues: ValidationIssue[] = [];
  const body = post.body.trim();
  const hashtags = post.hashtags ?? [];

  if (!body) {
    issues.push({ code: 'empty', level: 'error', message: 'The post is empty.' });
  }

  // The full post as Facebook counts it: text plus the hashtag line.
  const rendered = [body, hashtags.map((tag) => `#${tag}`).join(' ')].filter(Boolean).join('\n\n');

  if (rendered.length > FACEBOOK_MAX_LENGTH) {
    issues.push({
      code: 'over_platform_limit',
      level: 'error',
      message: `Facebook allows ${FACEBOOK_MAX_LENGTH.toLocaleString()} characters; this post has ${rendered.length.toLocaleString()}.`,
    });
  } else if (rendered.length > RECOMMENDED_MAX_LENGTH) {
    issues.push({
      code: 'too_long',
      level: 'warning',
      message: 'This is very long for a Facebook post. Most readers stop after a few lines.',
    });
  } else if (rendered.length > SEE_MORE_LENGTH) {
    issues.push({
      code: 'see_more',
      level: 'warning',
      message: 'Facebook will hide the end behind “See more”. Put the important part first.',
    });
  }

  if (hashtags.length > MAX_HASHTAGS) {
    issues.push({
      code: 'too_many_hashtags',
      level: 'error',
      message: `Use at most ${MAX_HASHTAGS} hashtags on Facebook.`,
    });
  } else if (hashtags.length > RECOMMENDED_HASHTAGS) {
    issues.push({
      code: 'hashtag_heavy',
      level: 'warning',
      message: `More than ${RECOMMENDED_HASHTAGS} hashtags rarely helps on Facebook.`,
    });
  }

  for (const tag of hashtags) {
    if (!VALID_HASHTAG.test(tag)) {
      issues.push({
        code: 'hashtag_invalid',
        level: 'error',
        message: `“${tag}” can't be a hashtag — letters, numbers and underscores only, no spaces.`,
      });
    }
  }

  // Facebook shows either the link preview or the image, never both, and the
  // image wins. Worth saying before someone wonders where their preview went.
  if (post.link && post.hasImage) {
    issues.push({
      code: 'link_with_image',
      level: 'warning',
      message: 'With an image attached, Facebook shows the image instead of the link preview.',
    });
  }

  return { ok: issues.every((issue) => issue.level !== 'error'), issues };
}
