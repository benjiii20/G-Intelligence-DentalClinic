import { addDays, daysBetween, weekdayOf, workingMinutesBetween } from '../data/dates';
import type { Dataset, Request, SourceKey } from '../data/types';
import { firstMissing, missingSource, ok, pct, tooFew, type Filter, type MetricResult } from './core';

/** A request counts as answered quickly if the first reply came within this many working minutes. */
export const FAST_REPLY_MINUTES = 120;

const IG_CHANNELS = new Set(['instagram_dm', 'instagram_bio']);

/** Requests visible with the connected sources. */
export function visibleRequests(data: Dataset): Request[] {
  return data.requests.filter((r) => {
    if (r.channel === 'phone') return data.sources.phone;
    if (IG_CHANNELS.has(r.channel)) return data.sources.instagram;
    if (r.channel === 'email') return data.sources.inbox;
    return data.sources.webform;
  });
}

export function requestsIn(data: Dataset, f: Filter, opts: { online?: boolean } = {}): Request[] {
  return visibleRequests(data).filter((r) => {
    const d = r.receivedAt.slice(0, 10);
    if (d < f.from || d > f.to) return false;
    if (opts.online && r.channel === 'phone') return false;
    if (f.channel && (f.channel === 'none' ? r.source !== null : r.source !== f.channel)) return false;
    return true;
  });
}

export function isFast(r: Request): boolean {
  return !!r.firstReplyAt && workingMinutesBetween(r.receivedAt, r.firstReplyAt) <= FAST_REPLY_MINUTES;
}

/** Online requests: website form, e-mail, English/Russian site and Instagram (not phone). */
export function onlineRequests(data: Dataset, f: Filter): MetricResult {
  const src: SourceKey[] = ['webform'];
  if (!data.sources.webform && !data.sources.inbox && !data.sources.instagram) return missingSource('count', src, 'webform');
  const n = requestsIn(data, f, { online: true }).length;
  return ok(n, 'count', n, ['webform', 'inbox', 'instagram']);
}

export interface ResponseSpeed {
  requests: number;
  fast: number;
  slow: number;
  fastPct: number;
  fastConversionPct: number | null;
  slowConversionPct: number | null;
  /** slow requests × (fast conversion − slow conversion); an estimate */
  missedNewPatients: number | null;
  /** share of slow requests that arrived Friday afternoon or at the weekend */
  slowWeekendPct: number | null;
}

/**
 * Share of online requests with a first reply within 2 working hours, and conversion fast vs slow.
 * For periods shorter than ~3 months the two conversion rates use the 6 months up to the period end.
 */
export function responseSpeed(data: Dataset, f: Filter): MetricResult<ResponseSpeed> {
  const src: SourceKey[] = ['webform', 'inbox'];
  const miss = firstMissing(data, src);
  if (miss) return missingSource('pct', src, miss);
  const list = requestsIn(data, f, { online: true });
  if (!list.length) return tooFew('pct', src);
  const fast = list.filter(isFast);
  const slow = list.filter((r) => !isFast(r));
  const conv = (xs: Request[]) => (xs.length ? pct(xs.filter((r) => r.becamePatientId).length, xs.length) : null);
  // conversion rates need more than one month of requests to be stable: use the 6 months up to the period end
  const span = daysBetween(f.from, f.to);
  const convList = span < 100 ? requestsIn(data, { ...f, from: addDays(f.to, -182) }, { online: true }) : list;
  const fc = conv(convList.filter(isFast));
  const sc = conv(convList.filter((r) => !isFast(r)));
  const weekend = slow.filter((r) => {
    const wd = weekdayOf(r.receivedAt);
    return wd === 0 || wd === 6 || (wd === 5 && +r.receivedAt.slice(11, 13) >= 13);
  });
  return ok(
    {
      requests: list.length,
      fast: fast.length,
      slow: slow.length,
      fastPct: pct(fast.length, list.length),
      fastConversionPct: fc,
      slowConversionPct: sc,
      missedNewPatients: fc !== null && sc !== null ? Math.max(0, (slow.length * (fc - sc)) / 100) : null,
      slowWeekendPct: slow.length ? pct(weekend.length, slow.length) : null,
    },
    'pct',
    list.length,
    src,
  );
}
