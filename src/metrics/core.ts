import { addDays, addMonths, monthEnd, monthStart } from '../data/dates';
import type { Appointment, Channel, Dataset, District, Patient, Payer, SourceKey, StaffId, StaffMember, Treatment } from '../data/types';

export interface Filter {
  from: string; // 'YYYY-MM-DD' inclusive
  to: string; // 'YYYY-MM-DD' inclusive
  staff?: StaffId;
  treatment?: Treatment;
  payer?: Payer;
  channel?: Channel | 'none';
  district?: District;
  patientType?: 'new' | 'existing';
}

export type Unit = 'eur' | 'count' | 'pct' | 'ratio' | 'days';
export type MissingReason = 'missing_source' | 'too_few_records';

/** Below this many records a result is flagged as too small to draw conclusions. */
export const MIN_SAMPLE = 10;

export interface MetricResult<T = number> {
  value: T | null;
  unit: Unit;
  sampleSize: number;
  sources: SourceKey[];
  /** Set when value is null. */
  reason?: MissingReason;
  /** Which source would fix a missing value. */
  missing?: SourceKey;
  /** True when fewer than MIN_SAMPLE records are behind the value. */
  small?: boolean;
}

export function ok<T>(value: T, unit: Unit, sampleSize: number, sources: SourceKey[]): MetricResult<T> {
  const r: MetricResult<T> = { value, unit, sampleSize, sources };
  if (sampleSize < MIN_SAMPLE) r.small = true;
  return r;
}

export function tooFew<T = number>(unit: Unit, sources: SourceKey[], sampleSize = 0): MetricResult<T> {
  return { value: null, unit, sampleSize, sources, reason: 'too_few_records', small: true };
}

export function missingSource<T = number>(unit: Unit, sources: SourceKey[], source: SourceKey): MetricResult<T> {
  return { value: null, unit, sampleSize: 0, sources, reason: 'missing_source', missing: source };
}

/** Returns the first disconnected source, or null when all are available. */
export function firstMissing(data: Dataset, sources: SourceKey[]): SourceKey | null {
  for (const s of sources) if (!data.sources[s]) return s;
  return null;
}

export const monthFilter = (month: string, extra: Partial<Filter> = {}): Filter => ({
  from: monthStart(month),
  to: monthEnd(month),
  ...extra,
});

export const isWholeMonth = (f: Filter): boolean => f.from.slice(8) === '01' && f.to === monthEnd(f.from.slice(0, 7)) ;

/** The comparison period: the previous month for a month filter, otherwise the same-length period before. */
export function previousFilter(f: Filter): Filter {
  if (isWholeMonth(f)) {
    const pm = addMonths(f.from.slice(0, 7), -1);
    return { ...f, from: monthStart(pm), to: monthEnd(pm) };
  }
  const len = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86400000) + 1;
  return { ...f, from: addDays(f.from, -len), to: addDays(f.from, -1) };
}

// ---------- index (cached per dataset) ----------
export interface Index {
  patient: Map<string, Patient>;
  staff: Map<StaffId, StaffMember>;
  completed: Appointment[];
  firstVisit: Map<string, string>;
  byPatient: Map<string, Appointment[]>; // completed, sorted by date
  dataStart: string;
  dataEnd: string;
}

const cache = new WeakMap<Dataset, Index>();

export function indexOf(data: Dataset): Index {
  let ix = cache.get(data);
  if (ix) return ix;
  const patient = new Map(data.patients.map((p) => [p.id, p]));
  const staff = new Map(data.staff.map((s) => [s.id, s]));
  const completed = data.appointments.filter((a) => a.status === 'completed').sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const byPatient = new Map<string, Appointment[]>();
  const firstVisit = new Map<string, string>();
  for (const a of completed) {
    let list = byPatient.get(a.patientId);
    if (!list) byPatient.set(a.patientId, (list = []));
    list.push(a);
  }
  for (const p of data.patients) {
    const first = p.firstVisit ?? byPatient.get(p.id)?.[0]?.at.slice(0, 10);
    if (first) firstVisit.set(p.id, first);
  }
  for (const [id, list] of byPatient) if (!firstVisit.has(id)) firstVisit.set(id, list[0].at.slice(0, 10));
  ix = {
    patient,
    staff,
    completed,
    firstVisit,
    byPatient,
    dataStart: monthStart(data.firstMonth),
    dataEnd: monthEnd(data.lastMonth),
  };
  cache.set(data, ix);
  return ix;
}

export function patientMatches(ix: Index, patientId: string, f: Filter): boolean {
  if (!f.payer && !f.channel && !f.district && !f.patientType) return true;
  const p = ix.patient.get(patientId);
  if (f.payer && p?.payer !== f.payer) return false;
  if (f.channel) {
    if (f.channel === 'none') {
      if (p?.channel) return false;
    } else if (p?.channel !== f.channel) return false;
  }
  if (f.district && p?.district !== f.district) return false;
  if (f.patientType) {
    const first = ix.firstVisit.get(patientId);
    const isNew = !!first && first >= f.from && first <= f.to;
    if ((f.patientType === 'new') !== isNew) return false;
  }
  return true;
}

export function apptMatches(ix: Index, a: Appointment, f: Filter): boolean {
  const d = a.at.slice(0, 10);
  if (d < f.from || d > f.to) return false;
  if (f.staff && a.staffId !== f.staff) return false;
  if (f.treatment && a.treatment !== f.treatment) return false;
  return patientMatches(ix, a.patientId, f);
}

/** Completed appointments matching a filter. */
export function completedIn(data: Dataset, f: Filter): Appointment[] {
  const ix = indexOf(data);
  return ix.completed.filter((a) => apptMatches(ix, a, f));
}

export function allAppointmentsIn(data: Dataset, f: Filter): Appointment[] {
  const ix = indexOf(data);
  return data.appointments.filter((a) => apptMatches(ix, a, f));
}

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
export const toCents = (eur: number): number => Math.round(eur * 100);
export const pct = (part: number, whole: number): number => (whole === 0 ? 0 : (part / whole) * 100);
