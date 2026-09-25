import { describe, expect, it } from 'vitest';
import { renderBrandCard, selectMemories, type MemoryForCard } from './card';
import { applyPatch, emptyProfile, type BrandProfileData } from './sections';

const AT = new Date('2026-09-01T10:00:00.000Z');

function profileWith(
  parts: Partial<{ [S in keyof BrandProfileData]: Record<string, unknown> }>,
): BrandProfileData {
  const profile = emptyProfile();
  for (const [section, patch] of Object.entries(parts)) {
    const key = section as keyof BrandProfileData;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile[key] = applyPatch({}, patch as any, 'onboarding', AT).next as any;
  }
  return profile;
}

const fullProfile = profileWith({
  business: {
    name: "Rahim's Kitchen",
    type: 'shop',
    industry: 'Home-made food',
    description: 'Home-cooked Bangladeshi meals, cooked to order and delivered the same day.',
  },
  offerings: { items: ['Biryani', 'Kacchi', 'Cakes'], priceRange: '৳250–৳1,500' },
  audience: {
    description: 'Working families and office staff who want home-style food',
    locations: ['Dhanmondi, Dhaka', 'Mohammadpur, Dhaka'],
    ageRange: '25–45',
    interests: ['food delivery', 'family dinners'],
  },
  voice: {
    tone: 'friendly',
    languages: ['bn', 'banglish'],
    emojiUse: 'moderate',
    bannedWords: ['cheap', 'guaranteed'],
  },
  contentMix: {
    goals: ['sales', 'engagement'],
    postsPerWeek: 5,
    pillars: [
      { name: 'Food photos', weight: 40 },
      { name: 'Cooking tips', weight: 30 },
      { name: 'Offers', weight: 30 },
    ],
  },
  preferences: {
    hashtags: 'few',
    callToAction: 'Inbox us to order',
    contact: '01711-000000 · Road 7, Dhanmondi',
  },
});

const memories: MemoryForCard[] = [
  {
    content: 'Friday posts should mention Jummah Mubarak',
    category: 'schedule',
    createdAt: new Date('2026-09-10T10:00:00.000Z'),
  },
  {
    content: 'Never say our food is cheap — say "value for money"',
    category: 'policy',
    createdAt: new Date('2026-09-02T10:00:00.000Z'),
  },
];

describe('brand card', () => {
  it('renders a full profile', () => {
    expect(renderBrandCard({ profile: fullProfile, memories })).toMatchInlineSnapshot(`
      "# Brand: Rahim's Kitchen
      Business: Shop · Home-made food · Dhanmondi, Dhaka, Mohammadpur, Dhaka
      About: Home-cooked Bangladeshi meals, cooked to order and delivered the same day.
      Sells: Biryani, Kacchi, Cakes · ৳250–৳1,500
      Customers: Working families and office staff who want home-style food · 25–45 · food delivery, family dinners
      Voice: friendly and warm · a few emoji per post
      Writes in: Bangla, Banglish (Bangla in Latin script)
      Goals: drive sales, get conversations going
      Posting rhythm: about 5 posts per week
      Content mix: Food photos 40%, Cooking tips 30%, Offers 30%
      Post style: 2–4 relevant hashtags · usual call to action: "Inbox us to order"
      Contact details (use only these): 01711-000000 · Road 7, Dhanmondi
      Never use these words: cheap, guaranteed
      Remember:
      - Never say our food is cheap — say "value for money"
      - Friday posts should mention Jummah Mubarak"
    `);
  });

  it('renders what little a skipped onboarding leaves', () => {
    const profile = profileWith({ business: { name: 'Nusrat Crafts' } });
    expect(renderBrandCard({ profile })).toMatchInlineSnapshot(`"# Brand: Nusrat Crafts"`);
  });

  it('leaves out every section with no answers', () => {
    const profile = profileWith({
      business: { name: 'Shop' },
      voice: { tone: 'bold', languages: ['en'] },
    });
    const card = renderBrandCard({ profile });
    expect(card).not.toContain('Sells');
    expect(card).not.toContain('Customers');
    expect(card).not.toContain('Content mix');
    expect(card).toContain('Voice: bold and direct');
  });

  it('falls back to the workspace name before the business is named', () => {
    const card = renderBrandCard({ profile: emptyProfile(), workspaceName: "Nusrat's workspace" });
    expect(card).toBe("# Brand: Nusrat's workspace");
  });

  it('normalises pillar weights that do not add up to 100', () => {
    const profile = profileWith({
      contentMix: {
        pillars: [
          { name: 'Product', weight: 3 },
          { name: 'Tips', weight: 1 },
        ],
      },
    });
    expect(renderBrandCard({ profile })).toContain('Content mix: Product 75%, Tips 25%');
  });

  it('ignores pillars with no weight', () => {
    const profile = profileWith({
      contentMix: {
        pillars: [
          { name: 'Product', weight: 100 },
          { name: 'Unused', weight: 0 },
        ],
      },
    });
    expect(renderBrandCard({ profile })).toContain('Content mix: Product 100%');
  });

  it('is deterministic, so prompts can be cached by brand version', () => {
    const first = renderBrandCard({ profile: fullProfile, memories });
    const second = renderBrandCard({ profile: fullProfile, memories });
    expect(first).toBe(second);
  });

  it('stays inside its prompt budget with a full profile', () => {
    // ~4 characters per token: a full card should stay well under 900 tokens.
    expect(renderBrandCard({ profile: fullProfile, memories }).length).toBeLessThan(3600);
  });
});

describe('choosing memories for the prompt', () => {
  const memory = (content: string, category: MemoryForCard['category'], day: number) => ({
    content,
    category,
    createdAt: new Date(Date.UTC(2026, 8, day)),
  });

  it('keeps all of them while there are few', () => {
    const list = [memory('a', 'other', 1), memory('b', 'voice', 2)];
    expect(selectMemories(list)).toHaveLength(2);
  });

  it('caps the list at 25', () => {
    const list = Array.from({ length: 40 }, (_, index) => memory(`m${index}`, 'other', 1));
    expect(selectMemories(list)).toHaveLength(25);
  });

  it('keeps every rule about what may be said, however old', () => {
    const list = [
      ...Array.from({ length: 30 }, (_, index) => memory(`recent ${index}`, 'other', 20)),
      memory('never call it cheap', 'policy', 1),
      memory('always sign off with our tagline', 'voice', 1),
    ];
    const selected = selectMemories(list).map((item) => item.content);
    expect(selected).toContain('never call it cheap');
    expect(selected).toContain('always sign off with our tagline');
  });

  it('prefers the newest of the rest', () => {
    const list = [memory('old', 'other', 1), memory('new', 'other', 20)];
    expect(selectMemories(list)[0]?.content).toBe('new');
  });
});
