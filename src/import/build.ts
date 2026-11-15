// From mapped tables to a Dataset. Runs in the browser only. Nothing is fixed silently:
// rows that cannot be used are counted as skipped, doubtful rows are imported and flagged.
import { monthOf } from '../data/dates';
import type { AdSpend, Appointment, Dataset, InstagramMonthly, InstagramPost, LabWork, Patient, Recall, Request, StaffMember, TreatmentPlan } from '../data/types';
import { SOURCE_KEYS } from '../data/types';
import type { Mapping, RefusedColumn, Table } from './mapping';
import {
  birthDecade,
  districtFromPostcode,
  mapCancelReason,
  mapChannel,
  mapDeclineReason,
  mapInstalments,
  mapPayer,
  mapPlanStatus,
  mapPostType,
  mapRequestChannel,
  mapStatus,
  mapTreatment,
  parseAmount,
  parseCount,
  parseDate,
  parseDateTime,
  parseMonth,
  parseYesNo,
  patientKey,
  type Cell,
} from './normalize';
import { FIELDS, type ImportType } from './schema';

export type IssueKey =
  | 'skipped_no_date'
  | 'skipped_no_patient'
  | 'skipped_no_value'
  | 'no_amount'
  | 'unknown_status'
  | 'unknown_treatment'
  | 'duplicate_rows'
  | 'duplicate_patients'
  | 'no_source'
  | 'no_payer';

export interface Issue {
  key: IssueKey;
  count: number;
  /** first few row numbers as in the spreadsheet (header = row 1) */
  rows: number[];
}

export interface FileReport {
  rowsTotal: number;
  rowsReady: number;
  issues: Issue[];
  refused: RefusedColumn[];
  missingRequired: string[];
  /** distinct values in the staff column (replaced by letters, the values themselves are not kept) */
  staffCount: number;
}

interface Partial {
  appointments: (Appointment & { _staff: string | null; _lab: number | null })[];
  plans: (TreatmentPlan & { _staff: string | null })[];
  patients: Patient[];
  recalls: Recall[];
  requests: Request[];
  igPosts: InstagramPost[];
  igMessages: { month: string; messages: number }[];
  adSpend: AdSpend[];
}

export interface ProcessedFile {
  type: ImportType;
  report: FileReport;
  records: Partial;
  /** which optional columns were present (decides which sources count as connected) */
  has: Record<string, boolean>;
}

const empty = (): Partial => ({ appointments: [], plans: [], patients: [], recalls: [], requests: [], igPosts: [], igMessages: [], adSpend: [] });

class Issues {
  private map = new Map<IssueKey, Issue>();
  add(key: IssueKey, row: number) {
    let i = this.map.get(key);
    if (!i) this.map.set(key, (i = { key, count: 0, rows: [] }));
    i.count++;
    if (i.rows.length < 5) i.rows.push(row);
  }
  list(): Issue[] {
    return [...this.map.values()];
  }
}

