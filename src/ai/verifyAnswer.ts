// Answer check: every number in an AI answer must come from a tool result of this conversation.
// See Appendix C of the brief.
import type { Lang } from '../state/store';

export interface ExtractedNumber {
  raw: string;
  value: number;
  /** the number was followed by "k" / "Tsd." (thousands) */
  thousands: boolean;
  percent: boolean;
}

export interface Verification {
  ok: number;
  bad: string[];
}

const NUMBER_RE = /[-−–+]?\d{1,3}(?:[.,   ]\d{3})+(?:[.,]\d+)?|[-−–+]?\d+(?:[.,]\d+)?/g;

/** Parses one number string in German or English notation. */
export function parseNumber(raw: string, lang: Lang): number {
  let s = raw.trim();
  let sign = 1;
  if (/^[-−–]/.test(s)) sign = -1;
  s = s.replace(/^[-−–+]/, '').replace(/[   ]/g, '');
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // the last one is the decimal separator
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thousands = dec === '.' ? ',' : '.';
    s = s.split(thousands).join('').replace(dec, '.');
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const groups = s.split(sep);
    const allThree = groups.slice(1).every((g) => g.length === 3) && groups[0].length <= 3 && groups[0].length > 0;
    const isThousandsSep = sep === (lang === 'de' ? '.' : ',');
    if (allThree && (isThousandsSep || groups.length > 2)) s = groups.join('');
    else s = groups.length === 2 ? `${groups[0]}.${groups[1]}` : groups.join('');
  }
  return sign * parseFloat(s);
}

/** Extracts every number from a text. */
export function extractNumbers(text: string, lang: Lang): ExtractedNumber[] {
  const out: ExtractedNumber[] = [];
  // ids like "#4812" and plan numbers like "HKP-0612" are labels, not figures
  const cleaned = text.replace(/#\d+/g, (m) => ' '.repeat(m.length)).replace(/\b[A-Za-z]{2,}-\d+\b/g, (m) => ' '.repeat(m.length));
  for (const m of cleaned.matchAll(NUMBER_RE)) {
    let raw = m[0];
    const start = m.index ?? 0;
    const before = cleaned.slice(Math.max(0, start - 1), start);
    // a hyphen or dash between two numbers or words is a range ("5–10") or a compound, not a minus sign
    if (/^[-–]/.test(raw) && /[\dA-Za-zÄÖÜäöüß)]/.test(before)) raw = raw.slice(1);
    if (/[A-Za-zÄÖÜäöüß]/.test(before) && !/^[-−–+]/.test(m[0])) continue; // part of a word such as "Q3" or "Z1"
    const value = parseNumber(raw, lang);
    if (!isFinite(value)) continue;
    const after = cleaned.slice(start + m[0].length, start + m[0].length + 8);
    out.push({
      raw,
      value,
      thousands: /^\s?(k\b|Tsd\.?|T€|thousand|Tausend)/i.test(after),
      percent: /^\s?(%|Prozent|percent|Punkte|points|Prozentpunkte)/i.test(after),
    });
  }
  return out;
}

/** Collects every number in a tool result (any depth), including numbers inside strings. */
export function collectNumbers(value: unknown, into: number[] = []): number[] {
  if (typeof value === 'number' && isFinite(value)) into.push(value);
  else if (typeof value === 'string') {
    // dates, months and periods in strings are not figures
    const stripped = value.replace(/\d{4}-\d{2}(-\d{2})?(T\d{2}:\d{2})?/g, ' ');
    for (const n of extractNumbers(stripped, 'en')) into.push(n.value);
  } else if (Array.isArray(value)) for (const v of value) collectNumbers(v, into);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectNumbers(v, into);
  return into;
}

/** The pool of allowed values: each tool number, its absolute value, ×100 for shares ≤ 1 and ÷1000 for "k" amounts. */
export function buildPool(numbers: number[]): number[] {
  const pool = new Set<number>();
  for (const n of numbers) {
    pool.add(n);
    pool.add(Math.abs(n));
    if (Math.abs(n) <= 1) pool.add(Math.abs(n) * 100);
  }
  return [...pool];
}

const matches = (answer: number, poolValue: number): boolean => Math.abs(answer - poolValue) <= Math.max(0.6, Math.abs(poolValue) * 0.015);

export interface VerifyOptions {
  lang: Lang;
  /** the user's question: numbers that appear in it are not checked */
  question?: string;
  /** years in the data range, e.g. [2025, 2026] */
  years?: number[];
}

/**
 * Checks an answer against the numbers returned by the tools.
 * Ignored: values up to 31, the years of the data range, and numbers from the question.
 */
export function verifyAnswer(text: string, toolNumbers: number[], opts: VerifyOptions): Verification {
  const pool = buildPool(toolNumbers);
  const years = new Set(opts.years ?? [2025, 2026]);
  const fromQuestion = opts.question ? extractNumbers(opts.question, opts.lang).map((n) => Math.abs(n.value)) : [];
  let ok = 0;
  const bad: string[] = [];
  for (const n of extractNumbers(text, opts.lang)) {
    const abs = Math.abs(n.value);
    if (abs <= 31 && !n.thousands) continue;
    if (Number.isInteger(abs) && years.has(abs) && !n.percent) continue;
    if (fromQuestion.some((q) => q === abs)) continue;
    const candidates = n.thousands ? [abs * 1000] : [abs];
    const hit = candidates.some((c) => pool.some((p) => matches(c, Math.abs(p))));
    if (hit) ok++;
    else bad.push(n.thousands ? `${n.raw}k` : n.raw);
  }
  return { ok, bad };
}
