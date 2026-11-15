import { addDays, daysBetween } from '../data/dates';
import type { Dataset, DeclineReason, StaffId, Treatment, TreatmentPlan } from '../data/types';
import { TREATMENTS } from '../data/types';
import { firstMissing, indexOf, missingSource, ok, patientMatches, pct, sum, tooFew, type Filter, type MetricResult } from './core';

const PVS = ['pvs' as const];

export function plansIn(data: Dataset, f: Filter): TreatmentPlan[] {
  const ix = indexOf(data);
  return data.plans.filter(
    (p) =>
      p.created >= f.from &&
      p.created <= f.to &&
      (!f.staff || p.dentistId === f.staff) &&
      (!f.treatment || p.treatment === f.treatment) &&
      patientMatches(ix, p.patientId, f),
  );
}

export interface PlanSummary {
  proposed: number;
  accepted: number;
  acceptancePct: number | null;
  count: number;
  acceptedCount: number;
  /** value of one additional point of acceptance */
  onePoint: number;
}

/** Value of plans created in the period; acceptance = accepted value ÷ proposed value. */
export function planSummary(data: Dataset, f: Filter): MetricResult<PlanSummary> {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const list = plansIn(data, f);
  const proposed = sum(list.map((p) => p.value));
  const acc = list.filter((p) => p.status === 'accepted');
  const accepted = sum(acc.map((p) => p.value));
  return ok(
    {
      proposed,
      accepted,
      acceptancePct: proposed > 0 ? pct(accepted, proposed) : null,
      count: list.length,
      acceptedCount: acc.length,
      onePoint: proposed / 100,
    },
    'eur',
    list.length,
    PVS,
  );
}

/** Was the plan still open (not accepted, declined or expired) at the end of this day? */
export function isOpenAt(p: TreatmentPlan, asOf: string): boolean {
  if (p.created > asOf) return false;
  if (p.status === 'open') return true;
  if (p.status === 'accepted') return !!p.acceptedDate && p.acceptedDate > asOf;
  return !!p.closedDate && p.closedDate > asOf;
}

export interface OpenPlans {
  total: number;
  under3: number;
  over3: number;
  count: number;
  byTreatment: { treatment: Treatment; open: number }[];
}

/** Open plan value at the end of the period, split under / over 3 months old. */
export function openPlans(data: Dataset, f: Filter): MetricResult<OpenPlans> {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const ix = indexOf(data);
  const asOf = f.to;
  const list = data.plans.filter(
    (p) =>
      isOpenAt(p, asOf) &&
      (!f.staff || p.dentistId === f.staff) &&
      (!f.treatment || p.treatment === f.treatment) &&
      patientMatches(ix, p.patientId, { ...f, patientType: undefined }),
  );
  const cutoff = addDays(asOf, -90);
  const under = list.filter((p) => p.created > cutoff);
  const over = list.filter((p) => p.created <= cutoff);
  return ok(
    {
      total: sum(list.map((p) => p.value)),
      under3: sum(under.map((p) => p.value)),
      over3: sum(over.map((p) => p.value)),
      count: list.length,
      byTreatment: TREATMENTS.map((t) => ({ treatment: t, open: sum(list.filter((p) => p.treatment === t).map((p) => p.value)) })).filter(
        (r) => r.open > 0,
      ),
    },
    'eur',
    list.length,
    PVS,
  );
}

export interface InstalmentComparison {
  withOfferPct: number | null;
  withoutOfferPct: number | null;
  offeredSharePct: number | null;
  withSample: number;
  withoutSample: number;
  unknown: number;
}

/** Acceptance (share of plans) with vs without an instalment offer; only plans where this is known. */
export function instalmentComparison(data: Dataset, f: Filter): MetricResult<InstalmentComparison> {
  const src = ['pvs' as const, 'instalments' as const];
  const miss = firstMissing(data, src);
  if (miss) return missingSource('pct', src, miss);
  const list = plansIn(data, f);
  const yes = list.filter((p) => p.instalmentsOffered === 'yes');
  const no = list.filter((p) => p.instalmentsOffered === 'no');
  const known = yes.length + no.length;
  if (known === 0) return tooFew('pct', src);
  const rate = (xs: TreatmentPlan[]) => (xs.length ? pct(xs.filter((p) => p.status === 'accepted').length, xs.length) : null);
  const r = ok(
    {
      withOfferPct: rate(yes),
      withoutOfferPct: rate(no),
      offeredSharePct: pct(yes.length, known),
      withSample: yes.length,
      withoutSample: no.length,
      unknown: list.length - known,
    },
    'pct',
    known,
    src,
  );
  if (yes.length < 10 || no.length < 10) r.small = true;
  return r;
}

