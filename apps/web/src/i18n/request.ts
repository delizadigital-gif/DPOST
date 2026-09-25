import { getRequestConfig } from 'next-intl/server';

/**
 * One locale for now. Every visible string lives in `messages/`, so adding
 * Bangla later is a translation job rather than a code change (see
 * docs/01-product-architecture.md: Bangla UI is post-MVP, Bangla *content*
 * is in the MVP).
 */
export const LOCALES = ['en'] as const;
export const DEFAULT_LOCALE = 'en';

export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  messages: (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default,
}));