/** Processes one mapped file. Refused columns are never read. */
export function processFile(type: ImportType, table: Table, mapping: Mapping, refused: RefusedColumn[]): ProcessedFile {
  const blocked = new Set(refused.map((r) => r.index));
  const col = (key: string): number | null => {
    const i = mapping[key];
    return i == null || blocked.has(i) ? null : i;
  };
  const get = (row: Cell[], key: string): Cell => {
    const i = col(key);
    return i == null ? null : row[i];
  };
  const has: Record<string, boolean> = Object.fromEntries(FIELDS[type].map((f) => [f.key, col(f.key) !== null]));
  const missingRequired = FIELDS[type].filter((f) => f.required && col(f.key) === null).map((f) => f.key);
  const issues = new Issues();
  const records = empty();
  const staffValues = new Set<string>();
  let ready = 0;

  if (missingRequired.length) {
    return { type, records, has, report: { rowsTotal: table.rows.length, rowsReady: 0, issues: [], refused, missingRequired, staffCount: 0 } };
  }

  const seen = new Set<string>();
  table.rows.forEach((row, i) => {
    const rowNo = i + 2;
    const staffRaw = (): string | null => {
      const v = get(row, 'staff');
      const s = v == null ? '' : String(v).trim();
      if (s) staffValues.add(s.toLowerCase());
      return s ? s.toLowerCase() : null;
    };
    switch (type) {
      case 'appointments': {
        const at = parseDateTime(get(row, 'date'), get(row, 'time'));
        if (!at) return issues.add('skipped_no_date', rowNo);
        const patientId = patientKey(get(row, 'patientId'));
        if (!patientId) return issues.add('skipped_no_patient', rowNo);
        const flags: string[] = [];
        let status = mapStatus(get(row, 'status'));
        if (status === null) {
          issues.add('unknown_status', rowNo);
          flags.push('unknown_status');
          status = 'completed';
        }
        let treatment = mapTreatment(get(row, 'treatment'));
        if (treatment === null) {
          issues.add('unknown_treatment', rowNo);
          flags.push('unknown_treatment');
          treatment = 'checkups_cmd';
        }
        const amount = parseAmount(get(row, 'amount'));
        if (status === 'completed' && amount === null) {
          issues.add('no_amount', rowNo);
          flags.push('no_amount');
        }
        const key = `${patientId}|${at}|${treatment}|${amount}`;
        if (seen.has(key)) {
          issues.add('duplicate_rows', rowNo);
          flags.push('duplicate');
        }
        seen.add(key);
        const next = has.nextBooked ? parseYesNo(get(row, 'nextBooked')) : null;
        records.appointments.push({
          id: `im${i}`,
          patientId,
          staffId: '',
          at,
          treatment,
          status,
          billed: status === 'completed' ? (amount ?? 0) : 0,
          nextBooked: status === 'completed' ? next : false,
          cancelReason: status === 'completed' ? undefined : mapCancelReason(get(row, 'cancelReason')),
          ...(flags.length ? { flags } : {}),
          _staff: staffRaw(),
          _lab: has.labAmount ? parseAmount(get(row, 'labAmount')) : null,
        });
        ready++;
        return;
      }
      case 'plans': {
        const created = parseDate(get(row, 'created'));
        if (!created) return issues.add('skipped_no_date', rowNo);
        const patientId = patientKey(get(row, 'patientId'));
        if (!patientId) return issues.add('skipped_no_patient', rowNo);
        const value = parseAmount(get(row, 'value'));
        if (value === null) return issues.add('skipped_no_value', rowNo);
        let status = mapPlanStatus(get(row, 'status'));
        if (status === null) {
          issues.add('unknown_status', rowNo);
          status = 'open';
        }
        let treatment = mapTreatment(get(row, 'treatment'));
        if (treatment === null) {
          issues.add('unknown_treatment', rowNo);
          treatment = 'crowns_lab';
        }
        const acceptedDate = parseDate(get(row, 'acceptedDate')) ?? undefined;
        const planIdRaw = String(get(row, 'planId') ?? '').trim() || `row-${rowNo}`;
        if (seen.has(planIdRaw)) issues.add('duplicate_rows', rowNo);
        seen.add(planIdRaw);
        records.plans.push({
          id: planIdRaw,
          patientId,
          dentistId: '',
          treatment,
          value,
          created,
          status,
          acceptedDate: status === 'accepted' ? (acceptedDate ?? created) : undefined,
          closedDate: status === 'declined' || status === 'expired' ? (parseDate(get(row, 'closedDate')) ?? undefined) : undefined,
          instalmentsOffered: has.instalments ? mapInstalments(get(row, 'instalments')) : 'unknown',
          declineReason: status === 'declined' ? mapDeclineReason(get(row, 'declineReason')) : undefined,
          _staff: staffRaw(),
        });
        ready++;
        return;
      }
      case 'patients': {
        const id = patientKey(get(row, 'patientId'));
        if (!id) return issues.add('skipped_no_patient', rowNo);
        if (seen.has(id)) {
          issues.add('duplicate_patients', rowNo);
          return;
        }
        seen.add(id);
        const flags: string[] = [];
        const payer = mapPayer(get(row, 'payer'));
        if (!payer) {
          issues.add('no_payer', rowNo);
          flags.push('no_payer');
        }
        const channel = mapChannel(get(row, 'channel'));
        const firstVisit = parseDate(get(row, 'firstVisit'));
        if (!channel) {
          issues.add('no_source', rowNo);
          flags.push('no_source');
        }
        records.patients.push({
          id,
          firstVisit,
          payer,
          channel,
          district: districtFromPostcode(get(row, 'postcode')),
          birthYearRange: birthDecade(get(row, 'birthYear')),
          ...(flags.length ? { flags } : {}),
        });
        ready++;
        return;
      }
      case 'recall': {
        const patientId = patientKey(get(row, 'patientId'));
        if (!patientId) return issues.add('skipped_no_patient', rowNo);
        const due = parseDate(get(row, 'due'));
        if (!due) return issues.add('skipped_no_date', rowNo);
        records.recalls.push({ patientId, due, createdAt: parseDate(get(row, 'createdAt')) ?? undefined });
        ready++;
        return;
      }
      case 'requests': {
        const receivedAt = parseDateTime(get(row, 'receivedAt'));
        if (!receivedAt) return issues.add('skipped_no_date', rowNo);
        const source = mapChannel(get(row, 'source')) ?? mapChannel(get(row, 'channel'));
        if (!source) issues.add('no_source', rowNo);
        const replyCell = get(row, 'firstReplyAt');
        records.requests.push({
          id: `rq${i}`,
          receivedAt,
          channel: mapRequestChannel(get(row, 'channel'), source),
          source,
          firstReplyAt: replyCell == null || replyCell === '' ? null : parseDateTime(replyCell),
          becamePatientId: patientKey(get(row, 'patientId')),
        });
        ready++;
        return;
      }
      case 'instagram': {
        const date = parseDate(get(row, 'date'));
        if (!date) return issues.add('skipped_no_date', rowNo);
        const reach = parseCount(get(row, 'reach'));
        if (reach === null) return issues.add('skipped_no_value', rowNo);
        records.igPosts.push({
          id: `ig${i}`,
          date,
          type: mapPostType(get(row, 'type')),
          reach,
          profileVisits: parseCount(get(row, 'profileVisits')) ?? 0,
          linkClicks: parseCount(get(row, 'linkClicks')) ?? 0,
        });
        const msg = parseCount(get(row, 'messages'));
        if (msg !== null) records.igMessages.push({ month: date.slice(0, 7), messages: msg });
        ready++;
        return;
      }
      case 'google_ads': {
        const month = parseMonth(get(row, 'month'));
        if (!month) return issues.add('skipped_no_date', rowNo);
        const spend = parseAmount(get(row, 'cost'));
        if (spend === null) return issues.add('skipped_no_value', rowNo);
        records.adSpend.push({ month, platform: 'google_ads', spend });
        ready++;
        return;
      }
    }
  });

  return { type, records, has, report: { rowsTotal: table.rows.length, rowsReady: ready, issues: issues.list(), refused, missingRequired, staffCount: staffValues.size } };
}

