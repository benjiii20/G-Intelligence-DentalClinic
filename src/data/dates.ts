import { OPENING } from './types';

// All dates are naive strings; we use UTC internally so no time zone can shift a day.

export function toDate(s: string): Date {
  const y = +s.slice(0, 4);
  const m = +s.slice(5, 7) - 1;
  const d = s.length >= 10 ? +s.slice(8, 10) : 1;
  const hh = s.length >= 13 ? +s.slice(11, 13) : 0;
  const mm = s.length >= 16 ? +s.slice(14, 16) : 0;
  return new Date(Date.UTC(y, m, d, hh, mm));
}

export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
export const isoDateTime = (d: Date): string => d.toISOString().slice(0, 16);
export const monthOf = (s: string): string => s.slice(0, 7);
export const dayOf = (s: string): string => s.slice(0, 10);

export function addDays(s: string, n: number): string {
  const d = toDate(s.slice(0, 10));
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

export function addMonths(month: string, n: number): string {
  const y = +month.slice(0, 4);
  const m = +month.slice(5, 7) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}

export const monthStart = (month: string): string => `${month}-01`;

export function monthEnd(month: string): string {
  const y = +month.slice(0, 4);
  const m = +month.slice(5, 7);
  return isoDate(new Date(Date.UTC(y, m, 0)));
}

/** 0 = Sunday … 6 = Saturday */
export const weekdayOf = (s: string): number => toDate(s.slice(0, 10)).getUTCDay();

export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b.slice(0, 10)).getTime() - toDate(a.slice(0, 10)).getTime()) / 86400000);
}

export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let m = first;
  let guard = 0;
  while (m <= last && guard++ < 600) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

export function daysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from.slice(0, 10);
  const end = to.slice(0, 10);
  let guard = 0;
  while (d <= end && guard++ < 5000) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export const inRange = (date: string, from: string, to: string): boolean => {
  const d = date.slice(0, 10);
  return d >= from.slice(0, 10) && d <= to.slice(0, 10);
};

export const overlaps = (aFrom: string, aTo: string, bFrom: string, bTo: string): boolean =>
  aFrom.slice(0, 10) <= bTo.slice(0, 10) && bFrom.slice(0, 10) <= aTo.slice(0, 10);

/** Working minutes (practice opening hours) between two date-times. */
export function workingMinutesBetween(from: string, to: string): number {
  if (to <= from) return 0;
  let total = 0;
  let day = from.slice(0, 10);
  const lastDay = to.slice(0, 10);
  const fromMin = +from.slice(11, 13) * 60 + +from.slice(14, 16);
  const toMin = +to.slice(11, 13) * 60 + +to.slice(14, 16);
  let guard = 0;
  while (day <= lastDay && guard++ < 400) {
    const open = OPENING[weekdayOf(day)];
    if (open) {
      let start = open[0] * 60;
      let end = open[1] * 60;
      if (day === from.slice(0, 10)) start = Math.max(start, fromMin);
      if (day === lastDay) end = Math.min(end, toMin);
      if (end > start) total += end - start;
    }
    day = addDays(day, 1);
  }
  return total;
}

/** Add working minutes to a date-time, skipping closed hours. */
export function addWorkingMinutes(from: string, minutes: number): string {
  let day = from.slice(0, 10);
  let cur = +from.slice(11, 13) * 60 + +from.slice(14, 16);
  let left = minutes;
  let guard = 0;
  while (guard++ < 400) {
    const open = OPENING[weekdayOf(day)];
    if (open) {
      const start = Math.max(open[0] * 60, cur);
      const end = open[1] * 60;
      if (end > start) {
        if (left <= end - start) {
          const t = start + left;
          return `${day}T${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.round(t % 60)).padStart(2, '0')}`;
        }
        left -= end - start;
      }
    }
    day = addDays(day, 1);
    cur = 0;
  }
  return `${day}T08:00`;
}

export const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`;
