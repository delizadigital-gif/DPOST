import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeHref, EXTRA_ROUTES, MOBILE_ITEMS, NAV_GROUPS, NAV_ITEMS } from './navigation';

const messages = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../../messages/en.json'), 'utf8'),
) as Record<string, unknown>;

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[part];
    return undefined;
  }, messages);
}

describe('navigation', () => {
  it('has a translation for every label', () => {
    for (const { labelKey } of [...NAV_ITEMS, ...EXTRA_ROUTES]) {
      expect(lookup(labelKey), labelKey).toBeTypeOf('string');
    }
    for (const { labelKey } of NAV_GROUPS) {
      expect(lookup(labelKey), labelKey).toBeTypeOf('string');
    }
  });

  it('has unique links', () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('keeps the mobile tab bar to four items plus More', () => {
    expect(MOBILE_ITEMS.length).toBeLessThanOrEqual(4);
    expect(MOBILE_ITEMS.map((item) => item.href)).toContain('/assistant');
  });

  describe('activeHref', () => {
    it('matches the page itself and its sub-pages', () => {
      expect(activeHref('/calendar')).toBe('/calendar');
      expect(activeHref('/content/plans/abc')).toBe('/content');
    });

    it('prefers the longest match', () => {
      expect(activeHref('/settings/billing')).toBe('/settings');
    });

    it('returns nothing for unrelated paths', () => {
      expect(activeHref('/login')).toBeUndefined();
      expect(activeHref('/contentious')).toBeUndefined();
    });
  });
});
