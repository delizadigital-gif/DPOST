/**
 * Calendar arithmetic in the workspace's own timezone.
 *
 * Everything is stored in UTC, but a shop owner in Dhaka thinks in Dhaka
 * days: a post at 23:30 on the 5th is 17:30 UTC on the 5th, and one at 03:00
 * on the 6th is 21:00 UTC on the *5th* — and must still appear on the 6th.
 * So every boundary here is computed from the local wall clock rather than
 * from UTC midnight.
 *
 * Pure functions, no database and no `Date` mutation, so the edge cases can
 * be tested directly.
 */

export type CalendarView = 'month' | 'week' | 'list';

/** `YYYY-MM-DD`, the key a day is grouped under. */
export type DayKey = string;

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [year, month, day] = formatted.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/** The day a moment falls on, in the given timezone. */
export function localDayKey(date: Date, timeZone: string): DayKey {
  const { year, month, day } = parts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The instant at which a local wall-clock time occurs.
 *
 * Done by guessing UTC, measuring how far the guess lands from the wanted
 * local time, and correcting — twice, because a correction can itself cross
 * a daylight-saving boundary. Bangladesh has no DST today, but the product
 * is meant to travel.
 */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(wanted);

  for (let attempt = 0; attempt < 2; attempt++) {
    const next = new Date(wanted - offsetAt(guess, timeZone));
    if (next.getTime() === guess.getTime()) break;
    guess = next;
  }

  return guess;
}

/** How far ahead of UTC the zone's wall clock is at a given instant, in ms. */
function offsetAt(date: Date, timeZone: string): number {
  const seen = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) => Number(seen.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - date.getTime();
}

/** Start of a local day, as the instant it begins. */
export function startOfLocalDay(dayKey: DayKey, timeZone: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  return zonedTimeToUtc(timeZone, year, month, day, 0, 0);
}

export function addLocalDays(dayKey: DayKey, days: number): DayKey {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  const moved = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return moved.toISOString().slice(0, 10);
}

/** Day of the week for a day key, 0 = Sunday. Independent of any timezone. */
export function dayOfWeek(dayKey: DayKey): number {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function todayKey(timeZone: string, now = new Date()): DayKey {
  return localDayKey(now, timeZone);
}

export interface CalendarRange {
  /** Every day the view shows, in order. */
  days: DayKey[];
  /** The first and last day of the period itself, ignoring padding. */
  periodStart: DayKey;
  periodEnd: DayKey;
  /** The instants to query between: `[from, to)`. */
  from: Date;
  to: Date;
}

export interface RangeOptions {
  view: CalendarView;
  /** Any day inside the period being shown. */
  anchor: DayKey;
  timeZone: string;
  /** 0 = Sunday, 6 = Saturday. Bangladesh's week starts on Sunday. */
  weekStartsOn?: number;
}

/**
 * The days a view covers. A month view is padded out to whole weeks, because
 * a grid with ragged ends is harder to read than one with a few greyed days
 * from the neighbouring months.
 */
export function calendarRange({
  view,
  anchor,
  timeZone,
  weekStartsOn = 0,
}: RangeOptions): CalendarRange {
  const [year, month] = anchor.split('-').map(Number) as [number, number, number];

  let periodStart: DayKey;
  let periodEnd: DayKey;

  if (view === 'month') {
    periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else if (view === 'week') {
    const back = (dayOfWeek(anchor) - weekStartsOn + 7) % 7;
    periodStart = addLocalDays(anchor, -back);
    periodEnd = addLocalDays(periodStart, 6);
  } else {
    // The list view shows the next four weeks from the anchor.
    periodStart = anchor;
    periodEnd = addLocalDays(anchor, 27);
  }

  let firstDay = periodStart;
  let lastDay = periodEnd;
  if (view === 'month') {
    firstDay = addLocalDays(periodStart, -((dayOfWeek(periodStart) - weekStartsOn + 7) % 7));
    lastDay = addLocalDays(periodEnd, (weekStartsOn + 6 - dayOfWeek(periodEnd) + 7) % 7);
  }

  const days: DayKey[] = [];
  for (let day = firstDay; day <= lastDay; day = addLocalDays(day, 1)) days.push(day);

  return {
    days,
    periodStart,
    periodEnd,
    from: startOfLocalDay(firstDay, timeZone),
    // Exclusive: the start of the day after the last one shown.
    to: startOfLocalDay(addLocalDays(lastDay, 1), timeZone),
  };
}

/** Moves a view one period forward or back, for the ‹ › buttons. */
export function shiftAnchor(view: CalendarView, anchor: DayKey, direction: 1 | -1): DayKey {
  const [year, month, day] = anchor.split('-').map(Number) as [number, number, number];
  if (view === 'month') {
    const moved = new Date(Date.UTC(year, month - 1 + direction, 1));
    // Keep the day of the month where possible, so stepping back and forward
    // returns to where you started.
    const lastDay = new Date(
      Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, '0')}-${String(
      Math.min(day, lastDay),
    ).padStart(2, '0')}`;
  }
  return addLocalDays(anchor, direction * (view === 'week' ? 7 : 28));
}

/** Groups anything with a date into local days, keeping the given order. */
export function groupByLocalDay<T>(
  items: readonly T[],
  timeZone: string,
  dateOf: (item: T) => Date | null,
): Map<DayKey, T[]> {
  const grouped = new Map<DayKey, T[]>();
  for (const item of items) {
    const date = dateOf(item);
    if (!date) continue;
    const key = localDayKey(date, timeZone);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
}

/** `14:30` in the workspace's timezone, for a post chip. */
export function localTimeLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