export interface DentistAcceptance {
  dentistId: StaffId;
  proposed: number;
  acceptancePct: number | null;
  previousAcceptancePct: number | null;
  open: number;
  plans: number;
}

export function acceptanceByDentist(data: Dataset, f: Filter, prev?: Filter): MetricResult<DentistAcceptance[]> {
  if (firstMissing(data, PVS)) return missingSource('pct', PVS, 'pvs');
  const dentists = data.staff.filter((s) => s.role === 'dentist');
  const rows = dentists.map((d): DentistAcceptance => {
    const cur = planSummary(data, { ...f, staff: d.id }).value!;
    const before = prev ? planSummary(data, { ...prev, staff: d.id }).value! : null;
    const open = openPlans(data, { ...f, staff: d.id }).value!;
    return {
      dentistId: d.id,
      proposed: cur.proposed,
      acceptancePct: cur.acceptancePct,
      previousAcceptancePct: before?.acceptancePct ?? null,
      open: open.total,
      plans: cur.count,
    };
  });
  return ok(rows, 'pct', sum(rows.map((r) => r.plans)), PVS);
}

export type NextStep = 'offer_instalments' | 'getting_old' | 'call_questions' | 'second_talk';

export interface FollowUp {
  planId: string;
  patientId: string;
  dentistId: StaffId;
  treatment: Treatment;
  value: number;
  daysOpen: number;
  instalments: TreatmentPlan['instalmentsOffered'];
  /** rough chance that a follow-up still leads to a booking (0–1); a ranking aid, not a forecast */
  likelihood: number;
  step: NextStep;
}

/** Open plans under 90 days old, sorted by value × likelihood, with a suggested next step. */
export function followUpList(data: Dataset, f: Filter, limit = 12): MetricResult<FollowUp[]> {
  if (firstMissing(data, PVS)) return missingSource('count', PVS, 'pvs');
  const asOf = f.to;
  const rows: FollowUp[] = [];
  for (const p of data.plans) {
    if (!isOpenAt(p, asOf)) continue;
    if (f.staff && p.dentistId !== f.staff) continue;
    if (f.treatment && p.treatment !== f.treatment) continue;
    const daysOpen = daysBetween(p.created, asOf);
    if (daysOpen >= 90) continue;
    // newer plans are easier to win back; an untried instalment offer is an extra lever
    let likelihood = 0.45 - 0.3 * (daysOpen / 90);
    if (p.instalmentsOffered !== 'yes' && p.value >= 1500) likelihood += 0.1;
    let step: NextStep;
    if (p.instalmentsOffered !== 'yes' && p.value >= 1500) step = 'offer_instalments';
    else if (daysOpen >= 60) step = 'getting_old';
    else if (p.value >= 3000) step = 'second_talk';
    else step = 'call_questions';
    rows.push({
      planId: p.id,
      patientId: p.patientId,
      dentistId: p.dentistId,
      treatment: p.treatment,
      value: p.value,
      daysOpen,
      instalments: p.instalmentsOffered,
      likelihood,
      step,
    });
  }
  rows.sort((a, b) => b.value * b.likelihood - a.value * a.likelihood);
  return ok(rows.slice(0, limit), 'count', rows.length, PVS);
}

export interface DeclineReasons {
  recorded: Partial<Record<DeclineReason, number>>;
  recordedCount: number;
  notRecorded: number;
}

export function declineReasons(data: Dataset, f: Filter): MetricResult<DeclineReasons> {
  if (firstMissing(data, PVS)) return missingSource('count', PVS, 'pvs');
  const declined = plansIn(data, f).filter((p) => p.status === 'declined');
  const recorded: Partial<Record<DeclineReason, number>> = {};
  let n = 0;
  for (const p of declined) {
    if (p.declineReason && p.declineReason !== 'not_recorded') {
      recorded[p.declineReason] = (recorded[p.declineReason] ?? 0) + 1;
      n++;
    }
  }
  return ok({ recorded, recordedCount: n, notRecorded: declined.length - n }, 'count', declined.length, PVS);
}
