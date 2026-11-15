import { addDays, daysBetween } from '../data/dates';
import type { Appointment, Dataset, Recall, StaffId } from '../data/types';
import { completedIn, firstMissing, indexOf, missingSource, ok, patientMatches, pct, sum, tooFew, type Filter, type MetricResult } from './core';

const PVS = ['pvs' as const];
/** Patients more than this many days past their recall date count as overdue. */
export const OVERDUE_AFTER_DAYS = 30;
/** Recalls older than this are treated as lapsed patients, not as overdue. */
export const OVERDUE_MAX_DAYS = 540;

export interface OverduePatient {
  patientId: string;
  due: string;
  daysOverdue: number;
  lastVisit: string | null;
  daysSinceLastVisit: number | null;
  lastSeenBy: StaffId | null;
  usualIntervalDays: number | null;
  visits: number;
  totalBilled: number;
}

const recallCache = new WeakMap<Dataset, Map<string, Recall[]>>();
function recallsByPatient(data: Dataset): Map<string, Recall[]> {
  let m = recallCache.get(data);
  if (m) return m;
  m = new Map();
  for (const r of data.recalls) {
    let list = m.get(r.patientId);
    if (!list) m.set(r.patientId, (list = []));
    list.push(r);
  }
  for (const list of m.values()) list.sort((a, b) => (a.due < b.due ? -1 : 1));
  recallCache.set(data, m);
  return m;
}

/**
 * Overdue for a check-up at the end of the period: more than 30 days past the recall date,
 * and no visit of any kind since (from 60 days before the recall date). (Exports contain no future bookings, so "no future
 * appointment" is read from the recall list.)
 */
export function overduePatients(data: Dataset, f: Filter): MetricResult<OverduePatient[]> {
  if (firstMissing(data, PVS)) return missingSource('count', PVS, 'pvs');
  if (!data.recalls.length) return tooFew('count', PVS);
  const ix = indexOf(data);
  const asOf = f.to;
  const latestDue = addDays(asOf, -OVERDUE_AFTER_DAYS);
  const earliestDue = addDays(asOf, -OVERDUE_MAX_DAYS);
  const out: OverduePatient[] = [];
  for (const [patientId, list] of recallsByPatient(data)) {
    // latest recall that already existed at the end of the period
    let recall: Recall | null = null;
    for (const r of list) if (!r.createdAt || r.createdAt <= asOf) recall = r;
    if (!recall || recall.due >= latestDue || recall.due < earliestDue) continue;
    if (!patientMatches(ix, patientId, { ...f, patientType: undefined })) continue;
    const visits = (ix.byPatient.get(patientId) ?? []).filter((a) => a.at.slice(0, 10) <= asOf);
    const windowStart = addDays(recall.due, -60);
    const cameBack = visits.some(
      (a) => a.at.slice(0, 10) >= windowStart && (!recall!.createdAt || a.at.slice(0, 10) > recall!.createdAt),
    );
    if (cameBack) continue;
    const lastAny: Appointment | undefined = visits[visits.length - 1];
    // "last seen by" = who did the check-up or cleaning that set this recall (falls back to the last visit)
    const recallVisit = recall.createdAt
      ? visits.find((a) => a.at.slice(0, 10) === recall!.createdAt && (a.treatment === 'prevention' || a.treatment === 'checkups_cmd'))
      : undefined;
    const last = lastAny;
    const seenBy = recallVisit ?? lastAny;
    if (f.staff && seenBy?.staffId !== f.staff) continue;
    out.push({
      patientId,
      due: recall.due,
      daysOverdue: daysBetween(recall.due, asOf),
      lastVisit: last ? last.at.slice(0, 10) : null,
      daysSinceLastVisit: last ? daysBetween(last.at, asOf) : null,
      lastSeenBy: seenBy ? seenBy.staffId : null,
      usualIntervalDays: recall.createdAt ? daysBetween(recall.createdAt, recall.due) : null,
      visits: visits.length,
      totalBilled: sum(visits.map((a) => a.billed)),
    });
  }
  out.sort((a, b) => b.totalBilled - a.totalBilled);
  return ok(out, 'count', out.length, PVS);
}

/** Average billed amount of one cleaning / recall visit (last 12 months up to the period end). */
export function recallVisitValue(data: Dataset, f: Filter): MetricResult {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const appts = completedIn(data, { from: addDays(f.to, -364), to: f.to, treatment: 'prevention' });
  if (!appts.length) return tooFew('eur', PVS);
  return ok(sum(appts.map((a) => a.billed)) / appts.length, 'eur', appts.length, PVS);
}

/** Average yearly revenue per existing patient (12 months up to the period end, annualised if shorter). */
export function typicalPatientValuePerYear(data: Dataset, f: Filter): MetricResult {
  if (firstMissing(data, PVS)) return missingSource('eur', PVS, 'pvs');
  const ix = indexOf(data);
  const from = addDays(f.to, -364) < ix.dataStart ? ix.dataStart : addDays(f.to, -364);
  const days = daysBetween(from, f.to) + 1;
  if (days < 85) return tooFew('eur', PVS);
  const appts = completedIn(data, { ...f, from, to: f.to, patientType: undefined }).filter((a) => {
    const first = ix.firstVisit.get(a.patientId);
    return !first || first < from;
  });
  const patients = new Set(appts.map((a) => a.patientId)).size;
  if (!patients) return tooFew('eur', PVS);
  return ok((sum(appts.map((a) => a.billed)) / patients) * (365 / days), 'eur', patients, PVS);
}

export interface NextBooked {
  teamPct: number | null;
  sample: number;
}

/** Share of completed appointments where the patient left with a next appointment. */
export function nextBookedRate(data: Dataset, f: Filter): MetricResult {
  if (firstMissing(data, PVS)) return missingSource('pct', PVS, 'pvs');
  const known = completedIn(data, f).filter((a) => a.nextBooked !== null);
  if (!known.length) return tooFew('pct', PVS);
  return ok(pct(known.filter((a) => a.nextBooked).length, known.length), 'pct', known.length, PVS);
}

export interface PatientRow {
  patientId: string;
  lastVisit: string;
  visits: number;
  totalBilled: number;
  lastSeenBy: StaffId;
  isNew: boolean;
}

/** Pseudonymised patient list: everyone with a completed visit up to the period end. */
export function patientList(data: Dataset, f: Filter): MetricResult<PatientRow[]> {
  if (firstMissing(data, PVS)) return missingSource('count', PVS, 'pvs');
  const ix = indexOf(data);
  const rows: PatientRow[] = [];
  for (const [patientId, list] of ix.byPatient) {
    const visits = list.filter((a) => a.at.slice(0, 10) <= f.to);
    if (!visits.length) continue;
    const last = visits[visits.length - 1];
    const first = ix.firstVisit.get(patientId);
    rows.push({
      patientId,
      lastVisit: last.at.slice(0, 10),
      visits: visits.length,
      totalBilled: sum(visits.map((a) => a.billed)),
      lastSeenBy: last.staffId,
      isNew: !!first && first >= f.from && first <= f.to,
    });
  }
  return ok(rows, 'count', rows.length, PVS);
}

/** Last completed visits of one patient (evidence for the detail panel). */
export function patientVisits(data: Dataset, patientId: string, asOf: string, limit = 6): Appointment[] {
  const list = (indexOf(data).byPatient.get(patientId) ?? []).filter((a) => a.at.slice(0, 10) <= asOf);
  return list.slice(-limit).reverse();
}
