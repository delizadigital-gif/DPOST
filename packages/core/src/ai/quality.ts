import { validatePost } from '../social/facebook/validate';
import type { ContentLanguageCode, PostDraft } from './schemas';

/**
 * The quality gate: everything a schema can't express.
 *
 * A model that returns valid JSON can still write in the wrong language,
 * repeat last week's post, or quote a price nobody gave it. Each check is
 * plain code — cheap, deterministic and testable — and each one either
 * **blocks** (the draft is written again) or **flags** (the draft is kept
 * and the warning is shown to the user).
 *
 * Nothing is silently discarded. After the retries are used up the draft is
 * kept with its warnings attached, because a flawed draft the user can see
 * and fix beats a post that vanished with no explanation.
 */

export type QualityCode =
  'platform' | 'language' | 'banned_phrase' | 'duplicate' | 'repeated_opener' | 'unverified_detail';

export interface QualityIssue {
  code: QualityCode;
  /** `block` sends the draft back to the model; `flag` shows a warning. */
  level: 'block' | 'flag';
  message: string;
}

export interface QualityContext {
  language: ContentLanguageCode;
  /** Words the brand never wants to see, from its voice settings. */
  bannedWords?: string[];
  /** Brand card plus the user's request: the only facts a post may use. */
  reference: string;
  /** Recent post bodies in this workspace, for duplicate and opener checks. */
  recentPosts?: string[];
}

/** Openings and phrases that mark a post as machine-written. */
const BANNED_PHRASES = [
  'unlock the',
  'elevate your',
  'discover the secret',
  "in today's fast-paced world",
  'in todays fast-paced world',
  'are you tired of',
  'look no further',
  'game-changer',
  'game changer',
  'revolutionary',
  'as an ai',
  'language model',
];

/**
 * Bengali *letters* only — deliberately not the whole Bengali block, because
 * that includes the taka sign (৳) and Bengali digits, which appear in English
 * posts written for a Bangladeshi audience all the time.
 */
const BENGALI_SCRIPT = /[অ-হৎড়-য়]/u;
const LATIN_LETTER = /[A-Za-z]/u;
/** Jaccard similarity at or above this counts as the same post. */
const DUPLICATE_THRESHOLD = 0.6;
const OPENER_WORDS = 6;

/** Bengali digits, so "৳ ১২০০" and "1200" compare equal. */
function normaliseDigits(text: string): string {
  return text.replace(/[০-৯]/gu, (digit) => String(digit.codePointAt(0)! - 0x09e6));
}

