import { describe, expect, it } from 'vitest';
import { missedAppointments, weekdayUtilisation } from '../metrics/capacity';
import { monthFilter } from '../metrics/core';
import { instagramFunnel } from '../metrics/instagram';
import { adsReturn, channelTable, districtTable } from '../metrics/marketing';
import { acceptanceByDentist, instalmentComparison, planSummary } from '../metrics/plans';
import { overduePatients } from '../metrics/recall';
import { onlineRequests, responseSpeed } from '../metrics/requests';
import { appointmentCount, newPatients, revenue, revenueByStaff, revenueByTreatment } from '../metrics/revenue';
import { monthsBetween } from './dates';
import { generateDemo, getDemoData } from './demo';

const d = getDemoData();
const OCT = monthFilter('2026-10');
const SEP = monthFilter('2026-09');
const HALF = { from: '2026-05-01', to: '2026-10-31' };
const months = monthsBetween(d.firstMonth, d.lastMonth);

describe('demo data generator', () => {
  it('is deterministic', () => {
    const a = generateDemo();
    const b = generateDemo();
    expect(a.appointments.length).toBe(b.appointments.length);
    expect(a.appointments[500]).toEqual(b.appointments[500]);
    expect(a.plans[40]).toEqual(b.plans[40]);
    expect(a.requests[100]).toEqual(b.requests[100]);
  });
  it('covers 13 months at the right scale', () => {
    expect(months).toHaveLength(13);
    for (const m of months) {
      const f = monthFilter(m);
      expect(revenue(d, f).value!).toBeGreaterThan(100_000);
      expect(revenue(d, f).value!).toBeLessThan(140_000);
      expect(appointmentCount(d, f).value!).toBeGreaterThan(780);
      expect(appointmentCount(d, f).value!).toBeLessThan(1060);
      expect(newPatients(d, f).value!).toBeGreaterThanOrEqual(30);
      expect(newPatients(d, f).value!).toBeLessThanOrEqual(64);
    }
  });
  it('contains no names: patients are pseudonymised ids only', () => {
    for (const p of d.patients.slice(0, 200)) {
      expect(p.id).toMatch(/^#\d{4}$/);
      expect(Object.keys(p).sort()).toEqual(['birthYearRange', 'channel', 'district', 'firstVisit', 'id', 'payer']);
    }
  });
});

// The stories from the brief must be clearly visible. Ranges, not exact values.
describe('demo stories (October 2026)', () => {
  it('revenue falls about 10 %, mainly through fewer implant cases', () => {
    const drop = 1 - revenue(d, OCT).value! / revenue(d, SEP).value!;
    expect(drop).toBeGreaterThan(0.06);
    expect(drop).toBeLessThan(0.14);
    const imp = (f: typeof OCT) => revenueByTreatment(d, f).value!.find((r) => r.treatment === 'implants_surgery')!;
    expect(imp(OCT).sessions).toBeLessThan(imp(SEP).sessions);
    const implantDrop = imp(SEP).revenue - imp(OCT).revenue;
    expect(implantDrop).toBeGreaterThan(0.5 * (revenue(d, SEP).value! - revenue(d, OCT).value!));
  });
  it('Dentist A was on holiday for 5 days', () => {
    expect(d.events.some((e) => e.type === 'holiday' && e.staffId === 'A' && e.from === '2026-10-12' && e.to === '2026-10-16')).toBe(true);
  });
  it('plan acceptance drops by at least 7 points, most clearly for Dentist A', () => {
    const oct = planSummary(d, OCT).value!.acceptancePct!;
    const sep = planSummary(d, SEP).value!.acceptancePct!;
    expect(sep - oct).toBeGreaterThanOrEqual(7);
    const a = acceptanceByDentist(d, OCT, SEP).value!.find((r) => r.dentistId === 'A')!;
    expect(a.previousAcceptancePct! - a.acceptancePct!).toBeGreaterThan(8);
  });
  it('online requests hit a record while fast replies drop by at least 10 points', () => {
    const oct = onlineRequests(d, OCT).value!;
    for (const m of months.slice(0, -1)) expect(onlineRequests(d, monthFilter(m)).value!).toBeLessThan(oct);
    const so = responseSpeed(d, OCT).value!;
    const ss = responseSpeed(d, SEP).value!;
    expect(ss.fastPct - so.fastPct).toBeGreaterThanOrEqual(10);
    expect(so.slowWeekendPct!).toBeGreaterThan(35);
    // fast replies convert roughly twice as often
    expect(so.fastConversionPct! / so.slowConversionPct!).toBeGreaterThan(1.5);
  });
  it('plans with an instalment offer are accepted clearly more often, but offers are rare', () => {
    const c = instalmentComparison(d, HALF).value!;
    expect(c.withOfferPct! - c.withoutOfferPct!).toBeGreaterThanOrEqual(10);
    expect(c.offeredSharePct!).toBeGreaterThan(20);
    expect(c.offeredSharePct!).toBeLessThan(40);
  });
  it('missed appointments rise, mostly check-ups and cleanings', () => {
    const o = missedAppointments(d, OCT).value!;
    const s = missedAppointments(d, SEP).value!;
    expect(o.total).toBeGreaterThan(s.total * 1.3);
    expect(o.byTreatment.slice(0, 2).map((r) => r.treatment).sort()).toEqual(['checkups_cmd', 'prevention']);
  });
  it('Prophylaxe E books the next appointment less often; many overdue patients were last seen by E', () => {
    const rows = revenueByStaff(d, OCT).value!;
    const e = rows.find((r) => r.staffId === 'E')!.nextBookedPct!;
    const others = rows.filter((r) => r.staffId !== 'E').map((r) => r.nextBookedPct!);
    expect(e).toBeLessThan(Math.min(...others) - 10);
    const overdue = overduePatients(d, OCT).value!;
    const by = (id: string) => overdue.filter((o) => o.lastSeenBy === id).length;
    for (const id of ['A', 'B', 'C', 'D']) expect(by('E')).toBeGreaterThan(by(id));
  });
  it('Wednesday and Friday are the quietest days', () => {
    const rows = weekdayUtilisation(d, HALF).value!;
    const sorted = [...rows].sort((a, b) => a.usedPct! - b.usedPct!).slice(0, 2).map((r) => r.weekday).sort();
    expect(sorted).toEqual([3, 5]);
  });
  it('Instagram: 12–18 posts a month; before & after brings the most patients; team posts reach most', () => {
    for (const m of months) {
      const posts = instagramFunnel(d, monthFilter(m)).value!.posts;
      expect(posts).toBeGreaterThanOrEqual(12);
      expect(posts).toBeLessThanOrEqual(18);
    }
    const types = instagramFunnel(d, HALF).value!.byPostType;
    expect(types[0].type).toBe('before_after');
    const reachTop = [...types].sort((a, b) => b.avgReach! - a.avgReach!)[0];
    expect(reachTop.type).toBe('team');
    expect(reachTop.requests).toBeLessThan(types[0].requests / 4);
  });
  it('channels: referrals convert best, Instagram worse than Google; Google Ads pays back', () => {
    const rows = channelTable(d, HALF).value!.rows;
    const conv = (c: string) => rows.find((r) => r.channel === c)!.conversionPct!;
    expect(conv('referral')).toBeGreaterThan(conv('google'));
    expect(conv('google')).toBeGreaterThan(conv('instagram'));
    expect(rows.find((r) => r.channel === 'intl_site')!.newPatients).toBeGreaterThan(5);
    expect(adsReturn(d, HALF).value!.returnPerEuro!).toBeGreaterThan(2);
    const noSource = channelTable(d, { from: '2025-10-01', to: '2026-10-31' }).value!.noSourcePct!;
    expect(noSource).toBeGreaterThan(3);
    expect(noSource).toBeLessThan(12);
  });
  it('districts: most new patients from Charlottenburg and Westend; Grunewald brings most per patient', () => {
    const rows = districtTable(d, { from: '2025-10-01', to: '2026-10-31' }).value!;
    expect(rows.slice(0, 2).map((r) => r.district)).toEqual(['charlottenburg', 'westend']);
    const top = [...rows].filter((r) => r.value6m !== null).sort((a, b) => b.value6m! - a.value6m!)[0];
    expect(top.district).toBe('grunewald');
  });
});
