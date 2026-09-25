import type { MemoryCategory } from '@dpost/db';
import type { BrandProfileData, BrandSection, BrandSectionName } from './sections';

/**
 * The brand card: the compact text description of a business that gets
 * pasted into every AI prompt.
 *
 * It is a **pure function**, not an LLM call. The card is built from the
 * same profile on every generation, so it can be cached against
 * `brand.version` and, more importantly, a bad post can always be traced
 * back to the exact text the model was given. An LLM summarising the
 * profile would add cost, latency and a second thing that can hallucinate.
 *
 * Budget: roughly 600–900 tokens with a full profile.
 */

export interface MemoryForCard {
  content: string;
  category: MemoryCategory;
  createdAt: Date;
}

/** Categories that change what the AI may write, so they are never dropped. */
const ALWAYS_INCLUDED: ReadonlySet<MemoryCategory> = new Set(['policy', 'voice']);
const MAX_MEMORIES = 25;

const LABELS = {
  type: {
    shop: 'Shop',
    brand: 'Brand',
    creator: 'Creator',
    service: 'Service business',
    agency: 'Agency',
    other: 'Business',
  },
  tone: {
    friendly: 'friendly and warm',
    professional: 'professional and clear',
    playful: 'playful and light',
    premium: 'premium and refined',
    bold: 'bold and direct',
  },
  language: { en: 'English', bn: 'Bangla', banglish: 'Banglish (Bangla in Latin script)' },
  emoji: {
    none: 'no emoji',
    light: 'the occasional emoji',
    moderate: 'a few emoji per post',
    heavy: 'plenty of emoji',
  },
  goal: {
    sales: 'drive sales',
    awareness: 'build awareness',
    engagement: 'get conversations going',
    traffic: 'send people to the website',
    loyalty: 'keep existing customers close',
  },
  hashtags: { none: 'no hashtags', few: '2–4 relevant hashtags', many: '8–12 hashtags' },
} as const;

/** Reads a field's value, ignoring its provenance. */
function value<S extends BrandSectionName, K extends keyof BrandSection<S>>(
  section: BrandSection<S>,
  key: K,
): NonNullable<BrandSection<S>[K]>['value'] | undefined {
  return section[key]?.value;
}

function label<T extends string>(map: Record<T, string>, key: T | undefined): string | undefined {
  return key ? map[key] : undefined;
}

function list(items: readonly string[] | undefined): string | undefined {
  const cleaned = items?.map((item) => item.trim()).filter(Boolean);
  return cleaned?.length ? cleaned.join(', ') : undefined;
}

/** Joins the parts of one line, dropping the ones we have no answer for. */
function line(label: string, parts: (string | undefined)[]): string | undefined {
  const present = parts.filter((part): part is string => Boolean(part));
  return present.length ? `${label}: ${present.join(' · ')}` : undefined;
}

/**
 * Pillars as percentages. Weights are normalised at render time so that a
 * profile someone edited by hand ("40, 30, 20") still reads sensibly.
 */
function pillarLine(pillars: { name: string; weight: number }[] | undefined): string | undefined {
  const usable = pillars?.filter((pillar) => pillar.name.trim() && pillar.weight > 0) ?? [];
  if (usable.length === 0) return undefined;
  const total = usable.reduce((sum, pillar) => sum + pillar.weight, 0);
  const parts = usable.map(
    (pillar) => `${pillar.name} ${Math.round((pillar.weight / total) * 100)}%`,
  );
  return `Content mix: ${parts.join(', ')}`;
}

/**
 * Chooses which memories reach the prompt. Policy and voice rules always
 * make it in (they are the ones a customer complains about); the rest fill
 * the remaining slots, newest first.
 */
export function selectMemories(memories: readonly MemoryForCard[]): MemoryForCard[] {
  const byNewest = [...memories].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const required = byNewest.filter((memory) => ALWAYS_INCLUDED.has(memory.category));
  const rest = byNewest.filter((memory) => !ALWAYS_INCLUDED.has(memory.category));
  return [...required, ...rest].slice(0, MAX_MEMORIES);
}

export interface BrandCardInput {
  profile: BrandProfileData;
  memories?: readonly MemoryForCard[];
  /** Used for the "posts about" framing when the business has no name yet. */
  workspaceName?: string;
}

/**
 * Renders the brand card. Sections with no answers are left out entirely —
 * an empty heading would only invite the model to invent content for it.
 */
export function renderBrandCard({ profile, memories = [], workspaceName }: BrandCardInput): string {
  const { business, offerings, audience, voice, contentMix, preferences } = profile;
  const name = value(business, 'name') ?? workspaceName;
  const lines: (string | undefined)[] = [];

  lines.push(`# Brand${name ? `: ${name}` : ''}`);
  lines.push(
    line('Business', [
      label(LABELS.type, value(business, 'type')),
      value(business, 'industry'),
      list(value(audience, 'locations')),
    ]),
  );
  lines.push(
    value(business, 'description') ? `About: ${value(business, 'description')}` : undefined,
  );

  lines.push(line('Sells', [list(value(offerings, 'items')), value(offerings, 'priceRange')]));
  lines.push(
    line('Customers', [
      value(audience, 'description'),
      value(audience, 'ageRange'),
      list(value(audience, 'interests')),
    ]),
  );

  lines.push(
    line('Voice', [
      label(LABELS.tone, value(voice, 'tone')),
      label(LABELS.emoji, value(voice, 'emojiUse')),
    ]),
  );
  const languages = value(voice, 'languages')?.map((code) => LABELS.language[code]);
  lines.push(line('Writes in', [list(languages)]));

  const goals = value(contentMix, 'goals')?.map((goal) => LABELS.goal[goal]);
  lines.push(line('Goals', [list(goals)]));
  const postsPerWeek = value(contentMix, 'postsPerWeek');
  lines.push(postsPerWeek ? `Posting rhythm: about ${postsPerWeek} posts per week` : undefined);
  lines.push(pillarLine(value(contentMix, 'pillars')));

  lines.push(
    line('Post style', [
      label(LABELS.hashtags, value(preferences, 'hashtags')),
      value(preferences, 'callToAction')
        ? `usual call to action: "${value(preferences, 'callToAction')}"`
        : undefined,
    ]),
  );
  // Explicitly framed as the only source of contact details, because the
  // system prompt forbids inventing them.
  const contact = value(preferences, 'contact');
  lines.push(contact ? `Contact details (use only these): ${contact}` : undefined);

  const banned = list(value(voice, 'bannedWords'));
  lines.push(banned ? `Never use these words: ${banned}` : undefined);

  const selected = selectMemories(memories);
  if (selected.length > 0) {
    lines.push('Remember:');
    for (const memory of selected) lines.push(`- ${memory.content.trim()}`);
  }

  return lines.filter((entry): entry is string => Boolean(entry)).join('\n');
}
