import Link from 'next/link';
import { CalendarCheck, Sparkles } from 'lucide-react';
import { Logo } from '@/components/brand/logo';

// Auth pages depend on the request (session, tokens), so they're never prerendered.
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,44rem)]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Link href="/" aria-label="DPOST home" className="w-fit">
          <Logo />
        </Link>
        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <p className="text-xs text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </p>
      </div>
      <BrandPanel />
    </div>
  );
}

/** Decorative preview of the product: a request to the AI and the posts it plans. */
function BrandPanel() {
  const posts = [
    {
      day: 'Mon',
      time: '8:00 PM',
      text: 'Eid collection is here. 12 new designs…',
      tone: 'bg-brand-600',
    },
    {
      day: 'Wed',
      time: '1:00 PM',
      text: 'How to choose the right fabric for summer',
      tone: 'bg-mint',
    },
    {
      day: 'Fri',
      time: '6:30 PM',
      text: 'Which colour should we restock? Vote below',
      tone: 'bg-coral',
    },
  ];
  return (
    <aside aria-hidden className="hidden p-3 lg:block">
      <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl bg-spark p-12 text-white">
        <div className="absolute -right-24 -bottom-24 size-96 rounded-full bg-white/10 blur-2xl" />
        <p className="max-w-md font-heading text-3xl leading-tight font-bold">
          Tell DPOST what you want to post. It plans, writes and schedules it for you.
        </p>

        <div className="relative space-y-4">
          <div className="ml-auto w-fit max-w-sm rounded-2xl rounded-br-md bg-white/95 px-4 py-3 text-sm text-ink-900 shadow-float">
            Promote my Eid collection this week, 3 posts
          </div>
          <div className="w-fit rounded-2xl rounded-bl-md bg-white/15 px-4 py-3 text-sm backdrop-blur">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Sparkles className="size-4" /> Planned 3 posts for this week
            </span>
          </div>
          <ul className="space-y-2.5">
            {posts.map((post) => (
              <li
                key={post.day}
                className="flex items-center gap-3 rounded-xl bg-white/95 p-3 text-sm text-ink-900 shadow-float"
              >
                <span className={`size-9 shrink-0 rounded-lg ${post.tone}`} />
                <span className="min-w-0 flex-1 truncate">{post.text}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-600">
                  <CalendarCheck className="size-3.5" />
                  {post.day} {post.time}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p lang="bn" className="relative text-lg text-white/90">
          আপনি বলুন কী চান, বাকিটা আমরা করবো।
        </p>
      </div>
    </aside>
  );
}
