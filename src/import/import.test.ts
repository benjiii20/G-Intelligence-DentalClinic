import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fallbackAnswer } from '../ai/answerQuestion';
import { FALLBACK_KEYS } from '../ai/fallback';
import { TOOL_NAMES } from '../ai/toolDefs';
import { toolContext } from '../ai/toolLoop';
import { getDemoData } from '../data/demo';
import '../i18n';
import { monthFilter } from '../metrics/core';
import { planSummary } from '../metrics/plans';
import { runTool } from '../metrics/registry';
import { responseSpeed } from '../metrics/requests';
import { labRevenue, newPatients, payerMix, revenue } from '../metrics/revenue';
import { buildDataset, processFile } from './build';
import { autoMap, detectType, parseCsv, refusedColumns } from './mapping';
import { districtFromPostcode, mapStatus, mapTreatment, parseAmount, parseDate, parseDateTime, parseMonth } from './normalize';

const sample = (name: string) => parseCsv(readFileSync(new URL(`../../public/samples/${name}`, import.meta.url), 'utf-8'));
const FILES = ['termine.csv', 'behandlungsplaene.csv', 'patienten.csv', 'recall.csv', 'anfragen.csv', 'instagram.csv', 'google-ads.csv'];

describe('value parsing', () => {
  it('dates and times', () => {
    expect(parseDate('31.10.2026')).toBe('2026-10-31');
    expect(parseDate('1.2.26')).toBe('2026-02-01');
    expect(parseDate('2026-10-31')).toBe('2026-10-31');
    expect(parseDate('31.02.2026')).toBeNull();
    expect(parseDate(46326)).toBe('2026-10-31');
    expect(parseDate('morgen')).toBeNull();
    expect(parseDateTime('31.10.2026 14:30')).toBe('2026-10-31T14:30');
    expect(parseDateTime('31.10.2026', '9.05')).toBe('2026-10-31T09:05');
  });
  it('amounts in German and English notation', () => {
    expect(parseAmount('1.234,56 €')).toBe(1234.56);
    expect(parseAmount('€ 980')).toBe(980);
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(parseAmount('2.300')).toBe(2300);
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('-45,00')).toBe(-45);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(980)).toBe(980);
  });
  it('months, treatments, statuses and districts', () => {
    expect(parseMonth('Okt. 2026')).toBe('2026-10');
    expect(parseMonth('März 2026')).toBe('2026-03');
    expect(parseMonth('10/2026')).toBe('2026-10');
    expect(mapTreatment('Implantat Regio 36')).toBe('implants_surgery');
    expect(mapTreatment('PZR')).toBe('prevention');
    expect(mapTreatment('Wurzelbehandlung')).toBe('endo_perio');
    expect(mapTreatment('Krone/Brücke (Eigenlabor)')).toBe('crowns_lab');
    expect(mapTreatment('Bleaching/Veneers')).toBe('aesthetics');
    expect(mapTreatment('Kontrolle/Füllung')).toBe('checkups_cmd');
    expect(mapTreatment('xyz')).toBeNull();
    expect(mapStatus('nicht erschienen')).toBe('no_show');
    expect(mapStatus('storniert')).toBe('cancelled');
    expect(mapStatus('erledigt')).toBe('completed');
    expect(mapStatus('vielleicht')).toBeNull();
    expect(districtFromPostcode('14193')).toBe('grunewald');
    expect(districtFromPostcode('10627 Berlin')).toBe('charlottenburg');
  });
});

describe('column mapping', () => {
  it('recognises the file type and German column names', () => {
    const t = sample('termine.csv');
    expect(detectType(t.headers, 'export.csv')).toBe('appointments');
    const m = autoMap('appointments', t.headers);
    expect(t.headers[m.date!]).toBe('Datum');
    expect(t.headers[m.patientId!]).toBe('Patienten-Nr.');
    expect(t.headers[m.staff!]).toBe('Behandler');
    expect(t.headers[m.treatment!]).toBe('Leistung');
    expect(t.headers[m.amount!]).toBe('Betrag');
    expect(t.headers[m.labAmount!]).toBe('Labor');
    const types = FILES.map((f) => detectType(sample(f).headers, f));
    expect(types).toEqual(['appointments', 'plans', 'patients', 'recall', 'requests', 'instagram', 'google_ads']);
    const plans = sample('behandlungsplaene.csv');
    const pm = autoMap('plans', plans.headers);
    expect(plans.headers[pm.planId!]).toBe('HKP-Nr.');
    expect(plans.headers[pm.status!]).toBe('HKP-Status');
  });

  it('refuses names, contact details and free text, but allows hashed contacts', () => {
    const t = parseCsv(
      'Patienten-Nr.;Vorname;Nachname;Straße;E-Mail;Telefon;Bemerkung;Diagnose;Datum\n4812;Anna;Muster;Hauptstr. 1;8f14e45fceea167a5a36dedd4bea2543;0301234;Rückruf;Karies;01.10.2026',
    );
    const refused = refusedColumns(t, autoMap('appointments', t.headers)).map((r) => r.header);
    expect(refused).toEqual(['Vorname', 'Nachname', 'Straße', 'Telefon', 'Bemerkung', 'Diagnose']);
    // the e-mail column only holds a hash, so it may stay
    expect(refused).not.toContain('E-Mail');
    const names = parseCsv('Patient;Datum;Betrag\nAnna Muster;01.10.2026;100\nBernd Beispiel;02.10.2026;120');
    expect(refusedColumns(names, autoMap('appointments', names.headers))).toEqual([{ index: 0, header: 'Patient', reason: 'looks_like_names' }]);
  });
});

