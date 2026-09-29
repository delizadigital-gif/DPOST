/**
 * The golden set: ten briefs, run against the real model, printed with the
 * quality gate's verdict on each post.
 *
 * Run it by hand after changing a prompt — automated tests can prove the
 * pipeline works, but only reading the output tells you whether the writing
 * got better or worse.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... pnpm ai:golden
 *
 * It calls a real API and costs real money (a few US cents per run). It does
 * not touch the database, the quotas or any workspace.
 */
import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { getAiEnv } from '@dpost/config';
import { renderBrandCard } from '../src/brand/card';
import { applyPatch, emptyProfile, type BrandProfileData } from '../src/brand/sections';
import { buildPostWriterPrompt } from '../src/ai/prompts/post-writer.v1';
import { checkDraft } from '../src/ai/quality';
import { normaliseDraft, postDraftsSchema, type ContentLanguageCode } from '../src/ai/schemas';
import { estimateCostMicros } from '../src/ai/usage';

const AT = new Date('2026-09-01T10:00:00.000Z');

function buildProfile(): BrandProfileData {
  const profile = emptyProfile();
  const sections = {
    business: {
      name: "Rahim's Kitchen",
      type: 'shop',
      industry: 'Home-made food',
      description: 'Home-cooked Bangladeshi meals, cooked to order and delivered the same day.',
    },
    offerings: { items: ['Biryani', 'Kacchi', 'Cakes', 'Catering'], priceRange: '৳250–৳1,500' },
    audience: {
      description: 'Working families and office staff in Dhaka who want home-style food',
      locations: ['Dhanmondi, Dhaka', 'Mohammadpur, Dhaka'],
    },
    voice: {
      tone: 'friendly',
      languages: ['bn', 'banglish'],
      emojiUse: 'moderate',
      bannedWords: ['cheap'],
    },
    contentMix: { goals: ['sales', 'engagement'], postsPerWeek: 5 },
    preferences: { hashtags: 'few', callToAction: 'Inbox us to order', contact: '01711-223344' },
  } as const;

  for (const [section, patch] of Object.entries(sections)) {
    const key = section as keyof BrandProfileData;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile[key] = applyPatch({}, patch as any, 'onboarding', AT).next as any;
  }
  return profile;
}

const BRIEFS: { request: string; language: ContentLanguageCode }[] = [
  { request: 'Promote our Eid collection', language: 'bn' },
  { request: 'Promote our Eid collection', language: 'banglish' },
  { request: 'A post about how we cook fresh every morning', language: 'bn' },
  { request: 'Ask customers what they want us to cook next week', language: 'mixed' },
  { request: 'Announce free delivery in Dhanmondi this Friday', language: 'bn' },
  { request: 'A tip about storing home-cooked food', language: 'en' },
  { request: 'Introduce our catering service for small offices', language: 'en' },
  { request: '', language: 'bn' },
  { request: 'Thank our customers after a busy week', language: 'banglish' },
  { request: 'Promote kacchi for a family weekend lunch', language: 'mixed' },
];

async function main() {
  const env = getAiEnv();
  if (!env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY to run the golden set. Nothing was called.');
    process.exit(1);
  }

  const profile = buildProfile();
  const brandCard = renderBrandCard({ profile });
  const model = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(env.LLM_MODEL_SMART);

  let inputTokens = 0;
  let outputTokens = 0;
  let flagged = 0;
  let blocked = 0;
  let total = 0;

  console.log(`Model: ${env.LLM_MODEL_SMART}\n`);

  for (const [index, brief] of BRIEFS.entries()) {
    const { system, prompt } = buildPostWriterPrompt({
      brandCard,
      language: brief.language,
      count: 2,
      request: brief.request,
    });

    const result = await generateObject({
      model,
      schema: postDraftsSchema,
      system,
      prompt,
      temperature: 0.85,
    });

    inputTokens += result.usage.inputTokens ?? 0;
    outputTokens += result.usage.outputTokens ?? 0;

    console.log(`\n${'='.repeat(70)}`);
    console.log(`${index + 1}. [${brief.language}] ${brief.request || '(no brief)'}`);

    for (const raw of result.object.posts) {
      const draft = normaliseDraft(raw);
      const report = checkDraft(draft, {
        language: brief.language,
        bannedWords: ['cheap'],
        reference: `${brandCard}\n${brief.request}`,
      });
      total++;
      if (report.blocked) blocked++;
      else if (report.issues.length > 0) flagged++;

      const verdict = report.blocked ? 'BLOCKED' : report.issues.length ? 'flagged' : 'ok';
      console.log(`\n--- ${draft.idea} [${verdict}] ---`);
      console.log(draft.body);
      if (draft.hashtags.length) console.log(draft.hashtags.map((tag) => `#${tag}`).join(' '));
      if (draft.cta) console.log(`CTA: ${draft.cta}`);
      for (const issue of report.issues) console.log(`  ! ${issue.level}: ${issue.message}`);
    }
  }

  const cost =
    Number(estimateCostMicros(env.LLM_MODEL_SMART, inputTokens, outputTokens)) / 1_000_000;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${total} posts · ${blocked} blocked · ${flagged} flagged`);
  console.log(`${inputTokens} input tokens, ${outputTokens} output tokens`);
  console.log(
    `Estimated cost: US$${cost.toFixed(4)} (about US$${(cost / total).toFixed(5)} a post)`,
  );
  console.log('Cost is an estimate from MODEL_PRICING; check the provider’s pricing page.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
