import type { Dataset, Treatment } from '../data/types';
import { TREATMENTS } from '../data/types';
import { completedIn, firstMissing, missingSource, ok, tooFew, toCents, type Filter, type MetricResult } from './core';

const PVS = ['pvs' as const];

export interface Bridge {
  current: number;
  previous: number;
  change: number;
  /** change in appointment count × last period's revenue per visit */
  count: number;
  /** at last period's prices, the effect of the different treatment mix */
  mix: number;
  /** the remainder: prices within treatments */
  price: number;
}

interface Agg {
  cents: number;
  n: number;
  byT: Record<Treatment, { cents: number; n: number }>;
}

function aggregate(data: Dataset, f: Filter): Agg {
  const byT = Object.fromEntries(TREATMENTS.map((t) => [t, { cents: 0, n: 0 }])) as Agg['byT'];
  let cents = 0;
  let n = 0;
  for (const a of completedIn(data, f)) {
    const c = toCents(a.billed);
    cents += c;
    n++;
    byT[a.treatment].cents += c;
    byT[a.treatment].n++;
  }
  return { cents, n, byT };
}

/**
 * Revenue bridge: splits the change between two periods into three parts that add up
 * exactly (to the cent) to the difference. All arithmetic is done in integer cents.
 */
export function revenueBridge(data: Dataset, cur: Filter, prev: Filter): MetricResult<Bridge> {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const c = aggregate(data, cur);
  const p = aggregate(data, prev);
  if (p.n === 0 || c.n === 0) return tooFew('eur', PVS, c.n + p.n);
  const change = c.cents - p.cents;
  const prevPerVisit = p.cents / p.n;
  const count = Math.round((c.n - p.n) * prevPerVisit);
  // this period's sessions valued at last period's price per treatment
  let atOldPrices = 0;
  for (const t of TREATMENTS) {
    const oldPrice = p.byT[t].n > 0 ? p.byT[t].cents / p.byT[t].n : c.byT[t].n > 0 ? c.byT[t].cents / c.byT[t].n : 0;
    atOldPrices += c.byT[t].n * oldPrice;
  }
  const mix = Math.round(atOldPrices - c.n * prevPerVisit);
  const price = change - count - mix;
  return ok(
    { current: c.cents / 100, previous: p.cents / 100, change: change / 100, count: count / 100, mix: mix / 100, price: price / 100 },
    'eur',
    c.n + p.n,
    PVS,
  );
}

export interface Factor {
  current: number;
  previous: number;
  effect: number;
}
export interface Factors {
  change: number;
  patients: Factor;
  visitsPerPatient: Factor;
  revenuePerVisit: Factor;
}

/**
 * Revenue = patients × visits per patient × revenue per visit.
 * Log decomposition, so the three euro effects add up exactly to the change.
 */
export function revenueFactors(data: Dataset, cur: Filter, prev: Filter): MetricResult<Factors> {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const ca = completedIn(data, cur);
  const pa = completedIn(data, prev);
  if (!ca.length || !pa.length) return tooFew('eur', PVS, ca.length + pa.length);
  const cCents = ca.reduce((s, a) => s + toCents(a.billed), 0);
  const pCents = pa.reduce((s, a) => s + toCents(a.billed), 0);
  if (cCents <= 0 || pCents <= 0) return tooFew('eur', PVS, ca.length + pa.length);
  const cP = new Set(ca.map((a) => a.patientId)).size;
  const pP = new Set(pa.map((a) => a.patientId)).size;
  const cV = ca.length / cP;
  const pV = pa.length / pP;
  const cR = cCents / ca.length;
  const pR = pCents / pa.length;
  const change = cCents - pCents;
  const lnTotal = Math.log(cCents / pCents);
  // logarithmic mean keeps the weights well-defined when the change is tiny
  const weight = Math.abs(lnTotal) < 1e-12 ? pCents : change / lnTotal;
  const ePatients = Math.round(weight * Math.log(cP / pP));
  const eVisits = Math.round(weight * Math.log(cV / pV));
  const eRevenue = change - ePatients - eVisits;
  return ok(
    {
      change: change / 100,
      patients: { current: cP, previous: pP, effect: ePatients / 100 },
      visitsPerPatient: { current: cV, previous: pV, effect: eVisits / 100 },
      revenuePerVisit: { current: cR / 100, previous: pR / 100, effect: eRevenue / 100 },
    },
    'eur',
    ca.length + pa.length,
    PVS,
  );
}

export interface TreatmentChange {
  treatment: Treatment;
  revenue: number;
  previousRevenue: number;
  change: number;
  sessions: number;
  previousSessions: number;
  avg: number | null;
  /** (sessions − previous sessions) × previous average */
  countEffect: number;
  /** remainder: change in average per session */
  priceEffect: number;
}

/** Per treatment: the change split into session count and price. The two parts add up exactly. */
export function treatmentChanges(data: Dataset, cur: Filter, prev: Filter): MetricResult<TreatmentChange[]> {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const c = aggregate(data, cur);
  const p = aggregate(data, prev);
  const rows = TREATMENTS.map((t): TreatmentChange => {
    const ct = c.byT[t];
    const pt = p.byT[t];
    const change = ct.cents - pt.cents;
    const oldAvg = pt.n > 0 ? pt.cents / pt.n : ct.n > 0 ? ct.cents / ct.n : 0;
    const countEffect = Math.round((ct.n - pt.n) * oldAvg);
    return {
      treatment: t,
      revenue: ct.cents / 100,
      previousRevenue: pt.cents / 100,
      change: change / 100,
      sessions: ct.n,
      previousSessions: pt.n,
      avg: ct.n ? ct.cents / ct.n / 100 : null,
      countEffect: countEffect / 100,
      priceEffect: (change - countEffect) / 100,
    };
  });
  return ok(rows, 'eur', c.n + p.n, PVS);
}
