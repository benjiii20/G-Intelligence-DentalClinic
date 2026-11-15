// Reading files, recognising their type, mapping columns and refusing personal columns.
import Papa from 'papaparse';
import type { Cell } from './normalize';
import { FIELDS, FORBIDDEN_COLUMN, IMPORT_TYPES, normalizeHeader, type ImportType } from './schema';

export interface Table {
  headers: string[];
  rows: Cell[][];
}

export type Mapping = Record<string, number | null>; // field key → column index

export interface RefusedColumn {
  index: number;
  header: string;
  reason: 'name_or_contact' | 'free_text' | 'health' | 'looks_like_names';
}

/** CSV (any delimiter, with or without BOM) → table. */
export function parseCsv(text: string): Table {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const all = res.data.filter((r) => r.some((c) => String(c).trim() !== ''));
  const [headers = [], ...rows] = all;
  return { headers: headers.map((h) => String(h).trim()), rows };
}

/** Excel → table (first sheet). Loaded on demand to keep the app small. */
export async function parseExcel(buffer: ArrayBuffer): Promise<Table> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  const [headers = [], ...rows] = all;
  return { headers: headers.map((h) => String(h ?? '').trim()), rows: rows.filter((r) => r.some((c) => c != null && String(c).trim() !== '')) };
}

export async function readFile(file: File): Promise<Table> {
  if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) return parseExcel(await file.arrayBuffer());
  const buf = await file.arrayBuffer();
  // exports from German software are often Windows-1252
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
  return parseCsv(text);
}

function aliasScore(header: string, aliases: string[]): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const a of aliases) {
    if (h === a) best = Math.max(best, 3);
    else if (h.replace(/ /g, '') === a.replace(/ /g, '')) best = Math.max(best, 3);
    else if (h.startsWith(`${a} `) || h.endsWith(` ${a}`)) best = Math.max(best, 2);
    else if (a.length >= 5 && h.includes(a)) best = Math.max(best, 1);
  }
  return best;
}

/** Suggests a column for each field; each column is used at most once, best matches first. */
export function autoMap(type: ImportType, headers: string[], refused: number[] = []): Mapping {
  const candidates: { field: string; index: number; score: number }[] = [];
  for (const field of FIELDS[type]) {
    headers.forEach((h, index) => {
      if (refused.includes(index)) return;
      const score = aliasScore(h, field.aliases);
      if (score) candidates.push({ field: field.key, index, score });
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const mapping: Mapping = Object.fromEntries(FIELDS[type].map((f) => [f.key, null]));
  const used = new Set<number>();
  for (const c of candidates) {
    if (mapping[c.field] !== null || used.has(c.index)) continue;
    mapping[c.field] = c.index;
    used.add(c.index);
  }
  return mapping;
}

/** Recognises the import type from the file name and the column headers. */
export function detectType(headers: string[], fileName = ''): ImportType {
  const name = normalizeHeader(fileName);
  const byName: [ImportType, RegExp][] = [
    ['plans', /hkp|plan|kostenvoranschlag/],
    ['recall', /recall/],
    ['requests', /anfrage|request|inbox|formular/],
    ['instagram', /insta|meta/],
    ['google_ads', /google|ads|kampagne/],
    ['patients', /patient/],
    ['appointments', /termin|appointment|leistung|behandlung/],
  ];
  let best: ImportType = 'appointments';
  let bestScore = -1;
  for (const type of IMPORT_TYPES) {
    const m = autoMap(type, headers);
    const fields = FIELDS[type];
    const requiredHit = fields.filter((f) => f.required && m[f.key] !== null).length / fields.filter((f) => f.required).length;
    const anyHit = fields.filter((f) => m[f.key] !== null).length / fields.length;
    let score = requiredHit * 2 + anyHit;
    if (byName.find(([t, re]) => t === type && re.test(name))) score += 0.75;
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }
  return best;
}

const HASHED = /^[a-f0-9]{16,}$/i;
const PERSON_NAME = /^(dr\.?\s+|prof\.?\s+)?[A-ZÄÖÜ][a-zäöüß]+(-[A-ZÄÖÜ][a-zäöüß]+)?(,)?\s+[A-ZÄÖÜ][a-zäöüß]+/;

/**
 * Columns that are refused: names, addresses, contact details, free-text notes, diagnoses, birth dates.
 * A hashed e-mail/phone column is allowed (it is used only for matching).
 * A patient-number column whose values look like "Firstname Lastname" is refused as well.
 */
export function refusedColumns(table: Table, mapping?: Mapping): RefusedColumn[] {
  const out: RefusedColumn[] = [];
  const sample = table.rows.slice(0, 200);
  table.headers.forEach((header, index) => {
    const h = normalizeHeader(header);
    if (FORBIDDEN_COLUMN.test(h)) {
      const values = sample.map((r) => r[index]).filter((v) => v != null && String(v).trim() !== '');
      const hashed = /mail|telefon|phone|tel|handy|mobil/.test(h) && values.length > 0 && values.every((v) => HASHED.test(String(v).trim()));
      if (hashed) return;
      const reason: RefusedColumn['reason'] = /notiz|bemerkung|kommentar|anmerkung|freitext|note|comment/.test(h) ? 'free_text' : /diagnose|befund|anamnese/.test(h) ? 'health' : 'name_or_contact';
      out.push({ index, header, reason });
    }
  });
  // the mapped patient id must not contain names
  const pid = mapping?.patientId;
  if (pid != null && !out.some((c) => c.index === pid)) {
    const values = sample.map((r) => String(r[pid] ?? '').trim()).filter(Boolean);
    const named = values.filter((v) => PERSON_NAME.test(v)).length;
    if (values.length && named / values.length > 0.3) out.push({ index: pid, header: table.headers[pid], reason: 'looks_like_names' });
  }
  return out;
}
