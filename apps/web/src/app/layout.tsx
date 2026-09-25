import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Hind_Siliguri, Inter, Noto_Sans_Bengali } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { Providers } from '@/components/providers';
import { cn } from '@/lib/utils';
import './globals.css';

// Self-hosted at build time by next/font: no layout shift and no request to Google at runtime.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});
// Bengali fonts are not preloaded: their unicode-range means the browser only
// downloads them when a page actually contains Bengali text.
const notoBengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  variable: '--font-noto-bengali',
  display: 'swap',
  preload: false,
});
const hindSiliguri = Hind_Siliguri({
  subsets: ['bengali'],
  weight: ['500', '600', '700'],
  variable: '--font-hind-siliguri',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: 'DPOST — Your social media, handled by AI',
    template: '%s · DPOST',
  },
  description:
    'Tell DPOST what you want to post. It plans, writes, designs and schedules your Facebook content in English, Bangla or Banglish.',
  applicationName: 'DPOST',
};

export const viewport: Viewport = {
  themeColor: '#5b3df5',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html>
    // before React hydrates, which would otherwise be reported as a mismatch.
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        inter.variable,
        bricolage.variable,
        notoBengali.variable,
        hindSiliguri.variable,
      )}
    >
      <body>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
