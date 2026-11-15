import type { Dataset, Payer, StaffId, Treatment } from '../data/types';
import { TREATMENTS } from '../data/types';
import { completedIn, firstMissing, indexOf, missingSource, ok, pct, sum, tooFew, toCents, type Filter, type MetricResult } from './core';

const PVS = ['pvs' as const];

/** Revenue: sum of billed amounts of completed appointments. */
export function revenue(data: Dataset, f: Filter): MetricResult {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const appts = completedIn(data, f);
  return ok(sum(appts.map((a) => toCents(a.billed))) / 100, 'eur', appts.length, PVS);
}

/** Completed appointments. */
export function appointmentCount(data: Dataset, f: Filter): MetricResult {
  if (firstMissing(data, PVS)) return missingSource('count', PVS, 'pvs');
  const n = completedIn(data, f).length;
  return ok(n, 'count', n, PVS);
}

/** Revenue ÷ completed appointments. */
export function revenuePerVisit(data: Dataset, f: Filter): MetricResult {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const appts = completedIn(data, f);
  if (!appts.length) return tooFew('eur', PVS);
  return ok(sum(appts.map((a) => a.billed)) / appts.length, 'eur', appts.length, PVS);
}

/** Unique patients with a completed appointment. */
export function patientsSeen(data: Dataset, f: Filter): MetricResult {
  if (firstMissing(data, PVS)) return missingSource('count', PVS, 'pvs');
  const n = new Set(completedIn(data, f).map((a) => a.patientId)).size;
  return ok(n, 'count', n, PVS);
}

/** Patient ids whose first-ever completed visit is in the period. */
export function newPatientIds(data: Dataset, f: Filter): string[] {
  const ix = indexOf(data);
  const ids = new Set<string>();
  for (const a of completedIn(data, { ...f, patientType: undefined })) {
    const first = ix.firstVisit.get(a.patientId);
    if (first && first >= f.from && first <= f.to) ids.add(a.patientId);
  }
  if (f.patientType === 'existing') return [];
  return [...ids];
}

export function newPatients(data: Dataset, f: Filter): MetricResult {
  if (firstMissing(data, PVS)) return missingSource('count', PVS, 'pvs');
  const n = newPatientIds(data, f).length;
  return ok(n, 'count', n, PVS);
}

export interface ExistingShare {
  patientsPct: number;
  revenuePct: number;
  existing: number;
}

/** (Patients seen − new) ÷ patients seen, plus their share of revenue. */
export function existingPatientsShare(data: Dataset, f: Filter): MetricResult<ExistingShare> {
  if (firstMissing(data, PVS)) return missingSource('pct', PVS, 'pvs');
  const appts = completedIn(data, f);
  const seen = new Set(appts.map((a) => a.patientId));
  if (!seen.size) return tooFew('pct', PVS);
  const fresh = new Set(newPatientIds(data, f));
  const total = sum(appts.map((a) => a.billed));
  const existingRev = sum(appts.filter((a) => !fresh.has(a.patientId)).map((a) => a.billed));
  const existing = [...seen].filter((id) => !fresh.has(id)).length;
  return ok({ patientsPct: pct(existing, seen.size), revenuePct: pct(existingRev, total), existing }, 'pct', seen.size, PVS);
}

/** Sum of in-house lab amounts for completed appointments in the period. */
export function labRevenue(data: Dataset, f: Filter): MetricResult {
  const src = ['pvs' as const, 'lab' as const];
  const miss = firstMissing(data, src);
  if (miss) return missingSource('eur', src, miss);
  const ids = new Set(completedIn(data, f).map((a) => a.id));
  const rows = data.labWork.filter((l) => ids.has(l.appointmentId));
  return ok(sum(rows.map((l) => toCents(l.amount))) / 100, 'eur', rows.length, src);
}

/** Revenue by payer (GKV / PKV / self-pay). */
export function payerMix(data: Dataset, f: Filter): MetricResult<Record<Payer, number>> {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const ix = indexOf(data);
  const out: Record<Payer, number> = { GKV: 0, PKV: 0, self: 0 };
  const appts = completedIn(data, f);
  for (const a of appts) {
    const p = ix.patient.get(a.patientId);
    if (p) out[p.payer] += a.billed;
  }
  return ok(out, 'eur', appts.length, PVS);
}

export interface TreatmentRow {
  treatment: Treatment;
  revenue: number;
  sessions: number;
  avg: number | null;
  sharePct: number;
}

export function revenueByTreatment(data: Dataset, f: Filter): MetricResult<TreatmentRow[]> {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const appts = completedIn(data, f);
  const total = sum(appts.map((a) => a.billed));
  const rows = TREATMENTS.map((t): TreatmentRow => {
    const list = appts.filter((a) => a.treatment === t);
    const rev = sum(list.map((a) => a.billed));
    return { treatment: t, revenue: rev, sessions: list.length, avg: list.length ? rev / list.length : null, sharePct: pct(rev, total) };
  });
  return ok(rows, 'eur', appts.length, PVS);
}

export interface StaffRow {
  staffId: StaffId;
  revenue: number;
  appointments: number;
  nextBookedPct: number | null;
  nextBookedSample: number;
}

export function revenueByStaff(data: Dataset, f: Filter): MetricResult<StaffRow[]> {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const appts = completedIn(data, f);
  const rows = data.staff.map((s): StaffRow => {
    const list = appts.filter((a) => a.staffId === s.id);
    const known = list.filter((a) => a.nextBooked !== null);
    return {
      staffId: s.id,
      revenue: sum(list.map((a) => a.billed)),
      appointments: list.length,
      nextBookedPct: known.length ? pct(known.filter((a) => a.nextBooked).length, known.length) : null,
      nextBookedSample: known.length,
    };
  });
  return ok(rows, 'eur', appts.length, PVS);
}

/** Who delivers a treatment: share of sessions per staff member. */
export function staffShareOfTreatment(data: Dataset, f: Filter, treatment: Treatment): { staffId: StaffId; sharePct: number }[] {
  const appts = completedIn(data, { ...f, treatment });
  const counts = new Map<StaffId, number>();
  for (const a of appts) counts.set(a.staffId, (counts.get(a.staffId) ?? 0) + 1);
  return [...counts.entries()]
    .map(([staffId, n]) => ({ staffId, sharePct: pct(n, appts.length) }))
    .sort((a, b) => b.sharePct - a.sharePct);
}
