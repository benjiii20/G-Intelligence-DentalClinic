import { overlaps } from '../data/dates';
import type { Dataset, Payer, PracticeEvent, StaffId, Treatment } from '../data/types';
import { TREATMENTS } from '../data/types';
import { completedIn, sum, type Filter } from './core';
import { missedAppointments } from './capacity';
import { newPatientValue6m } from './marketing';
import { openPlans } from './plans';
import { overduePatients, recallVisitValue } from './recall';
import { responseSpeed } from './requests';
import { newPatientIds } from './revenue';

/**
 * Cautious assumptions behind "money left on the table". They are shown in the UI
 * and can be changed here in one place.
 */
export const ASSUMPTIONS = {
  /** share of open plans (under 3 months) that still books after a follow-up */
  planFollowUpRate: 0.2,
  /** share of overdue patients who come back after a reminder */
  recallReturnRate: 0.25,
  /** share of missed appointments that a reminder or waiting list could save */
  missedRecoverRate: 0.5,
};

export interface OpportunityItem {
  key: 'plans' | 'requests' | 'overdue' | 'missed';
  /** the full amount behind the item */
  full: number | null;
  /** the cautious share that counts towards the total */
  cautious: number | null;
  /** supporting count: open plans, missed patients, overdue patients, missed appointments */
  count: number | null;
}

export interface Opportunities {
  items: OpportunityItem[];
  /** sum of the cautious values, rounded to €100 */
  total: number;
}

export function moneyOnTable(data: Dataset, f: Filter): Opportunities {
  const scope: Filter = { from: f.from, to: f.to };
  const open = openPlans(data, scope).value;
  const speed = responseSpeed(data, scope).value;
  const npv = newPatientValue6m(data).value;
  const overdue = overduePatients(data, scope).value;
  const recallValue = recallVisitValue(data, scope).value;
  const missed = missedAppointments(data, scope).value;

  const requestsFull = speed && speed.missedNewPatients !== null && npv !== null ? speed.missedNewPatients * npv : null;
  const overdueFull = overdue && recallValue !== null ? overdue.length * recallValue : null;
  const items: OpportunityItem[] = [
    {
      key: 'plans',
      full: open ? open.under3 : null,
      cautious: open ? open.under3 * ASSUMPTIONS.planFollowUpRate : null,
      count: open ? open.count : null,
    },
    { key: 'requests', full: requestsFull, cautious: requestsFull, count: speed?.missedNewPatients ?? null },
    {
      key: 'overdue',
      full: overdueFull,
      cautious: overdueFull !== null ? overdueFull * ASSUMPTIONS.recallReturnRate : null,
      count: overdue ? overdue.length : null,
    },
    {
      key: 'missed',
      full: missed ? missed.value : null,
      cautious: missed ? missed.value * ASSUMPTIONS.missedRecoverRate : null,
      count: missed ? missed.total : null,
    },
  ];
  const total = Math.round(sum(items.map((i) => i.cautious ?? 0)) / 100) * 100;
  return { items, total };
}

export interface TopChange {
  kind: 'treatment' | 'staff' | 'payer' | 'patientType';
  key: Treatment | StaffId | Payer | 'new' | 'existing';
  change: number;
  current: number;
  previous: number;
}

/** The largest revenue changes between two periods, across several views. The views overlap. */
export function topChanges(data: Dataset, cur: Filter, prev: Filter, limit = 5): TopChange[] {
  const c = completedIn(data, cur);
  const p = completedIn(data, prev);
  const out: TopChange[] = [];
  const add = (kind: TopChange['kind'], key: TopChange['key'], cv: number, pv: number) => {
    if (cv !== pv) out.push({ kind, key, change: cv - pv, current: cv, previous: pv });
  };
  for (const t of TREATMENTS) {
    add('treatment', t, sum(c.filter((a) => a.treatment === t).map((a) => a.billed)), sum(p.filter((a) => a.treatment === t).map((a) => a.billed)));
  }
  for (const s of data.staff) {
    add('staff', s.id, sum(c.filter((a) => a.staffId === s.id).map((a) => a.billed)), sum(p.filter((a) => a.staffId === s.id).map((a) => a.billed)));
  }
  const cNew = new Set(newPatientIds(data, cur));
  const pNew = new Set(newPatientIds(data, prev));
  add('patientType', 'new', sum(c.filter((a) => cNew.has(a.patientId)).map((a) => a.billed)), sum(p.filter((a) => pNew.has(a.patientId)).map((a) => a.billed)));
  add(
    'patientType',
    'existing',
    sum(c.filter((a) => !cNew.has(a.patientId)).map((a) => a.billed)),
    sum(p.filter((a) => !pNew.has(a.patientId)).map((a) => a.billed)),
  );
  out.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return out.slice(0, limit);
}

/** Events (holidays, campaigns, price changes …) that overlap the period. Public-holiday closures are left out unless asked for. */
export function eventsIn(data: Dataset, f: Filter, opts: { staff?: StaffId; includeClosures?: boolean } = {}): PracticeEvent[] {
  return data.events.filter(
    (e) =>
      overlaps(e.from, e.to, f.from, f.to) &&
      (opts.includeClosures || e.type !== 'closure' || e.from !== e.to) &&
      (!opts.staff || e.staffId === opts.staff),
  );
}

/** Working days a staff member was absent in the period (from recorded holiday events and absences). */
export function absenceDays(data: Dataset, f: Filter, staffId: StaffId): number {
  const s = data.staff.find((x) => x.id === staffId);
  if (!s) return 0;
  let days = 0;
  for (const a of s.absences) {
    if (!overlaps(a.from, a.to, f.from, f.to)) continue;
    let d = a.from < f.from ? f.from : a.from;
    const end = a.to > f.to ? f.to : a.to;
    while (d <= end) {
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (wd !== 0 && wd !== 6) days++;
      const next = new Date(`${d}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      d = next.toISOString().slice(0, 10);
    }
  }
  return days;
}
