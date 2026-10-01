'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CalendarView, DayKey, DisplayStatus } from '@dpost/core/content';
import { StatusDot } from '@/components/app/status-badge';
import { PostSheet } from '@/components/app/content/post-sheet';
import { postPreviewLine, type PostListItem } from '@/lib/posts';

/**
 * The calendar itself: the month grid, the week columns and the day list all
 * render the same chips, and clicking any of them opens the same sheet.
 *
 * Which period is shown is decided on the server from the URL, so a
 * particular week is a link someone can send to a colleague. Only opening a
 * post is client-side, because that should never cost a page load.
 */

const MAX_CHIPS_PER_DAY = 3;

export interface CalendarGridProps {
  view: CalendarView;
  days: DayKey[];
  /** Posts for each day, already grouped in the workspace's timezone. */
  postsByDay: Record<DayKey, PostListItem[]>;
  /** Times shown on chips, prepared on the server in the workspace's zone. */
  timeLabels: Record<string, string>;
  today: DayKey;
  periodStart: DayKey;
  periodEnd: DayKey;
  pageName: string;
  weekdayNames: string[];
  /** Posts with no date yet, shown in a tray under the grid. */
  unscheduled: PostListItem[];
  /** Connected Pages, for scheduling from the sheet. */
  channels?: { id: string; name: string; status: string }[];
}

export function CalendarGrid({
  view,
  days,
  postsByDay,
  timeLabels,
  today,
  periodStart,
  periodEnd,
  pageName,
  weekdayNames,
  unscheduled,
  channels = [],
}: CalendarGridProps) {
  const t = useTranslations('calendar');
  const [open, setOpen] = useState<PostListItem | null>(null);
  const [expanded, setExpanded] = useState<DayKey | null>(null);

  const chip = (post: PostListItem) => (
    <button
      key={post.id}
      type="button"
      onClick={() => setOpen(post)}
      className="flex w-full items-center gap-1.5 rounded-md border border-border bg-card px-1.5 py-1 text-left text-xs hover:border-brand-400"
    >
      <StatusDot state={post.status as DisplayStatus} />
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {timeLabels[post.id] ?? ''}
      </span>
      <span className="min-w-0 flex-1 truncate">{postPreviewLine(post, 40)}</span>
    </button>
  );

  const dayNumber = (day: DayKey) => Number(day.slice(-2));
  const inPeriod = (day: DayKey) => day >= periodStart && day <= periodEnd;

  return (
    <>
      {view === 'month' ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border">
            {weekdayNames.map((name) => (
              <div
                key={name}
                className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {name}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const posts = postsByDay[day] ?? [];
              const shown = expanded === day ? posts : posts.slice(0, MAX_CHIPS_PER_DAY);
              return (
                <div
                  key={day}
                  // The local day this cell stands for: the tests assert
                  // against it, because "which day is this post on" is the
                  // question the timezone handling has to get right.
                  data-day={day}
                  className={`min-h-24 space-y-1 border-t border-r border-border p-1.5 last:border-r-0 ${
                    inPeriod(day) ? '' : 'bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${
                        day === today
                          ? 'bg-brand-600 font-semibold text-white'
                          : inPeriod(day)
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {dayNumber(day)}
                    </span>
                  </div>
                  {shown.map(chip)}
                  {posts.length > shown.length ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(day)}
                      className="w-full rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t('more', { count: posts.length - shown.length })}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === 'week' ? (
        <div className="grid gap-2 sm:grid-cols-7">
          {days.map((day) => (
            <div key={day} data-day={day} className="rounded-xl border border-border bg-card p-2">
              <div className="mb-2 flex items-baseline gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {weekdayNames[new Date(`${day}T00:00:00Z`).getUTCDay()]}
                </span>
                <span className={`text-sm font-semibold ${day === today ? 'text-brand-600' : ''}`}>
                  {dayNumber(day)}
                </span>
              </div>
              <div className="space-y-1">
                {(postsByDay[day] ?? []).map(chip)}
                {(postsByDay[day] ?? []).length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">{t('nothing')}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {view === 'list' ? (
        <ol className="space-y-4">
          {days
            .filter((day) => (postsByDay[day] ?? []).length > 0)
            .map((day) => (
              <li key={day}>
                <h3 className="mb-2 text-sm font-semibold">
                  {new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'UTC',
                  })}
                  {day === today ? ` · ${t('today')}` : ''}
                </h3>
                <div className="space-y-1.5">{(postsByDay[day] ?? []).map(chip)}</div>
              </li>
            ))}
          {days.every((day) => (postsByDay[day] ?? []).length === 0) ? (
            <li className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              {t('nothingPlanned')}
            </li>
          ) : null}
        </ol>
      ) : null}

      {unscheduled.length > 0 ? (
        <section aria-labelledby="unscheduled" className="mt-6">
          <h2 id="unscheduled" className="mb-2 text-sm font-semibold">
            {t('unscheduledTitle', { count: unscheduled.length })}
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">{t('unscheduledBody')}</p>
          <div className="space-y-1.5">{unscheduled.map(chip)}</div>
        </section>
      ) : null}

      <PostSheet
        post={open}
        pageName={pageName}
        channels={channels}
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
        onChanged={() => undefined}
      />
    </>
  );
}