export function normaliseText(text: string): string {
  return normaliseDigits(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function trigrams(text: string): Set<string> {
  const words = normaliseText(text).split(' ').filter(Boolean);
  if (words.length < 3) return new Set(words.length ? [words.join(' ')] : []);
  const grams = new Set<string>();
  for (let i = 0; i <= words.length - 3; i++) grams.add(words.slice(i, i + 3).join(' '));
  return grams;
}

/** Word-trigram Jaccard: 1 is identical, 0 shares nothing. */
export function similarity(a: string, b: string): number {
  const first = trigrams(a);
  const second = trigrams(b);
  if (first.size === 0 || second.size === 0) return 0;
  let shared = 0;
  for (const gram of first) if (second.has(gram)) shared++;
  return shared / (first.size + second.size - shared);
}

export function opener(text: string): string {
  return normaliseText(text).split(' ').slice(0, OPENER_WORDS).join(' ');
}

/**
 * Whether the text is written in the language that was asked for. Script is
 * the reliable signal: Bangla is a different alphabet, and Banglish is
 * Bangla with no Bengali characters at all.
 */
export function languageMatches(text: string, language: ContentLanguageCode): boolean {
  const hasBengali = BENGALI_SCRIPT.test(text);
  const hasLatin = LATIN_LETTER.test(text);

  switch (language) {
    case 'bn':
      return hasBengali;
    case 'banglish':
      // Any Bengali character means it isn't Banglish. Latin must be present.
      return !hasBengali && hasLatin;
    case 'en':
      return !hasBengali;
    case 'mixed':
      // Mixed has to be mixed: English alone is not what was asked for.
      return hasBengali && hasLatin;
  }
}

/**
 * Details a post states as fact that appear nowhere in the brand profile or
 * the request: prices, phone numbers, percentages, "open until 10pm".
 * These are flagged rather than blocked — the model may have picked up
 * something real from the request in a form we don't recognise, and the
 * owner is the one who knows.
 */
const DETAIL_PATTERNS: { label: string; pattern: RegExp; digits?: RegExp }[] = [
  {
    label: 'a phone number',
    // Bangladeshi mobile numbers, however they are spaced or hyphenated.
    pattern: /(?:\+?88)?\s?01[\d\s-]{8,13}/gu,
    digits: /^(?:88)?01\d{9}$/u,
  },
  { label: 'a price', pattern: /(?:৳|\bTk\.?|\bBDT\b)\s?\d[\d,]*/giu },
  { label: 'a price', pattern: /\b\d[\d,]*\s?(?:taka|টাকা)\b/giu },
  { label: 'a discount', pattern: /\b\d{1,3}\s?%/gu },
];

/**
 * Every number in the reference text, reduced to its digits, so that
 * "01711-223344", "01711 223344" and "৳1,500" all compare as one value.
 */
function referenceNumbers(reference: string): Set<string> {
  const numbers = new Set<string>();
  for (const match of normaliseDigits(reference).matchAll(/\d[\d\s,.-]*\d|\d/gu)) {
    const digits = match[0].replace(/\D/gu, '');
    if (digits) numbers.add(digits);
  }
  return numbers;
}

export function unverifiedDetails(text: string, reference: string): string[] {
  const known = referenceNumbers(reference);
  const found = new Set<string>();

  for (const { label, pattern, digits: shape } of DETAIL_PATTERNS) {
    for (const match of normaliseDigits(text).matchAll(pattern)) {
      const digits = match[0].replace(/\D/gu, '');
      if (!digits) continue;
      // A pattern may match loosely; this is the check that it really is one.
      if (shape && !shape.test(digits)) continue;
      // Compare digits only: "৳1,200", "1200 taka" and "Tk 1200" are one fact.
      if (!known.has(digits)) found.add(`${label} (${match[0].trim()})`);
    }
  }
  return [...found];
}

export interface QualityReport {
  issues: QualityIssue[];
  /** True when the draft should be written again rather than shown. */
  blocked: boolean;
}

export function checkDraft(
  draft: PostDraft,
  context: QualityContext,
  /** Other drafts from the same request, which must differ from each other. */
  siblings: readonly PostDraft[] = [],
): QualityReport {
  const issues: QualityIssue[] = [];
  const body = draft.body;

  const platform = validatePost({ body, hashtags: draft.hashtags });
  for (const issue of platform.issues) {
    issues.push({
      code: 'platform',
      level: issue.level === 'error' ? 'block' : 'flag',
      message: issue.message,
    });
  }

  if (!languageMatches(body, context.language)) {
    issues.push({
      code: 'language',
      level: 'block',
      message: `This came back in the wrong language — ${context.language} was asked for.`,
    });
  }

  const haystack = body.toLowerCase();
  const banned = [...BANNED_PHRASES, ...(context.bannedWords ?? []).map((w) => w.toLowerCase())];
  for (const phrase of banned) {
    if (phrase && haystack.includes(phrase)) {
      issues.push({
        code: 'banned_phrase',
        level: 'block',
        message: `Uses a phrase this brand avoids: “${phrase}”.`,
      });
      break;
    }
  }

  const others = [...(context.recentPosts ?? []), ...siblings.map((post) => post.body)];
  if (others.some((other) => other !== body && similarity(body, other) >= DUPLICATE_THRESHOLD)) {
    issues.push({
      code: 'duplicate',
      level: 'block',
      message: 'This is too close to another post.',
    });
  }

  const thisOpener = opener(body);
  if (thisOpener && others.some((other) => other !== body && opener(other) === thisOpener)) {
    issues.push({
      code: 'repeated_opener',
      level: 'block',
      message: 'This starts exactly like another post.',
    });
  }

  for (const detail of unverifiedDetails(body, context.reference)) {
    issues.push({
      code: 'unverified_detail',
      level: 'flag',
      message: `Mentions ${detail}, which isn't in your Brand Brain. Check it before posting.`,
    });
  }

  return { issues, blocked: issues.some((issue) => issue.level === 'block') };
}
