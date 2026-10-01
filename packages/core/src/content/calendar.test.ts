import { describe, expect, it } from 'vitest';
import {
  addLocalDays,
  calendarRange,
  dayOfWeek,
  groupByLocalDay,
  localDayKey,
  localTimeLabel,
  shiftAnchor,
  startOfLocalDay,
  zonedTimeToUtc,
} from './calendar';

const DHAKA = 'Asia/Dhaka'; // UTC+6, no daylight saving
const LONDON = 'Europe/London'; // UTC+0 / +1, so the awkward cases show up

describe('which day a moment belongs to', () => {
  it('keeps a late-evening Dhaka post on its own day', () => {
    // 23:30 on 5 October in Dhaka is 17:30 UTC the same day.
    expect(localDayKey(new Date('2026-10-05T17:30:00Z'), DHAKA)).toBe('2026-10-05');
  });

  it('puts an early-morning Dhaka post on the right day, not the UTC one', () => {
    // 03:00 on 6 October in Dhaka is 21:00 UTC on the 5th.
    expect(localDayKey(new Date('2026-10-05T21:00:00Z'), DHAKA)).toBe('2026-10-06');
    expect(localDayKey(new Date('2026-10-05T21:00:00Z'), 'UTC')).toBe('2026-10-05');
  });

  it('shows the local clock time, not the UTC one', () => {
    expect(localTimeLabel(new Date('2026-10-05T17:30:00Z'), DHAKA)).toBe('23:30');
    expect(localTimeLabel(new Date('2026-10-05T17:30:00Z'), 'UTC')).toBe('17:30');
  });
});

describe('finding the instant a local day starts', () => {
  it('is 18:00 the evening before, for Dhaka', () => {
    expect(startOfLocalDay('2026-10-06', DHAKA).toISOString()).toBe('2026-10-05T18:00:00.000Z');
  });

  it('is midnight itself in UTC', () => {
    expect(startOfLocalDay('2026-10-06', 'UTC').toISOString()).toBe('2026-10-06T00:00:00.000Z');
  });

  it('handles a zone that changes its clocks', () => {
    // British Summer Time: 1 July is UTC+1, 1 January is UTC+0.
    expect(startOfLocalDay('2026-07-01', LONDON).toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(startOfLocalDay('2026-01-01', LONDON).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('survives the night the clocks go forward', () => {
    // In 2026 the UK moves to BST on 29 March at 01:00.
    expect(startOfLocalDay('2026-03-29', LONDON).toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(zonedTimeToUtc(LONDON, 2026, 3, 29, 12).toISOString()).toBe('2026-03-29T11:00:00.000Z');
  });
});

describe('day arithmetic', () => {
  it('moves across a month boundary', () => {
    expect(addLocalDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addLocalDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('knows the weekday', () => {
    expect(dayOfWeek('2026-10-04')).toBe(0); // a Sunday
    expect(dayOfWeek('2026-10-09')).toBe(5); // a Friday
  });
});

describe('the range a view covers', () => {
  it('pads a month out to whole weeks', () => {
    const range = calendarRange({ view: 'month', anchor: '2026-10-15', timeZone: DHAKA });

    expect(range.periodStart).toBe('2026-10-01');
    expect(range.periodEnd).toBe('2026-10-31');
    // October 2026 starts on a Thursday, so the grid opens on 27 September.
    expect(range.days[0]).toBe('2026-09-27');
    expect(range.days.at(-1)).toBe('2026-10-31');
    expect(range.days.length % 7).toBe(0);
  });

  it('queries from the start of the first local day to the end of the last', () => {
    const range = calendarRange({ view: 'month', anchor: '2026-10-15', timeZone: DHAKA });
    expect(range.from.toISOString()).toBe('2026-09-26T18:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-10-31T18:00:00.000Z');
  });

  it('covers exactly seven days in the week view', () => {
    const range = calendarRange({ view: 'week', anchor: '2026-10-07', timeZone: DHAKA });
    expect(range.days).toHaveLength(7);
    expect(range.days[0]).toBe('2026-10-04'); // the Sunday
    expect(range.days.at(-1)).toBe('2026-10-10');
  });

  it('can start the week on another day', () => {
    const range = calendarRange({
      view: 'week',
      anchor: '2026-10-07',
      timeZone: DHAKA,
      weekStartsOn: 6,
    });
    expect(range.days[0]).toBe('2026-10-03'); // the Saturday
  });

  it('lists the next four weeks', () => {
    const range = calendarRange({ view: 'list', anchor: '2026-10-05', timeZone: DHAKA });
    expect(range.days).toHaveLength(28);
    expect(range.days[0]).toBe('2026-10-05');
  });
});

describe('stepping through periods', () => {
  it('moves a month at a time', () => {
    expect(shiftAnchor('month', '2026-10-15', 1)).toBe('2026-11-15');
    expect(shiftAnchor('month', '2026-01-15', -1)).toBe('2025-12-15');
  });

  it('does not overshoot a short month', () => {
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-28');
  });

  it('moves a week or four at a time for the other views', () => {
    expect(shiftAnchor('week', '2026-10-07', 1)).toBe('2026-10-14');
    expect(shiftAnchor('list', '2026-10-07', -1)).toBe('2026-09-09');
  });
});

describe('grouping posts into days', () => {
  const posts = [
    { id: 'late', plannedFor: new Date('2026-10-05T17:30:00Z') }, // 23:30 Dhaka, 5th
    { id: 'early', plannedFor: new Date('2026-10-05T21:00:00Z') }, // 03:00 Dhaka, 6th
    { id: 'unscheduled', plannedFor: null },
  ];

  it('groups by the local day, not the UTC one', () => {
    const grouped = groupByLocalDay(posts, DHAKA, (post) => post.plannedFor);
    expect(grouped.get('2026-10-05')?.map((post) => post.id)).toEqual(['late']);
    expect(grouped.get('2026-10-06')?.map((post) => post.id)).toEqual(['early']);
  });

  it('would group them differently in another zone', () => {
    const grouped = groupByLocalDay(posts, 'UTC', (post) => post.plannedFor);
    expect(grouped.get('2026-10-05')?.map((post) => post.id)).toEqual(['late', 'early']);
  });

  it('leaves out anything with no date', () => {
    const grouped = groupByLocalDay(posts, DHAKA, (post) => post.plannedFor);
    expect([...grouped.values()].flat().map((post) => post.id)).not.toContain('unscheduled');
  });
});
