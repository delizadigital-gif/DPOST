import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  calendarRange,
  getBrand,
  groupByLocalDay,
  listPosts,
  listPostsInRange,
  localTimeLabel,
  shiftAnchor,
  todayKey,
  type CalendarView,
  type DayKey,
} from '@dpost/core';
import { CalendarGrid } from '@/components/app/calendar/calendar-grid';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import { getPageContext } from '@/lib/api/page-context';
import type { PostListItem } from '@/lib/posts';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.calendar');
  return { title: t('title') };
}

const VIEWS: CalendarView[] = ['month', 'week', 'list'];

function parseView(value: string | undefined): CalendarView {
  return VIEWS.includes(value as CalendarView) ? (value as CalendarView) : 'month';
}

function parseAnchor(value: string | undefined, fallback: DayKey): DayKey {
  return value && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : fallback;
}

/**
 * What goes out, and when — in the workspace's own timezone, not the
 * server's. Which period is shown lives in the URL, so a particular week can
 * be bookmarked or sent to someone.
 */
export default async function CalendarPage({ searchParams }: PageProps<'/calendar'>) {
  const ctx = await getPageContext();
  const params = await searchParams;

  const workspace = await ctx.db.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { name: true, timezone: true },
  });
  const timeZone = workspace?.timezone ?? 'Asia/Dhaka';

  const today = todayKey(timeZone);
  const view = parseView(typeof params.view === 'string' ? params.view : undefined);
  const anchor = parseAnchor(typeof params.on === 'string' ? params.on : undefined, today);
  const range = calendarRange({ view, anchor, timeZone });

  const [planned, unplanned, { profile }] = await Promise.all([
    listPostsInRange(ctx, range.from, range.to),
    listPosts(ctx, { scheduled: false, limit: 10 }),
    getBrand(ctx),
  ]);

  const t = await getTranslations('calendar');
  const page = await getTranslations('pages.calendar');

  // Grouping happens on the server, where the workspace timezone lives: a
  // post at 23:30 in Dhaka belongs to that day, whatever the browser thinks.
  const grouped = groupByLocalDay(planned, timeZone, (post) => post.plannedFor);
  const postsByDay: Record<DayKey, PostListItem[]> = {};
  for (const [day, posts] of grouped) {
    postsByDay[day] = JSON.parse(JSON.stringify(posts)) as PostListItem[];
  }
  const timeLabels = Object.fromEntries(
    planned
      .filter((post) => post.plannedFor)
      .map((post) => [post.id, localTimeLabel(post.plannedFor!, timeZone)]),
  );

  const label = new Date(`${range.periodStart}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const href = (nextView: CalendarView, nextAnchor: DayKey) =>
    `/calendar?view=${nextView}&on=${nextAnchor}`;

  const weekdayNames = Array.from({ length: 7 }, (_, index) =>
    new Date(Date.UTC(2026, 1, 1 + index)).toLocaleDateString(undefined, {
      weekday: 'short',
      timeZone: 'UTC',
    }),
  );

  return (
    <>
      <PageHeader title={page('title')} subtitle={page('subtitle')} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="h-9">
          <Link href={href(view, today)}>{t('today')}</Link>
        </Button>
        <Button asChild variant="ghost" size="icon-sm" className="size-9">
          <Link href={href(view, shiftAnchor(view, anchor, -1))} aria-label={t('previous')}>
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="icon-sm" className="size-9">
          <Link href={href(view, shiftAnchor(view, anchor, 1))} aria-label={t('next')}>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Button>
        <h2 className="font-sans text-base font-semibold">{label}</h2>

        <div
          role="group"
          aria-label={t('viewLabel')}
          className="ml-auto flex rounded-lg border border-border bg-card p-0.5"
        >
          {VIEWS.map((option) => (
            <Link
              key={option}
              href={href(option, anchor)}
              aria-current={option === view ? 'true' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                option === view
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`views.${option}`)}
            </Link>
          ))}
        </div>
      </div>

      <CalendarGrid
        view={view}
        days={range.days}
        postsByDay={postsByDay}
        timeLabels={timeLabels}
        today={today}
        periodStart={range.periodStart}
        periodEnd={range.periodEnd}
        pageName={profile.business.name?.value ?? workspace?.name ?? 'DPOST'}
        weekdayNames={weekdayNames}
        unscheduled={JSON.parse(JSON.stringify(unplanned.posts)) as PostListItem[]}
      />
    </>
  );
}
