import { MockLanguageModelV4 } from 'ai/test';
import type { ResolvedModel } from './models';
import { CONTENT_TYPES } from './schemas';

/**
 * A deterministic stand-in for the model, for automated tests and for
 * running the app without an API key.
 *
 * It is a real `LanguageModel`, so everything downstream — prompt assembly,
 * the quality gate, metering, quotas, persistence, the interface — runs
 * exactly as it does in production. Only the sentence generation is fake.
 *
 * Two rules keep this honest: the environment schema refuses `stub` in
 * production, and every response says `stub: true`, which the composer
 * shows as a plain warning that no model was involved.
 */

const BASE = {
  en: [
    'Fresh batch out of the kitchen this morning.\n\nWe cook in small lots so nothing sits around. Order before noon and it reaches you warm.',
    'People keep asking what to order for a family of four.\n\nOne large plate, two sides, and something sweet. That is usually enough, and there is always a little left over.',
    'Behind every order there is a kitchen that starts at six in the morning.\n\nThank you for letting us cook for your family this week.',
    'A small thing we changed this month: everything now goes out in sealed boxes.\n\nSame food, but it arrives the way it left our kitchen.',
    'Planning something for the weekend?\n\nTell us how many people and we will suggest what to order. Inbox us any time.',
  ],
  bn: [
    'আজ সকালে রান্না শেষ হলো।\n\nআমরা অল্প করে রান্না করি, তাই কিছুই বাসি থাকে না। দুপুরের আগে অর্ডার করলে গরম গরম পৌঁছে যাবে।',
    'অনেকেই জানতে চান চারজনের জন্য কী নেওয়া ভালো।\n\nএক প্লেট বড়, দুইটা সাইড আর একটা মিষ্টি। সাধারণত এতেই হয়ে যায়।',
    'প্রতিটি অর্ডারের পেছনে সকাল ছয়টায় শুরু হওয়া একটা রান্নাঘর আছে।\n\nএই সপ্তাহে আপনার পরিবারের জন্য রান্না করতে পেরে ভালো লাগলো।',
    'এই মাসে একটা ছোট পরিবর্তন এনেছি — এখন সব খাবার সিল করা বক্সে যায়।\n\nখাবার একই, শুধু যেভাবে রান্নাঘর থেকে বের হয় সেভাবেই পৌঁছায়।',
    'সপ্তাহান্তে কিছু পরিকল্পনা আছে?\n\nকতজন হবেন জানান, আমরা বলে দেবো কী নিলে ভালো হয়। যেকোনো সময় ইনবক্স করুন।',
  ],
  banglish: [
    'Aaj shokale ranna sesh holo.\n\nAmra olpo kore ranna kori, tai kichui bashi thake na. Dupurer age order korle gorom gorom pouche jabe.',
    'Onekei jante chan char jon er jonno ki nile bhalo hoy.\n\nEk plate boro, duita side ar ekta mishti. Sadharonoto etei hoye jay.',
    'Protiti order er pechone shokal choyta y shuru howa ekta rannaghor ache.\n\nEi soptahe apnar poribar er jonno ranna korte pere bhalo laglo.',
    'Ei mashe ekta choto poriborton enechi — ekhon shob khabar seal kora box e jay.\n\nKhabar eki, shudhu package ta better.',
    'Weekend e kichu plan ache?\n\nKotojon hoben janan, amra bole debo ki nile bhalo hobe. Jekono shomoy inbox korun.',
  ],
};

const BODIES: Record<'en' | 'bn' | 'banglish' | 'mixed', string[]> = {
  ...BASE,
  // "Mixed" is Bangla with an English line, the way BD Pages usually post.
  mixed: BASE.bn.map(
    (body, index) => `${body}\n\n${BASE.en[index]?.split('\n')[0] ?? 'Inbox us to order.'}`,
  ),
};

const IDEAS = [
  'Fresh batch today',
  'What to order for four',
  'Behind the kitchen',
  'Packaging change',
  'Weekend planning',
];

function languageFromPrompt(prompt: string): keyof typeof BODIES {
  if (prompt.includes('Write in Banglish')) return 'banglish';
  if (prompt.includes('natural mix of Bangla')) return 'mixed';
  if (prompt.includes('Write in Bangla')) return 'bn';
  return 'en';
}

function countFromPrompt(prompt: string): number {
  const match = /Write (\d+) Facebook post/u.exec(prompt);
  return match ? Number(match[1]) : 1;
}

function promptText(options: { prompt: unknown }): string {
  // The call options carry the conversation; the text parts are all we need.
  return JSON.stringify(options.prompt);
}

function stubResponse(rawPrompt: string) {
  const prompt = rawPrompt.replaceAll('\\n', '\n');
  const isRewrite = prompt.includes('<current_post>');
  const language = languageFromPrompt(prompt);
  const bodies = BODIES[language] ?? BODIES.en!;

  if (isRewrite) {
    const current = /<current_post>\n([\s\S]*?)\n<\/current_post>/u.exec(prompt)?.[1] ?? '';
    const first = current.split('\n')[0] ?? bodies[0]!;
    return {
      body: `${first.trim()}\n\n(Rewritten by the stub provider — no model was called.)`,
      hashtags: ['homemade', 'dhaka'],
      cta: 'Inbox us to order',
    };
  }

  // An image brief asks for a different shape entirely.
  if (prompt.includes('image brief') || prompt.includes('<post>')) {
    return {
      prompt:
        'A plate of home-cooked food on a wooden table by a window, warm afternoon light, shot from just above.',
      negativePrompt: 'text, letters, logos, watermarks, blur',
      altText: 'A plate of home-cooked food on a wooden table',
    };
  }

  const count = Math.min(countFromPrompt(prompt), bodies.length);
  return {
    posts: Array.from({ length: count }, (_, index) => ({
      idea: IDEAS[index] ?? `Stub idea ${index + 1}`,
      body: bodies[index]!,
      hashtags: ['homemade', 'dhaka'],
      cta: index % 2 === 0 ? 'Inbox us to order' : null,
      contentType: CONTENT_TYPES[index % CONTENT_TYPES.length]!,
      language,
      needsImage: index % 2 === 0,
    })),
  };
}

export function createStubModel(): ResolvedModel {
  const model = new MockLanguageModelV4({
    provider: 'stub',
    modelId: 'stub',
    doGenerate: async (options) => {
      const text = JSON.stringify(stubResponse(promptText(options)));
      return {
        content: [{ type: 'text' as const, text }],
        finishReason: { unified: 'stop' as const, raw: 'stub' },
        // Plausible token counts, so metering and the usage tables are
        // exercised too. The estimated cost of the `stub` model is zero.
        usage: {
          inputTokens: { total: 1200, noCache: 1200, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 320, text: 320, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });

  return { model, modelId: 'stub', provider: 'stub' };
}
