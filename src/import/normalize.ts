// Turning cell values from exports into typed values. Every function returns null when unsure,
// so the validation report can show the row instead of guessing silently.
import type { CancelReason, Channel, DeclineReason, District, Instalments, Payer, PlanStatus, PostType, RequestChannel, Treatment } from '../data/types';
import { normalizeHeader } from './schema';

export type Cell = string | number | boolean | Date | null | undefined;

const pad = (n: number) => String(n).padStart(2, '0');

/** Accepts 31.10.2026, 31.10.26, 2026-10-31, 10/31/2026 (only when unambiguous), Excel serials and Date objects. Returns YYYY-MM-DD. */
export function parseDate(v: Cell): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number') {
    // Excel serial day (1900 system)
    if (v < 20000 || v > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    if (a > 12) return valid(+m[3], b, a); // day/month
    if (b > 12) return valid(+m[3], a, b); // month/day
    return valid(+m[3], b, a); // ambiguous: European order
  }
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "14:30", "14.30", "1430", Excel time fractions. Returns HH:MM or null. */
export function parseTime(v: Cell): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  if (typeof v === 'number') {
    const frac = v % 1;
    const mins = Math.round(frac * 24 * 60);
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }
  const m = String(v).trim().match(/(\d{1,2})[:.h]?(\d{2})/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${pad(+m[1])}:${pad(+m[2])}`;
}

/** A date with an optional time in the same cell ("31.10.2026 14:30"). Returns YYYY-MM-DDTHH:MM. */
export function parseDateTime(v: Cell, timeCell?: Cell): string | null {
  const date = parseDate(v);
  if (!date) return null;
  let time: string | null = null;
  if (timeCell != null && timeCell !== '') time = parseTime(timeCell);
  else if (v instanceof Date) time = parseTime(v);
  else if (typeof v === 'number') time = v % 1 ? parseTime(v) : null;
  else {
    const rest = String(v).trim().replace(/^\S+/, '');
    if (rest.trim()) time = parseTime(rest);
  }
  return `${date}T${time ?? '00:00'}`;
}

/** "1.234,56 €", "1,234.56", "€ 980", "980" → number. Empty → null. */
export function parseAmount(v: Cell): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/[€\s ]|eur/gi, '');
  if (!s) return null;
  const neg = /^-|^\(.*\)$/.test(s);
  s = s.replace(/[()+-]/g, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // "1,5" decimal; "1,234" thousands only with exactly three digits after a comma and more than one group
    s = /^\d{1,3}(,\d{3})+$/.test(s) && s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // German thousands: "1.234" → 1234
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

export function parseCount(v: Cell): number | null {
  const n = parseAmount(v);
  return n === null ? null : Math.round(n);
}

const text = (v: Cell): string => (v == null ? '' : v instanceof Date ? '' : normalizeHeader(String(v)));

export function parseYesNo(v: Cell): boolean | null {
  if (typeof v === 'boolean') return v;
  const s = text(v);
  if (!s) return null;
  if (/^(ja|j|yes|y|true|wahr|1|x|gebucht|angeboten)$/.test(s)) return true;
  if (/^(nein|n|no|false|falsch|0|nicht gebucht|nicht angeboten)$/.test(s)) return false;
  return null;
}

const TREATMENT_RULES: [Treatment, RegExp][] = [
  ['implants_surgery', /implant|chirurg|augment|sinuslift|extraktion|osteotom|knochen|weisheitsz|wsr|wurzelspitzenres|01[0-9]{2}|surg/],
  ['crowns_lab', /krone|bruecke|prothes|teleskop|inlay|onlay|labor|zahnersatz|ze\b|veneerlabor|crown|bridge|denture/],
  ['aesthetics', /aesthet|bleach|veneer|aligner|invisalign|schiene ortho|zahnaufhell|smile|esthetic|whitening/],
  ['endo_perio', /wurzel|endo|parodont|\bpa\b|pa behandlung|zahnfleisch|kuerettage|root|gum|perio|upt/],
  ['prevention', /pzr|prophylax|zahnreinigung|reinigung|gbt|biofilm|airflow|hygien|cleaning|prevention/],
  ['checkups_cmd', /kontrolle|untersuchung|\b01\b|fuellung|fullung|cmd|funktion|knirsch|schiene|beratung|schmerz|notfall|roentgen|check|filling|exam/],
];

export function mapTreatment(v: Cell): Treatment | null {
  const s = text(v);
  if (!s) return null;
  for (const [t, re] of TREATMENT_RULES) if (re.test(s)) return t;
  // already a category key?
  const k = s.replace(/ /g, '_');
  return (['implants_surgery', 'crowns_lab', 'aesthetics', 'endo_perio', 'prevention', 'checkups_cmd'] as string[]).includes(k) ? (k as Treatment) : null;
}

export function mapStatus(v: Cell): 'completed' | 'cancelled' | 'no_show' | null {
  const s = text(v);
  if (!s) return 'completed';
  if (/nicht erschienen|no ?show|ausgefallen|unentschuldigt|ne\b|missed/.test(s)) return 'no_show';
  if (/abgesagt|storn|cancel|abgebrochen|verschoben/.test(s)) return 'cancelled';
  if (/erledigt|abgeschlossen|abgerechnet|behandelt|erschienen|durchgefuehrt|completed|done|ok|fertig/.test(s)) return 'completed';
  return null;
}

export function mapPlanStatus(v: Cell): PlanStatus | null {
  const s = text(v);
  if (!s) return 'open';
  if (/angenommen|genehmigt|zugesagt|gebucht|accepted|begonnen|in behandlung|abgeschlossen|erledigt/.test(s)) return 'accepted';
  if (/abgelehnt|declined|rejected|storn/.test(s)) return 'declined';
  if (/abgelaufen|verfallen|expired/.test(s)) return 'expired';
  if (/offen|open|ausstehend|erstellt|versendet|pending|warte/.test(s)) return 'open';
  return null;
}

export function mapInstalments(v: Cell): Instalments {
  const b = parseYesNo(v);
  return b === null ? 'unknown' : b ? 'yes' : 'no';
}

export function mapPayer(v: Cell): Payer | null {
  const s = text(v);
  if (!s) return null;
  if (/gkv|gesetzlich|aok|tk\b|techniker|barmer|dak|ikk|bkk|kasse|statutory/.test(s)) return 'GKV';
  if (/pkv|privat|private|beihilfe/.test(s)) return 'PKV';
  if (/selbst|self|bar|direkt/.test(s)) return 'self';
  return null;
}

export function mapChannel(v: Cell): Channel | null {
  const s = text(v);
  if (!s) return null;
  if (/insta|\big\b/.test(s)) return 'instagram';
  if (/google|ads|suche|search|maps/.test(s)) return 'google';
  if (/empfehl|freund|familie|bekannt|referral|ueberweis|kollege/.test(s)) return 'referral';
  if (/bewertung|review|jameda|provenexpert|doctolib/.test(s)) return 'reviews';
  if (/englisch|english|russ|en site|ru site|intl|international/.test(s)) return 'intl_site';
  if (/telefon|phone|anruf/.test(s)) return 'phone';
  if (/website|web|homepage|internet|formular|form|online|mail/.test(s)) return 'website';
  return null;
}

export function mapRequestChannel(v: Cell, source: Channel | null): RequestChannel {
  const s = text(v);
  if (/insta.*(bio|link)/.test(s)) return 'instagram_bio';
  if (/insta|dm/.test(s)) return 'instagram_dm';
  if (/russ|ru\b/.test(s)) return 'site_ru';
  if (/englisch|english|en\b/.test(s)) return 'site_en';
  if (/telefon|phone|anruf/.test(s)) return 'phone';
  if (/mail/.test(s)) return 'email';
  if (/formular|form|website|web/.test(s)) return 'website_form';
  if (source === 'instagram') return 'instagram_dm';
  if (source === 'intl_site') return 'site_en';
  if (source === 'phone') return 'phone';
  return 'website_form';
}

export function mapPostType(v: Cell): PostType {
  const s = text(v);
  if (/vorher|nachher|before|after|ergebnis|result/.test(s)) return 'before_after';
  if (/implant|labor|lab|fall|case/.test(s)) return 'implant_lab';
  if (/angst|sedier|narkose|anxious|sedation|vollnarkose/.test(s)) return 'anxious';
  if (/team|praxis|behind|alltag|life|mitarbeiter/.test(s)) return 'team';
  return 'tips';
}

export function mapCancelReason(v: Cell): CancelReason {
  const s = text(v);
  if (/krank|ill|sick/.test(s)) return 'illness';
  if (/vergess|forgot/.test(s)) return 'forgot';
  if (/kosten|preis|cost|geld/.test(s)) return 'cost';
  if (s) return 'other';
  return 'not_recorded';
}

export function mapDeclineReason(v: Cell): DeclineReason {
  const s = text(v);
  if (/kosten|preis|teuer|cost|geld/.test(s)) return 'cost';
  if (/bedenk|ueberleg|think|spaeter/.test(s)) return 'wants_to_think';
  if (/zweitmeinung|second|andere praxis/.test(s)) return 'second_opinion';
  if (s) return 'other';
  return 'not_recorded';
}

/** Berlin postcodes → district (only the districts the app reports on; others are "other"). */
export function districtFromPostcode(v: Cell): District | null {
  const s = String(v ?? '').trim();
  const m = s.match(/\b(\d{5})\b/);
  if (!m) return null;
  const n = +m[1];
  if (n >= 14050 && n <= 14059) return 'westend';
  if (n === 14193) return 'grunewald';
  if ((n >= 10585 && n <= 10629) || n === 10789) return 'charlottenburg';
  if ((n >= 10707 && n <= 10719) || (n >= 10711 && n <= 10715) || n === 14197 || n === 14199) return 'wilmersdorf';
  if (n >= 13581 && n <= 13599) return 'spandau';
  if ((n >= 10777 && n <= 10829 && n !== 10789) || n === 12157 || n === 12159) return 'schoeneberg';
  return 'other';
}

/** A birth year or year range cell → "1970-1979". */
export function birthDecade(v: Cell): string | null {
  const m = String(v ?? '').match(/(19|20)\d{2}/);
  if (!m) return null;
  const decade = Math.floor(+m[0] / 10) * 10;
  return `${decade}-${decade + 9}`;
}

/** Month cell for ad exports: "Okt. 2026", "2026-10", "10/2026", a date. Returns YYYY-MM. */
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, mae: 3, mrz: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
export function parseMonth(v: Cell): string | null {
  const d = parseDate(v);
  if (d) return d.slice(0, 7);
  const s = text(v);
  let m = s.match(/^(\d{4}) (\d{1,2})$/) ?? s.match(/^(\d{4})(\d{2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${pad(+m[2])}`;
  m = s.match(/^(\d{1,2}) (\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${pad(+m[1])}`;
  m = s.match(/^([a-z]{3})[a-z]* (\d{2,4})$/);
  if (m && MONTHS[m[1]]) return `${m[2].length === 2 ? `20${m[2]}` : m[2]}-${pad(MONTHS[m[1]])}`;
  return null;
}

/** A patient number from an export, pseudonymised as "#…". */
export function patientKey(v: Cell): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/^#/, '');
  if (!s) return null;
  return `#${s}`;
}
