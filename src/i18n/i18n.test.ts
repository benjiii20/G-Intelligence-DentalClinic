import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';
import glossaryDe from './glossary/de.json';
import glossaryEn from './glossary/en.json';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const DE = flatten(de as Tree);
const EN = flatten(en as Tree);
const GDE = flatten(glossaryDe as Tree);
const GEN = flatten(glossaryEn as Tree);

/** Words that are correct in both languages (brands, product names, loan words, abbreviations). */
const ALLOW = new Set(
  [
    'marketing', 'instagram', 'google', 'ads', 'meta', 'business', 'suite', 'profile', 'doctolib', 'provenexpert', 'recall', 'cmd', 'pzr', 'hkp', 'gkv', 'pkv',
    'online', 'team', 'website', 'dentalfirst', 'g-intelligence', 'intelligence', 'dampsoft', 'charly', 'cgm', 'z1', 'evident', 'datev', 'csv', 'excel', 'pdf',
    'e-mail', 'link', 'links', 'bleaching', 'veneers', 'aligner', 'dm', 'bio', 'gbt', 'utm', 'ig', 'ki', 'ai', 'k1', 'westend', 'grunewald', 'charlottenburg',
    'wilmersdorf', 'spandau', 'schöneberg', 'berlin', 'reichsstraße', 'nowak', 'conversions', 'clicks', 'reels', 'posts', 'post', 'social', 'media', 'tipps',
    'status', 'details', 'airflow', 'invisalign', 'de', 'en', 'nr', 'eur', 'tsd', 'k', 'x', 'a', 'b', 'c', 'd', 'e', 'z', 'okt', 'oct',
  ].map((w) => w.toLowerCase()),
);

/** Common English words that should not appear in German text. */
const ENGLISH = /\b(the|and|with|your|you|this|that|these|those|is|are|were|not|for|from|of|to|by|or|which|what|why|how|data|revenue|patients|appointments|requests|treatment|month|week|click|please|here|there|than|more|less|cannot|should|would)\b/i;
/** Common German words that should not appear in English text. */
const GERMAN = /\b(der|die|das|und|nicht|mit|ist|sind|für|von|bei|oder|auch|noch|wurde|wurden|Sie|Ihre|Ihr|Umsatz|Patienten|Termine|Anfragen|Behandlung|Monat|bitte|weil|nach|zum|zur|eine|einen|einem|kein|keine)\b/;

/** Keys where the other language is quoted on purpose. */
const EXEMPT_EN = new Set([
  'mkt.channels.noSourceHint', // quotes the German question for the medical history form
  'events.demo.campaignIg',
]);
const EXEMPT_DE = new Set<string>([]);

const visible = (s: string): string =>
  s
    .replace(/\{\{[^}]+\}\}/g, ' ') // variables
    .replace(/\*\*/g, '')
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((w) => w && !ALLOW.has(w.toLowerCase()))
    .join(' ');

describe('translations', () => {
  it('de.json and en.json have identical keys', () => {
    const a = Object.keys(DE).sort();
    const b = Object.keys(EN).sort();
    expect(a.filter((k) => !(k in EN))).toEqual([]);
    expect(b.filter((k) => !(k in DE))).toEqual([]);
  });

  it('the glossary has identical keys and explains HKP, Recall, PZR, GKV/PKV and Eigenlabor', () => {
    expect(Object.keys(GDE).sort()).toEqual(Object.keys(GEN).sort());
    for (const k of ['hkp', 'recall', 'pzr', 'gkv', 'lab']) {
      expect(GDE[`${k}.text`]).toBeTruthy();
      expect(GEN[`${k}.text`]).toBeTruthy();
    }
  });

  it('variables match between languages', () => {
    const vars = (s: string) => (s.match(/\{\{\s*(\w+)\s*\}\}/g) ?? []).map((v) => v.replace(/[{}\s]/g, '')).sort();
    const mismatched = Object.keys(DE).filter((k) => JSON.stringify(vars(DE[k])) !== JSON.stringify(vars(EN[k])));
    expect(mismatched).toEqual([]);
  });

  it('no visible English in German mode', () => {
    const hits = Object.entries({ ...DE, ...GDE })
      .filter(([k]) => !EXEMPT_DE.has(k))
      .filter(([, v]) => ENGLISH.test(visible(v)))
      .map(([k, v]) => `${k}: ${v}`);
    expect(hits).toEqual([]);
  });

  it('no visible German in English mode', () => {
    const hits = Object.entries({ ...EN, ...GEN })
      .filter(([k]) => !EXEMPT_EN.has(k) && !k.startsWith('glossary'))
      .filter(([k, v]) => !(k === 'hkp.text') && GERMAN.test(visible(v)))
      .map(([k, v]) => `${k}: ${v}`);
    expect(hits).toEqual([]);
  });

  it('German uses the formal "Sie", never "du"', () => {
    const hits = Object.entries(DE).filter(([, v]) => /\b(du|dein|deine|dich|dir)\b/i.test(v));
    expect(hits).toEqual([]);
  });

  it('English uses British spelling', () => {
    const hits = Object.entries(EN).filter(([, v]) => /\b(\w+ize[sd]?|\w+yze[sd]?|color|behavior|center|favorite|anesthesia|program)\b/i.test(v) && !/size/i.test(v));
    expect(hits).toEqual([]);
  });

  it('no "weil"/"because" in fixed explanations', () => {
    const hits = [...Object.entries(DE).filter(([, v]) => /\bweil\b/i.test(v)), ...Object.entries(EN).filter(([, v]) => /\bbecause\b/i.test(v))];
    expect(hits).toEqual([]);
  });

  it('sentences stay short (at most about 20 words)', () => {
    const long: string[] = [];
    for (const [k, v] of Object.entries({ ...DE, ...EN })) {
      if (k.startsWith('banner.') || k.startsWith('fb.unknown') || k.startsWith('import.field')) continue;
      for (const sentence of v.replace(/\{\{[^}]+\}\}/g, 'X').split(/(?<=[.!?])\s+|\n/)) {
        const words = sentence.split(/\s+/).filter(Boolean).length;
        if (words > 26) long.push(`${k} (${words}): ${sentence}`);
      }
    }
    expect(long).toEqual([]);
  });
});