describe('validation report', () => {
  it('counts problems and imports flagged rows instead of fixing them silently', () => {
    const t = parseCsv(
      [
        'Datum;Patienten-Nr.;Leistung;Betrag;Status',
        '01.10.2026;1;PZR;120,00;erledigt',
        '01.10.2026;1;PZR;120,00;erledigt',
        'kein Datum;2;PZR;120,00;erledigt',
        '02.10.2026;;PZR;120,00;erledigt',
        '03.10.2026;3;Kontrolle;;erledigt',
        '04.10.2026;4;Zaubertrick;80;erledigt',
        '05.10.2026;5;Kontrolle;90;wer weiß',
      ].join('\n'),
    );
    const p = processFile('appointments', t, autoMap('appointments', t.headers), []);
    expect(p.report.rowsTotal).toBe(7);
    expect(p.report.rowsReady).toBe(5);
    const issue = (k: string) => p.report.issues.find((i) => i.key === k);
    expect(issue('skipped_no_date')).toMatchObject({ count: 1, rows: [4] });
    expect(issue('skipped_no_patient')).toMatchObject({ count: 1, rows: [5] });
    expect(issue('duplicate_rows')).toMatchObject({ count: 1, rows: [3] });
    expect(issue('no_amount')).toMatchObject({ count: 1, rows: [6] });
    expect(issue('unknown_treatment')).toMatchObject({ count: 1, rows: [7] });
    expect(issue('unknown_status')).toMatchObject({ count: 1, rows: [8] });
    expect(p.records.appointments.find((a) => a.patientId === '#5')!.flags).toContain('unknown_status');
  });

  it('reports missing required columns', () => {
    const t = parseCsv('Patienten-Nr.;Betrag\n1;100');
    expect(processFile('appointments', t, autoMap('appointments', t.headers), []).report.missingRequired).toEqual(['date']);
  });

  it('flags new patients without source and duplicate patients', () => {
    const t = parseCsv('Patienten-Nr.;Kostenträger;Quelle\n1;AOK;Google\n1;AOK;Google\n2;;');
    const p = processFile('patients', t, autoMap('patients', t.headers), []);
    expect(p.report.issues.find((i) => i.key === 'duplicate_patients')?.count).toBe(1);
    expect(p.report.issues.find((i) => i.key === 'no_source')?.count).toBe(1);
    expect(p.report.issues.find((i) => i.key === 'no_payer')?.count).toBe(1);
  });
});

describe('importing the sample files', () => {
  const processed = FILES.map((f) => {
    const t = sample(f);
    const type = detectType(t.headers, f);
    const mapping = autoMap(type, t.headers);
    return processFile(type, t, mapping, refusedColumns(t, mapping));
  });
  const { data } = buildDataset(processed);
  const demo = getDemoData();

  it('refuses the note column of the appointment export', () => {
    expect(processed[0].report.refused.map((r) => r.header)).toEqual(['Bemerkung']);
    expect(processed[0].report.staffCount).toBe(5);
  });

  it('produces the same key figures as the demo data it came from', () => {
    expect(data.mode).toBe('real');
    expect(data.firstMonth).toBe('2025-10');
    expect(data.lastMonth).toBe('2026-10');
    for (const m of ['2026-03', '2026-10']) {
      const f = monthFilter(m);
      expect(revenue(data, f).value).toBeCloseTo(revenue(demo, f).value!, 2);
      expect(newPatients(data, f).value).toBe(newPatients(demo, f).value);
      expect(labRevenue(data, f).value).toBeCloseTo(labRevenue(demo, f).value!, 2);
      expect(payerMix(data, f).value).toEqual(payerMix(demo, f).value);
      expect(planSummary(data, f).value!.acceptancePct).toBeCloseTo(planSummary(demo, f).value!.acceptancePct!, 6);
      expect(responseSpeed(data, f).value!.fastPct).toBeCloseTo(responseSpeed(demo, f).value!.fastPct, 6);
    }
  });

  it('keeps no staff names, assigns letters and roles, and marks sources', () => {
    expect(data.staff.map((s) => s.id).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(data.staff.filter((s) => s.role === 'hygienist')).toHaveLength(2);
    expect(JSON.stringify(data)).not.toMatch(/"K[1-5]"/);
    expect(data.sources).toMatchObject({ pvs: true, lab: true, instalments: true, webform: true, inbox: true, instagram: true, google_ads: true, gbp: false, provenexpert: false });
    // no capacity in exports: treatment time says "not enough data"
    expect(data.capacity).toEqual([]);
  });

  it('every AI tool works on the imported data', () => {
    const ctx = toolContext(data, data.lastMonth);
    for (const name of TOOL_NAMES) {
      const out = runTool(data, name, name === 'get_monthly_series' ? { metric: 'revenue_eur' } : {}, ctx);
      expect(out.error, name).toBeUndefined();
      expect(JSON.stringify(out)).not.toMatch(/K[1-5]\b/);
    }
    for (const key of FALLBACK_KEYS) {
      const a = fallbackAnswer('Wie war die Annahmequote im ersten Halbjahr?', { data, lang: 'de', month: data.lastMonth }, key);
      expect(a.text).not.toMatch(/NaN|undefined|\{\{/);
      expect(a.check.bad).toEqual([]);
    }
  });

  it('works with only some files: missing sources say so', () => {
    const only = buildDataset([processed[0]]).data;
    expect(only.sources.webform).toBe(false);
    const out = runTool(only, 'get_instagram', {}, toolContext(only, only.lastMonth));
    expect(out.missing).toBe('instagram');
    const plansOnly = buildDataset([processed[1]]).data;
    expect(runTool(plansOnly, 'get_month_summary', {}, toolContext(plansOnly, plansOnly.lastMonth)).missing).toBe('pvs');
  });
});
