import { addDays, monthOf } from '../data/dates';
import type { AdSpend, Channel, Dataset, District, SourceKey } from '../data/types';
import { CHANNELS, DISTRICTS } from '../data/types';
import { firstMissing, indexOf, missingSource, ok, pct, sum, tooFew, type Filter, type MetricResult } from './core';
import { isFast, requestsIn } from './requests';
import { newPatientIds } from './revenue';

const PVS: SourceKey[] = ['pvs'];
const SIX_MONTHS_DAYS = 183;

/**
 * Value of a new patient in the first 6 months: average revenue of new patients in their
 * first 6 months, calculated from all history (only patients whose 6 months are complete).
 */
export function newPatientValue6m(data: Dataset, opts: { channel?: Channel; district?: District } = {}): MetricResult {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const ix = indexOf(data);
  const latestFirst = addDays(ix.dataEnd, -SIX_MONTHS_DAYS);
  let total = 0;
  let n = 0;
  for (const p of data.patients) {
    const first = ix.firstVisit.get(p.id);
    if (!first || first < ix.dataStart || first > latestFirst) continue;
    if (opts.channel && p.channel !== opts.channel) continue;
    if (opts.district && p.district !== opts.district) continue;
    const visits = ix.byPatient.get(p.id);
    if (!visits?.length) continue;
    const until = addDays(first, SIX_MONTHS_DAYS);
    total += sum(visits.filter((a) => a.at.slice(0, 10) <= until).map((a) => a.billed));
    n++;
  }
  if (!n) return tooFew('eur', PVS);
  return ok(total / n, 'eur', n, PVS);
}

/** Average billed amount of a new patient's very first visit (all history). */
export function firstVisitValue(data: Dataset): MetricResult {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const ix = indexOf(data);
  let total = 0;
  let n = 0;
  for (const [id, visits] of ix.byPatient) {
    const first = ix.firstVisit.get(id);
    if (!first || first < ix.dataStart) continue;
    total += visits[0].billed;
    n++;
  }
  if (!n) return tooFew('eur', PVS);
  return ok(total / n, 'eur', n, PVS);
}

export interface ChannelRow {
  channel: Channel;
  requests: number | null; // null = request source not connected
  newPatients: number;
  conversionPct: number | null;
  adSpend: number | null;
}
export interface ChannelTable {
  rows: ChannelRow[];
  newPatients: number;
  noSource: number;
  noSourcePct: number | null;
}

const AD_CHANNEL: Record<AdSpend['platform'], Channel> = { google_ads: 'google', meta_ads: 'instagram' };

function spendIn(data: Dataset, f: Filter, platform: AdSpend['platform']): number | null {
  if (platform === 'google_ads' && !data.sources.google_ads) return null;
  if (platform === 'meta_ads' && !data.sources.instagram) return null;
  const rows = data.adSpend.filter((s) => s.platform === platform && s.month >= monthOf(f.from) && s.month <= monthOf(f.to));
  return rows.length ? sum(rows.map((r) => r.spend)) : null;
}

/** Channel conversion: new patients ÷ requests, per channel. */
export function channelTable(data: Dataset, f: Filter): MetricResult<ChannelTable> {
  if (firstMissing(data, PVS)) return missingSource('count', PVS, 'pvs');
  const ix = indexOf(data);
  const fresh = newPatientIds(data, { from: f.from, to: f.to, district: f.district, payer: f.payer });
  const reqs = requestsIn(data, { from: f.from, to: f.to });
  const anyRequestSource = data.sources.webform || data.sources.inbox || data.sources.instagram || data.sources.phone;
  const rows = CHANNELS.map((channel): ChannelRow => {
    const np = fresh.filter((id) => ix.patient.get(id)?.channel === channel).length;
    const hidden = (channel === 'instagram' && !data.sources.instagram) || !anyRequestSource;
    const rq = hidden ? null : reqs.filter((r) => r.source === channel).length;
    const spend = channel === 'google' ? spendIn(data, f, 'google_ads') : channel === 'instagram' ? spendIn(data, f, 'meta_ads') : null;
    return { channel, requests: rq, newPatients: np, conversionPct: rq ? pct(np, rq) : null, adSpend: spend };
  });
  const noSource = fresh.filter((id) => !ix.patient.get(id)?.channel).length;
  return ok(
    { rows, newPatients: fresh.length, noSource, noSourcePct: fresh.length ? pct(noSource, fresh.length) : null },
    'count',
    fresh.length,
    ['pvs', 'webform', 'inbox', 'instagram', 'phone'],
  );
}

