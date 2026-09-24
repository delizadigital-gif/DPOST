import Link from 'next/link';
import { CalendarCheck, MessageSquareText, Sparkles } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

// Temporary home page for Phase 1. It proves the design tokens and fonts work
// end to end; the full marketing site is built in Phase 14.
const steps = [
  {
    icon: MessageSquareText,
    title: 'Tell it your goal',
    body: '"Promote my Eid collection for 14 days, 2 posts a day."',
  },
  {
    icon: Sparkles,
    title: 'AI plans and writes',
    body: 'On-brand posts and images, in English, Bangla or Banglish.',
  },
  {
    icon: CalendarCheck,
    title: 'You review, it publishes',
    body: 'Approve in one tap. Posts go out on time, every time.',
  },
];

export default function Home() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-spark opacity-15 blur-3xl"
      />

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="DPOST home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" className="h-9 rounded-lg px-3">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="h-9 rounded-lg px-4">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-mint" aria-hidden />
          In development
        </p>
        <h1 className="text-4xl leading-[1.1] font-bold text-balance sm:text-6xl">
          Say what you want to post.{' '}
          <span className="text-spark">DPOST plans it, writes it and posts it.</span>
        </h1>
        <p lang="bn" className="mt-6 text-lg text-muted-foreground sm:text-xl">
          আপনি বলুন কী চান, বাকিটা আমরা করবো।
        </p>

        <ol className="mt-14 grid w-full gap-4 text-left sm:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, index) => (
            <li
              key={title}
              className="rounded-xl border border-border bg-card p-5 transition-transform duration-200 ease-(--ease-out-quint) hover:-translate-y-px"
            >
              <div className="mb-4 inline-flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4" aria-hidden />
              </div>
              <h2 className="text-base font-semibold">
                <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
                {title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} DelizaDigital</span>
        <nav className="flex gap-5">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/data-deletion" className="hover:text-foreground">
            Data deletion
          </Link>
        </nav>
      </footer>
    </main>
  );
}
