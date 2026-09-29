import type { ContentLanguageCode } from '../schemas';
import { FACEBOOK_RULES, FACEBOOK_RULES_VERSION } from './facebook.v1';
import { SYSTEM_PROMPT, SYSTEM_PROMPT_VERSION } from './system.v1';

/**
 * Assembles the post-writing prompt, always in the same order, most stable
 * first:
 *
 *   [1] system rules · [2] platform rules · [3] brand card · [4] memories
 *   [5] task + output shape · [6] what to avoid · [7] the user's request
 *
 * Layers [1] and [2] are constant and [3] changes only when the brand does,
 * so a provider can cache the front of the prompt between calls. The parts
 * that change every time sit at the end.
 */

export const POST_WRITER_VERSION = `post-writer.v1+${SYSTEM_PROMPT_VERSION}+${FACEBOOK_RULES_VERSION}`;

const LANGUAGE_INSTRUCTIONS: Record<ContentLanguageCode, string> = {
  en: 'Write in English.',
  bn: 'Write in Bangla, in Bengali script. Natural spoken Bangla as people write on Facebook, not formal or literary Bangla. Do not mix in English words unless they are the words Bangladeshis actually use (for example "delivery", "order", "inbox").',
  banglish:
    'Write in Banglish: Bangla words spelled in Latin letters, the way people type on Facebook ("Eid er notun collection eshe geche"). Do not use any Bengali script characters.',
  mixed:
    'Write in a natural mix of Bangla (Bengali script) and English, the way Bangladeshi businesses usually post — a Bangla sentence with English words where they fit.',
};

export interface PostWriterInput {
  /** The brand card, rendered by `renderBrandCard`. */
  brandCard: string;
  language: ContentLanguageCode;
  count: number;
  /** What the user asked for, verbatim. May be empty. */
  request: string;
  /** Openers from recent posts, so the model doesn't repeat itself. */
  avoidOpeners?: string[];
  /** Today's date in the workspace's timezone, so "this week" means something. */
  today?: string;
}

export function buildPostWriterPrompt(input: PostWriterInput): {
  system: string;
  prompt: string;
  version: string;
} {
  const system = [SYSTEM_PROMPT, FACEBOOK_RULES].join('\n\n---\n\n');

  const sections: string[] = [];

  // [3] + [4]: the brand card already contains the selected memories.
  sections.push(`<brand_data>\n${input.brandCard.trim()}\n</brand_data>`);

  // [5] task
  sections.push(
    [
      `Write ${input.count} Facebook post${input.count === 1 ? '' : 's'} for this business.`,
      LANGUAGE_INSTRUCTIONS[input.language],
      input.count > 1
        ? 'Each post must be about a different idea and start differently from the others. Vary the content types.'
        : '',
      "For each post give: a short label for the idea (in English, for the owner's list), the post text itself, up to 4 hashtags without the # sign, a call to action if one fits, the content type, the language you wrote in, and whether the post would work better with a photo.",
      'Do not number the posts or add titles inside the post text.',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  // [6] dynamic context
  if (input.today) sections.push(`Today is ${input.today}.`);
  if (input.avoidOpeners?.length) {
    sections.push(
      `These are the openings of recent posts by this business. Do not start any post the same way:\n${input.avoidOpeners
        .map((opener) => `- ${opener}`)
        .join('\n')}`,
    );
  }

  // [7] the request
  sections.push(
    input.request.trim()
      ? `The owner asked for this:\n<user_request>\n${input.request.trim()}\n</user_request>`
      : 'The owner did not ask for anything specific, so choose ideas that suit the business and would be useful to its customers this week.',
  );

  return { system, prompt: sections.join('\n\n'), version: POST_WRITER_VERSION };
}

export const REWRITE_ACTIONS = [
  'improve',
  'shorten',
  'lengthen',
  'translate',
  'hashtags',
  'cta',
] as const;
export type RewriteAction = (typeof REWRITE_ACTIONS)[number];

const ACTION_INSTRUCTIONS: Record<RewriteAction, string> = {
  improve:
    'Rewrite the post so it reads better and sounds more like this business. Keep its meaning, its facts and roughly its length. Do not add any fact that is not already there.',
  shorten:
    'Make the post shorter — aim for about half its current length — keeping the main point, the offer and the call to action. Do not drop a price or a date that is already there.',
  lengthen:
    'Make the post a little longer with one concrete, useful detail that is already implied by the brand information. Do not invent facts.',
  translate: 'Rewrite the same post in the requested language. Keep the meaning and the details.',
  hashtags:
    'Keep the post text exactly as it is. Replace the hashtags with up to 4 that a customer of this business might actually search for.',
  cta: 'Keep the post text as it is, apart from its ending. Give it one clear call to action that suits this business, using only contact details that appear in the brand information.',
};

export interface RewriteInput {
  brandCard: string;
  action: RewriteAction;
  body: string;
  hashtags: string[];
  cta: string | null;
  language: ContentLanguageCode;
}

export function buildRewritePrompt(input: RewriteInput): {
  system: string;
  prompt: string;
  version: string;
} {
  const system = [SYSTEM_PROMPT, FACEBOOK_RULES].join('\n\n---\n\n');

  const current = [
    `<current_post>`,
    input.body.trim(),
    input.hashtags.length ? `\nHashtags: ${input.hashtags.join(', ')}` : '',
    input.cta ? `Call to action: ${input.cta}` : '',
    `</current_post>`,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = [
    `<brand_data>\n${input.brandCard.trim()}\n</brand_data>`,
    current,
    ACTION_INSTRUCTIONS[input.action],
    LANGUAGE_INSTRUCTIONS[input.language],
    'Return the whole post: its text, its hashtags without the # sign, and its call to action.',
  ].join('\n\n');

  return { system, prompt, version: `rewrite.v1+${SYSTEM_PROMPT_VERSION}` };
}