export interface AdsReturn {
  spend: number;
  newPatients: number;
  costPerNewPatient: number | null;
  /** new patients × typical 6-month value of this channel's patients ÷ spend (an estimate from history) */
  returnPerEuro: number | null;
  valuePerPatient6m: number | null;
}

/** Cost per new patient and return within 6 months for a paid channel. */
export function adsReturn(data: Dataset, f: Filter, platform: AdSpend['platform'] = 'google_ads'): MetricResult<AdsReturn> {
  const need: SourceKey = platform === 'google_ads' ? 'google_ads' : 'instagram';
  const src: SourceKey[] = ['pvs', need];
  const miss = firstMissing(data, src);
  if (miss) return missingSource('eur', src, miss);
  const spend = spendIn(data, f, platform);
  if (spend === null || spend <= 0) return tooFew('eur', src);
  const ix = indexOf(data);
  const channel = AD_CHANNEL[platform];
  const np = newPatientIds(data, { from: f.from, to: f.to }).filter((id) => ix.patient.get(id)?.channel === channel).length;
  const value = newPatientValue6m(data, { channel }).value;
  return ok(
    {
      spend,
      newPatients: np,
      costPerNewPatient: np ? spend / np : null,
      returnPerEuro: np && value !== null ? (np * value) / spend : null,
      valuePerPatient6m: value,
    },
    'eur',
    np,
    src,
  );
}

export interface DistrictRow {
  district: District;
  newPatients: number;
  value6m: number | null;
  aboveAverage: boolean;
}

/** New patients by district, with the typical 6-month value of new patients from that district. */
export function districtTable(data: Dataset, f: Filter): MetricResult<DistrictRow[]> {
  if (firstMissing(data, PVS)) return missingSource('count', PVS, 'pvs');
  const ix = indexOf(data);
  const fresh = newPatientIds(data, { from: f.from, to: f.to, channel: f.channel });
  const overall = newPatientValue6m(data).value;
  const rows = DISTRICTS.map((district): DistrictRow => {
    const v = newPatientValue6m(data, { district });
    const value6m = v.value !== null && !v.small ? v.value : null;
    return {
      district,
      newPatients: fresh.filter((id) => ix.patient.get(id)?.district === district).length,
      value6m,
      aboveAverage: value6m !== null && overall !== null && value6m > overall * 1.15,
    };
  }).sort((a, b) => b.newPatients - a.newPatients);
  return ok(rows, 'count', fresh.length, PVS);
}

export interface ChannelFunnel {
  requests: number;
  answeredFast: number;
  newPatients: number;
  cameTwice: number;
  /** index of the step with the largest relative loss (1 = requests→fast, 2 = →patients, 3 = →second visit) */
  biggestDrop: number | null;
}

/** Funnel of one channel: requests → answered within 2 hours → became patients → came a second time. */
export function channelFunnel(data: Dataset, f: Filter, channel: Channel): MetricResult<ChannelFunnel> {
  const src: SourceKey[] = ['pvs', 'webform', 'inbox'];
  if (firstMissing(data, PVS)) return missingSource('count', src, 'pvs');
  const ix = indexOf(data);
  const reqs = requestsIn(data, { from: f.from, to: f.to, channel });
  if (!reqs.length) return tooFew('count', src);
  const fast = reqs.filter(isFast).length;
  const converted = reqs.filter((r) => r.becamePatientId);
  const twice = converted.filter((r) => (ix.byPatient.get(r.becamePatientId!)?.length ?? 0) >= 2).length;
  const steps = [reqs.length, fast, converted.length, twice];
  // biggest relative loss between requests→patients and patients→second visit (speed is a parallel step)
  const lossToPatient = 1 - converted.length / reqs.length;
  const lossToSecond = converted.length ? 1 - twice / converted.length : 0;
  const lossFast = 1 - fast / reqs.length;
  const losses = [lossFast, lossToPatient, lossToSecond];
  const biggestDrop = losses.indexOf(Math.max(...losses)) + 1;
  return ok({ requests: steps[0], answeredFast: fast, newPatients: converted.length, cameTwice: twice, biggestDrop }, 'count', reqs.length, src);
}

export interface ReviewSummary {
  count: number;
  average: number | null;
}

export function reviewSummary(data: Dataset, f: Filter): MetricResult<ReviewSummary> {
  const src: SourceKey[] = ['gbp', 'provenexpert'];
  if (!data.sources.gbp && !data.sources.provenexpert) return missingSource('count', src, 'gbp');
  const rows = data.reviews.filter(
    (r) => r.date >= f.from && r.date <= f.to && (r.platform === 'google' ? data.sources.gbp : data.sources.provenexpert),
  );
  return ok({ count: rows.length, average: rows.length ? sum(rows.map((r) => r.rating)) / rows.length : null }, 'count', rows.length, src);
}
