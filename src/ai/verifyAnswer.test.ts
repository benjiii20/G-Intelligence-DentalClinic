import { describe, expect, it } from 'vitest';
import { buildPool, collectNumbers, extractNumbers, parseNumber, verifyAnswer } from './verifyAnswer';

describe('parseNumber', () => {
  it('parses German formats', () => {
    expect(parseNumber('118.600', 'de')).toBe(118600);
    expect(parseNumber('1.234.567', 'de')).toBe(1234567);
    expect(parseNumber('1,40', 'de')).toBe(1.4);
    expect(parseNumber('46', 'de')).toBe(46);
    expect(parseNumber('1.234,56', 'de')).toBe(1234.56);
    expect(parseNumber('2,5', 'de')).toBe(2.5);
    expect(parseNumber('118 600', 'de')).toBe(118600);
    expect(parseNumber('118 600', 'de')).toBe(118600);
  });
  it('parses English formats', () => {
    expect(parseNumber('118,600', 'en')).toBe(118600);
    expect(parseNumber('1,234,567', 'en')).toBe(1234567);
    expect(parseNumber('1.40', 'en')).toBe(1.4);
    expect(parseNumber('1,234.56', 'en')).toBe(1234.56);
    expect(parseNumber('4.57', 'en')).toBe(4.57);
  });
  it('treats a single separator by language', () => {
    // "1.234" is 1234 in German but 1.234 in English; "1,234" the other way round
    expect(parseNumber('1.234', 'de')).toBe(1234);
    expect(parseNumber('1.234', 'en')).toBe(1.234);
    expect(parseNumber('1,234', 'en')).toBe(1234);
    expect(parseNumber('1,234', 'de')).toBe(1.234);
  });
  it('handles minus signs and dashes', () => {
    expect(parseNumber('-13.907', 'de')).toBe(-13907);
    expect(parseNumber('−13.907', 'de')).toBe(-13907);
    expect(parseNumber('–13,907', 'en')).toBe(-13907);
    expect(parseNumber('+2.589', 'de')).toBe(2589);
  });
});

describe('extractNumbers', () => {
  it('finds numbers with their units', () => {
    const de = extractNumbers('Der Umsatz lag bei 120.120 €, das sind −13.907 € (−10,4 %) weniger. Rund 120 Tsd. €.', 'de');
    expect(de.map((n) => n.value)).toEqual([120120, -13907, -10.4, 120]);
    expect(de[2].percent).toBe(true);
    expect(de[3].thousands).toBe(true);
    const en = extractNumbers('Revenue was €120,120, down €13,907 (10.4%). About 120k.', 'en');
    expect(en.map((n) => n.value)).toEqual([120120, 13907, 10.4, 120]);
    expect(en[3].thousands).toBe(true);
  });
  it('ignores patient ids, plan numbers and ranges are not negative', () => {
    expect(extractNumbers('Patient #4812 und Plan HKP-0612: 3.300 €', 'de').map((n) => n.value)).toEqual([3300]);
    expect(extractNumbers('zwischen 60–90 Tagen', 'de').map((n) => n.value)).toEqual([60, 90]);
    expect(extractNumbers('CGM Z1 export', 'en')).toEqual([]);
  });
});

describe('collectNumbers / buildPool', () => {
  it('walks nested tool results and skips dates', () => {
    const nums = collectNumbers({ a: 1, period: '2026-10-01 to 2026-10-31', list: [{ b: 2.5, text: '56 percent of late replies' }], c: null });
    expect(nums).toEqual([1, 2.5, 56]);
  });
  it('adds absolute values and percent forms of shares', () => {
    const pool = buildPool([-13907, 0.46]);
    expect(pool).toContain(13907);
    expect(pool).toContain(46);
  });
});

describe('verifyAnswer', () => {
  const tool = { revenue_eur: 120120, previous_revenue_eur: 134027, change_eur: -13907, change_pct: -10.4, fast_pct: 43, share: 0.46, return_per_eur: 4.57, sessions: 7, visits: 904 };
  const nums = collectNumbers(tool);

  it('accepts German formatting and rounding', () => {
    const r = verifyAnswer('Der Umsatz fiel von 134.027 € auf 120.120 €, also um 13.907 € (−10,4 %). Rund 120.000 € bei 904 Terminen.', nums, { lang: 'de' });
    expect(r.bad).toEqual([]);
    expect(r.ok).toBe(5); // −10,4 is below the "ignore up to 31" threshold
  });
  it('accepts English formatting, k amounts and shares as percent', () => {
    const r = verifyAnswer('Revenue fell from €134,027 to €120,120 (about 134k to 120k). 46% of plans; return of 4.57 per euro... 43% answered fast.', nums, { lang: 'en' });
    expect(r.bad).toEqual([]);
    expect(r.ok).toBe(6);
  });
  it('accepts "Tsd." and negative numbers', () => {
    const r = verifyAnswer('Etwa 134 Tsd. € im September, −13.907 € im Oktober.', nums, { lang: 'de' });
    expect(r.bad).toEqual([]);
    expect(r.ok).toBe(2);
  });
  it('tolerates rounding up to 1.5 % but not more', () => {
    expect(verifyAnswer('etwa 121.500 €', nums, { lang: 'de' }).bad).toEqual([]);
    expect(verifyAnswer('etwa 123.000 €', nums, { lang: 'de' }).bad).toEqual(['123.000']);
  });
  it('flags an invented number', () => {
    const r = verifyAnswer('Der Gewinn lag bei 38.500 € und der Umsatz bei 120.120 €.', nums, { lang: 'de' });
    expect(r.ok).toBe(1);
    expect(r.bad).toEqual(['38.500']);
  });
  it('flags an invented percentage and an invented k amount', () => {
    const r = verifyAnswer('Margin was 62% on about 95k.', nums, { lang: 'en' });
    expect(r.bad).toEqual(['62', '95k']);
  });
  it('ignores small numbers, years and numbers from the question', () => {
    const r = verifyAnswer('Im Oktober 2026 fehlten 7 Sitzungen an 5 Tagen; Sie fragten nach 250 Patienten.', nums, { lang: 'de', question: 'Was wäre bei 250 Patienten?' });
    expect(r).toEqual({ ok: 0, bad: [] });
  });
  it('does not ignore a year-like number when it is clearly not a year', () => {
    expect(verifyAnswer('2026 % mehr', nums, { lang: 'de' }).bad).toEqual(['2026']);
  });
});
