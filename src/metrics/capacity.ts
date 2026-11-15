import { daysInRange, weekdayOf } from '../data/dates';
import type { CancelReason, Dataset, StaffId, Treatment } from '../data/types';
import { allAppointmentsIn, completedIn, firstMissing, missingSource, ok, pct, sum, tooFew, type Filter, type MetricResult } from './core';

const PVS = ['pvs' as const];

function isClosedDay(data: Dataset, day: string): boolean {
  return data.events.some((e) => e.type === 'closure' && !e.staffId && day >= e.from && day <= e.to);
}
function isAbsent(data: Dataset, staffId: StaffId, day: string): boolean {
  const s = data.staff.find((x) => x.id === staffId);
  return !!s && s.absences.some((a) => day >= a.from && day <= a.to);
}

/** Bookable slots: capacity per chair and weekday, minus closure days and staff absences. */
export function bookableSlots(data: Dataset, f: Filter): number {
  let total = 0;
  for (const day of daysInRange(f.from, f.to)) {
    const wd = weekdayOf(day);
    if (wd === 0 || wd === 6 || isClosedDay(data, day)) continue;
    for (const c of data.capacity) {
      if (c.weekday !== wd) continue;
      if (f.staff && c.staffId !== f.staff) continue;
      if (isAbsent(data, c.staffId, day)) continue;
      total += c.slots;
    }
  }
  return total;
}

export interface TimeUsed {
  slots: number;
  completed: number;
  cancelled: number;
  noShow: number;
  neverBooked: number;
  usedPct: number;
}

/** Treatment time used: completed ÷ bookable slots. Empty slots = slots − (completed + cancelled + no-show). */
export function treatmentTimeUsed(data: Dataset, f: Filter): MetricResult<TimeUsed> {
  if (firstMissing(data, PVS)) return missingSource('pct', PVS, 'pvs');
  // capacity is per chair, so patient and treatment filters do not apply here
  const scope: Filter = { from: f.from, to: f.to, staff: f.staff };
  const slots = bookableSlots(data, scope);
  if (!data.capacity.length || slots === 0) return tooFew('pct', PVS);
  const all = allAppointmentsIn(data, scope);
  const completed = all.filter((a) => a.status === 'completed').length;
  const cancelled = all.filter((a) => a.status === 'cancelled').length;
  const noShow = all.filter((a) => a.status === 'no_show').length;
  return ok(
    { slots, completed, cancelled, noShow, neverBooked: Math.max(0, slots - completed - cancelled - noShow), usedPct: pct(completed, slots) },
    'pct',
    slots,
    PVS,
  );
}

export interface Missed {
  cancelled: number;
  noShow: number;
  total: number;
  /** count × average value of those appointment types */
  value: number;
  valuePerAppointment: number | null;
  byTreatment: { treatment: Treatment; count: number }[];
  reasons: Partial<Record<CancelReason, number>>;
  reasonsRecorded: number;
}

/** Missed appointments: cancelled + no-show. Value = count × average billed value of that treatment type. */
export function missedAppointments(data: Dataset, f: Filter): MetricResult<Missed> {
  if (firstMissing(data, PVS)) return missingSource('count', PVS, 'pvs');
  const all = allAppointmentsIn(data, f);
  const missed = all.filter((a) => a.status !== 'completed');
  const done = all.filter((a) => a.status === 'completed');
  const avg = new Map<Treatment, number>();
  const counts = new Map<Treatment, number>();
  for (const a of missed) counts.set(a.treatment, (counts.get(a.treatment) ?? 0) + 1);
  let value = 0;
  for (const [t, n] of counts) {
    if (!avg.has(t)) {
      let list = done.filter((a) => a.treatment === t);
      // fall back to all history when the period has no completed session of this type
      if (!list.length) list = completedIn(data, { from: '0000-01-01', to: f.to, treatment: t });
      avg.set(t, list.length ? sum(list.map((a) => a.billed)) / list.length : 0);
    }
    value += n * (avg.get(t) ?? 0);
  }
  const reasons: Partial<Record<CancelReason, number>> = {};
  let recorded = 0;
  for (const a of missed) {
    if (a.cancelReason && a.cancelReason !== 'not_recorded') {
      reasons[a.cancelReason] = (reasons[a.cancelReason] ?? 0) + 1;
      recorded++;
    }
  }
  return ok(
    {
      cancelled: missed.filter((a) => a.status === 'cancelled').length,
      noShow: missed.filter((a) => a.status === 'no_show').length,
      total: missed.length,
      value,
      valuePerAppointment: missed.length ? value / missed.length : null,
      byTreatment: [...counts.entries()].map(([treatment, count]) => ({ treatment, count })).sort((a, b) => b.count - a.count),
      reasons,
      reasonsRecorded: recorded,
    },
    'count',
    missed.length,
    PVS,
  );
}

/** Cautious value of one never-booked slot: the average of a check-up and a cleaning in the period. */
export function emptySlotValue(data: Dataset, f: Filter): number | null {
  const list = completedIn(data, { from: f.from, to: f.to }).filter((a) => a.treatment === 'prevention' || a.treatment === 'checkups_cmd');
  return list.length ? sum(list.map((a) => a.billed)) / list.length : null;
}

export interface WeekdayRow {
  weekday: number; // 1 = Mon … 5 = Fri
  appointments: number;
  slots: number;
  usedPct: number | null;
}

export function weekdayUtilisation(data: Dataset, f: Filter): MetricResult<WeekdayRow[]> {
  if (firstMissing(data, PVS)) return missingSource('pct', PVS, 'pvs');
  const scope: Filter = { from: f.from, to: f.to, staff: f.staff };
  const done = completedIn(data, scope);
  const rows: WeekdayRow[] = [1, 2, 3, 4, 5].map((wd) => {
    let slots = 0;
    for (const day of daysInRange(f.from, f.to)) {
      if (weekdayOf(day) !== wd) continue;
      slots += bookableSlots(data, { ...scope, from: day, to: day });
    }
    const appointments = done.filter((a) => weekdayOf(a.at) === wd).length;
    return { weekday: wd, appointments, slots, usedPct: slots ? pct(appointments, slots) : null };
  });
  return ok(rows, 'pct', done.length, PVS);
}
