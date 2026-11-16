import type { Lang } from '../state/store';

const LOCALE: Record<Lang, string> = { de: 'de-DE', en: 'en-GB' };
const MINUS = '−';

export interface Fmt {
  lang: Lang;
  /** 118.600 € / €118,600 */
  eur: (v: number | null | undefined, digits?: number) => string;
  /** +12.300 € / −12.300 € */
  eurSigned: (v: number | null | undefined) => string;
  num: (v: number | null | undefined, digits?: number) => string;
  numSigned: (v: number | null | undefined, digits?: number) => string;
  /** value is already in percent (46 -> 46 %) */
  pct: (v: number | null | undefined, digits?: number) => string;
  /** a percentage change written out: "65 % → 54 %" */
  pctFromTo: (from: number | null | undefined, to: number | null | undefined) => string;
  pctSigned: (v: number | null | undefined, digits?: number) => string;
  /** Oktober 2026 / October 2026 */
  month: (m: string) => string;
  /** Okt 26 / Oct 26 */
  monthShort: (m: string) => string;
  monthName: (m: string) => string;
  date: (d: string) => string;
  dateTime: (d: string) => string;
  weekday: (wd: number) => string;
  dash: string;
}

const cache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.NumberFormat(locale, opts)));
  return f;
}

const asUtc = (s: string): Date =>
  new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, s.length >= 10 ? +s.slice(8, 10) : 1, s.length >= 13 ? +s.slice(11, 13) : 0, s.length >= 16 ? +s.slice(14, 16) : 0));

export function makeFmt(lang: Lang): Fmt {
  const locale = LOCALE[lang];
  const dash = '–';
  const fix = (s: string) => s.replace(/^-/, MINUS);
  const eur = (v: number | null | undefined, digits = 0) =>
    v == null || !isFinite(v)
      ? dash
      : fix(nf(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(v) < 0.5 && digits === 0 ? 0 : v));
  const num = (v: number | null | undefined, digits = 0) =>
    v == null || !isFinite(v) ? dash : fix(nf(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v));
  const sign = (v: number) => (v > 0 ? '+' : '');
  const pct = (v: number | null | undefined, digits = 0) =>
    v == null || !isFinite(v) ? dash : fix(nf(locale, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v / 100));
  return {
    lang,
    dash,
    eur,
    eurSigned: (v) => (v == null || !isFinite(v) ? dash : sign(Math.round(v)) + eur(v)),
    num,
    numSigned: (v, digits = 0) => (v == null || !isFinite(v) ? dash : sign(v) + num(v, digits)),
    pct,
    pctSigned: (v, digits = 0) => (v == null || !isFinite(v) ? dash : sign(v) + pct(v, digits)),
    pctFromTo: (from, to) => `${pct(from)} → ${pct(to)}`,
    month: (m) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(asUtc(m)),
    monthShort: (m) => new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(asUtc(m)),
    monthName: (m) => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(asUtc(m)),
    date: (d) => new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(asUtc(d)),
    dateTime: (d) =>
      new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(asUtc(d)),
    // 2024-01-01 was a Monday
    weekday: (wd) => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, wd === 0 ? 7 : wd))),
  };
}

const fmts: Record<Lang, Fmt> = { de: makeFmt('de'), en: makeFmt('en') };
export const fmtFor = (lang: Lang): Fmt => fmts[lang];