export interface BuildResult {
  data: Dataset;
  /** notes shown after import, as i18n keys */
  notes: string[];
}

/** Combines processed files into one dataset. Staff values are replaced by letters; the values themselves are dropped. */
export function buildDataset(files: ProcessedFile[]): BuildResult {
  const r = empty();
  const has = (type: ImportType, key?: string) => files.some((f) => f.type === type && f.report.rowsReady > 0 && (!key || f.has[key]));
  for (const f of files) {
    r.appointments.push(...f.records.appointments);
    r.plans.push(...f.records.plans);
    r.patients.push(...f.records.patients);
    r.recalls.push(...f.records.recalls);
    r.requests.push(...f.records.requests);
    r.igPosts.push(...f.records.igPosts);
    r.igMessages.push(...f.records.igMessages);
    r.adSpend.push(...f.records.adSpend);
  }
  const notes: string[] = [];

  // --- staff: letters by number of appointments; role from the treatments they do ---
  const counts = new Map<string, { n: number; prevention: number }>();
  const bump = (k: string | null, prevention: boolean) => {
    const key = k ?? '__none__';
    const c = counts.get(key) ?? { n: 0, prevention: 0 };
    c.n++;
    if (prevention) c.prevention++;
    counts.set(key, c);
  };
  for (const a of r.appointments) bump(a._staff, a.treatment === 'prevention');
  for (const p of r.plans) bump(p._staff, false);
  const order = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `S${i + 1}`);
  const idOf = new Map<string, string>();
  const staff: StaffMember[] = order.map(([key, c], i) => {
    const id = letter(i);
    idOf.set(key, id);
    return { id, label: id, role: c.n > 0 && c.prevention / c.n > 0.6 ? 'hygienist' : 'dentist', focus: [], weeklyHours: 0, absences: [] };
  });
  if (!staff.length) staff.push({ id: 'A', label: 'A', role: 'dentist', focus: [], weeklyHours: 0, absences: [] });
  const sid = (k: string | null) => idOf.get(k ?? '__none__') ?? staff[0].id;

  const appointments: Appointment[] = r.appointments.map(({ _staff, _lab, ...a }) => ({ ...a, staffId: sid(_staff) }));
  const labWork: LabWork[] = r.appointments
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a._lab !== null && a._lab > 0 && a.status === 'completed')
    .map(({ a, i }) => ({ appointmentId: appointments[i].id, amount: a._lab! }));
  const plans: TreatmentPlan[] = r.plans.map(({ _staff, ...p }) => ({ ...p, dentistId: sid(_staff) }));

  // --- patients: the patient file plus everyone mentioned elsewhere ---
  const patients = new Map<string, Patient>(r.patients.map((p) => [p.id, p]));
  const mention = (id: string | null) => {
    if (id && !patients.has(id)) patients.set(id, { id, firstVisit: null, payer: null, channel: null, district: null, birthYearRange: null, flags: ['not_in_patient_file'] });
  };
  for (const a of appointments) mention(a.patientId);
  for (const p of plans) mention(p.patientId);
  for (const x of r.recalls) mention(x.patientId);
  for (const q of r.requests) mention(q.becamePatientId);
  if (!r.patients.length) notes.push('import.note.noPatientFile');
  if (r.patients.length && !files.some((f) => f.type === 'patients' && f.has.firstVisit)) notes.push('import.note.noFirstVisit');

  // --- month range ---
  const dates = [
    ...appointments.map((a) => a.at.slice(0, 10)),
    ...plans.map((p) => p.created),
    ...r.requests.map((q) => q.receivedAt.slice(0, 10)),
    ...r.igPosts.map((p) => p.date),
    ...r.adSpend.map((s) => `${s.month}-01`),
  ].sort();
  const anchor = appointments.length ? appointments.map((a) => a.at.slice(0, 10)).sort() : dates;
  const firstMonth = anchor.length ? monthOf(anchor[0]) : monthOf(new Date().toISOString());
  const lastMonth = anchor.length ? monthOf(anchor[anchor.length - 1]) : firstMonth;

  const igMonthlyMap = new Map<string, number>();
  for (const m of r.igMessages) igMonthlyMap.set(m.month, (igMonthlyMap.get(m.month) ?? 0) + m.messages);
  const igMonthly: InstagramMonthly[] = [...igMonthlyMap.entries()].map(([month, messages]) => ({ month, messages }));

  const sources = Object.fromEntries(SOURCE_KEYS.map((k) => [k, false])) as Dataset['sources'];
  sources.pvs = has('appointments');
  sources.lab = has('appointments', 'labAmount');
  sources.instalments = has('plans', 'instalments');
  sources.webform = has('requests');
  sources.inbox = has('requests', 'firstReplyAt');
  sources.phone = r.requests.some((q) => q.channel === 'phone');
  sources.instagram = has('instagram');
  sources.google_ads = has('google_ads');
  if (!has('appointments')) notes.push('import.note.noAppointments');
  if (!files.some((f) => f.type === 'appointments' && f.has.nextBooked)) notes.push('import.note.noNextBooked');
  notes.push('import.note.noCapacity');

  appointments.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  r.requests.sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1));

  return {
    data: {
      mode: 'real',
      firstMonth,
      lastMonth,
      staff,
      patients: [...patients.values()],
      appointments,
      labWork,
      plans,
      recalls: r.recalls,
      capacity: [],
      requests: r.requests,
      igPosts: r.igPosts,
      igMonthly,
      adSpend: r.adSpend,
      reviews: [],
      events: [],
      sources,
    },
    notes,
  };
}
