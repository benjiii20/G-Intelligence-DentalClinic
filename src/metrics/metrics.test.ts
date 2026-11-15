import { describe, expect, it } from 'vitest';
import { addWorkingMinutes, monthsBetween, workingMinutesBetween } from '../data/dates';
import { getDemoData } from '../data/demo';
import type { Appointment, Dataset, Patient, Request, TreatmentPlan } from '../data/types';
import { SOURCE_KEYS } from '../data/types';
import { revenueBridge, revenueFactors, treatmentChanges } from './bridge';
import { bookableSlots, missedAppointments, treatmentTimeUsed, weekdayUtilisation } from './capacity';
import { monthFilter, previousFilter, toCents } from './core';
import { instagramFunnel } from './instagram';
import { adsReturn, channelTable, districtTable, newPatientValue6m } from './marketing';
import { moneyOnTable, topChanges } from './opportunity';
import { acceptanceByDentist, followUpList, instalmentComparison, openPlans, planSummary } from './plans';
import { nextBookedRate, overduePatients, recallVisitValue, typicalPatientValuePerYear } from './recall';
import { isFast, onlineRequests, responseSpeed } from './requests';
import { appointmentCount, existingPatientsShare, labRevenue, newPatients, patientsSeen, payerMix, revenue, revenuePerVisit, revenueByStaff, revenueByTreatment } from './revenue';

const demo = getDemoData();
const months = monthsBetween(demo.firstMonth, demo.lastMonth);

/** A tiny hand-made dataset where every expected value can be worked out by hand. */
function tiny(overrides: Partial<Dataset> = {}): Dataset {
  const patients: Patient[] = [
    { id: '#1', firstVisit: '2020-01-10', payer: 'GKV', channel: 'referral', district: 'westend', birthYearRange: null },
    { id: '#2', firstVisit: '2026-02-03', payer: 'PKV', channel: 'google', district: 'grunewald', birthYearRange: null },
    { id: '#3', firstVisit: '2026-01-12', payer: 'self', channel: null, district: 'westend', birthYearRange: null },
  ];
  const ap = (id: string, patientId: string, staffId: string, at: string, treatment: Appointment['treatment'], billed: number, status: Appointment['status'] = 'completed', nextBooked = true): Appointment => ({
    id, patientId, staffId, at, treatment, status, billed, nextBooked,
  });
  const appointments: Appointment[] = [
    // January: 3 completed, 600.50 €
    ap('a1', '#1', 'A', '2026-01-05T09:00', 'checkups_cmd', 100),
    ap('a2', '#1', 'D', '2026-01-12T09:00', 'prevention', 100.5),
    ap('a3', '#3', 'A', '2026-01-12T10:00', 'crowns_lab', 400, 'completed', false),
    ap('a4', '#1', 'A', '2026-01-19T10:00', 'checkups_cmd', 0, 'cancelled', false),
    // February: 4 completed, 1,450.25 €
    ap('b1', '#1', 'A', '2026-02-02T09:00', 'checkups_cmd', 110),
    ap('b2', '#2', 'A', '2026-02-03T09:00', 'checkups_cmd', 140.25, 'completed', false),
    ap('b3', '#2', 'A', '2026-02-10T09:00', 'crowns_lab', 500),
    ap('b4', '#3', 'A', '2026-02-11T09:00', 'implants_surgery', 700),
    ap('b5', '#3', 'D', '2026-02-12T09:00', 'prevention', 0, 'no_show', false),
  ];
  const plans: TreatmentPlan[] = [
    { id: 'p1', patientId: '#2', dentistId: 'A', treatment: 'crowns_lab', value: 1000, created: '2026-02-03', status: 'accepted', acceptedDate: '2026-02-05', instalmentsOffered: 'yes' },
    { id: 'p2', patientId: '#3', dentistId: 'A', treatment: 'implants_surgery', value: 3000, created: '2026-02-11', status: 'open', instalmentsOffered: 'no' },
    { id: 'p3', patientId: '#1', dentistId: 'A', treatment: 'crowns_lab', value: 1000, created: '2025-10-01', status: 'open', instalmentsOffered: 'unknown' },
    { id: 'p4', patientId: '#1', dentistId: 'A', treatment: 'aesthetics', value: 500, created: '2026-02-20', status: 'declined', closedDate: '2026-03-01', instalmentsOffered: 'no', declineReason: 'cost' },
  ];
  const requests: Request[] = [
    // Monday 10:00, answered 11:00 -> fast, became patient
    { id: 'r1', receivedAt: '2026-02-02T10:00', channel: 'website_form', source: 'google', firstReplyAt: '2026-02-02T11:00', becamePatientId: '#2' },
    // Friday 15:30, answered Monday 10:30 -> 30 + 150 = 180 working minutes -> slow
    { id: 'r2', receivedAt: '2026-02-06T15:30', channel: 'email', source: 'website', firstReplyAt: '2026-02-09T10:30', becamePatientId: null },
    // Saturday, answered Monday 09:00 -> 60 working minutes -> fast
    { id: 'r3', receivedAt: '2026-02-07T12:00', channel: 'instagram_dm', source: 'instagram', firstReplyAt: '2026-02-09T09:00', becamePatientId: null },
    // never answered -> slow
    { id: 'r4', receivedAt: '2026-02-10T09:00', channel: 'website_form', source: 'website', firstReplyAt: null, becamePatientId: null },
    { id: 'r5', receivedAt: '2026-02-10T09:00', channel: 'phone', source: 'referral', firstReplyAt: '2026-02-10T09:00', becamePatientId: null },
  ];
  return {
    mode: 'real',
    firstMonth: '2026-01',
    lastMonth: '2026-02',
    staff: [
      { id: 'A', label: 'A', role: 'dentist', focus: [], weeklyHours: 40, absences: [{ from: '2026-02-16', to: '2026-02-17' }] },
      { id: 'D', label: 'D', role: 'hygienist', focus: [], weeklyHours: 40, absences: [] },
    ],
    patients,
    appointments,
    labWork: [{ appointmentId: 'b3', amount: 180 }, { appointmentId: 'a3', amount: 120 }],
    plans,
    recalls: [
      { patientId: '#1', due: '2025-12-01', createdAt: '2025-06-01' },
      { patientId: '#3', due: '2026-02-20', createdAt: '2026-01-12' },
    ],
    capacity: [1, 2, 3, 4, 5].flatMap((weekday) => [
      { staffId: 'A', weekday, slots: 10 },
      { staffId: 'D', weekday, slots: 5 },
    ]),
    requests,
    igPosts: [],
    igMonthly: [],
    adSpend: [{ month: '2026-02', platform: 'google_ads', spend: 300 }],
    reviews: [],
    events: [],
    sources: Object.fromEntries(SOURCE_KEYS.map((k) => [k, true])) as Dataset['sources'],
    ...overrides,
  };
}

const JAN = monthFilter('2026-01');
const FEB = monthFilter('2026-02');

describe('basic metrics (hand-checked dataset)', () => {
  const d = tiny();
  it('revenue, appointments, revenue per visit', () => {
    expect(revenue(d, JAN).value).toBe(600.5);
    expect(revenue(d, FEB).value).toBe(1450.25);
    expect(appointmentCount(d, FEB).value).toBe(4);
    expect(revenuePerVisit(d, JAN).value).toBeCloseTo(600.5 / 3, 6);
  });
  it('filters by staff, treatment, payer, channel, district and patient type', () => {
    expect(revenue(d, { ...FEB, treatment: 'crowns_lab' }).value).toBe(500);
    expect(revenue(d, { ...JAN, staff: 'D' }).value).toBe(100.5);
    expect(revenue(d, { ...FEB, payer: 'PKV' }).value).toBe(640.25);
    expect(revenue(d, { ...FEB, channel: 'google' }).value).toBe(640.25);
    expect(revenue(d, { ...FEB, channel: 'none' }).value).toBe(700);
    expect(revenue(d, { ...FEB, district: 'westend' }).value).toBe(810);
    expect(revenue(d, { ...FEB, patientType: 'new' }).value).toBe(640.25);
    expect(revenue(d, { ...FEB, patientType: 'existing' }).value).toBe(810);
  });
  it('patients seen, new patients, existing share', () => {
    expect(patientsSeen(d, FEB).value).toBe(3);
    expect(newPatients(d, FEB).value).toBe(1);
    expect(newPatients(d, JAN).value).toBe(1);
    const share = existingPatientsShare(d, FEB).value!;
    expect(share.patientsPct).toBeCloseTo((2 / 3) * 100, 6);
    expect(share.revenuePct).toBeCloseTo((810 / 1450.25) * 100, 6);
  });
  it('lab revenue and payer mix', () => {
    expect(labRevenue(d, FEB).value).toBe(180);
    expect(payerMix(d, FEB).value).toEqual({ GKV: 110, PKV: 640.25, self: 700 });
  });
  it('revenue by treatment and by staff', () => {
    const rows = revenueByTreatment(d, FEB).value!;
    expect(rows.find((r) => r.treatment === 'checkups_cmd')).toMatchObject({ revenue: 250.25, sessions: 2 });
    const staff = revenueByStaff(d, JAN).value!;
    expect(staff.find((s) => s.staffId === 'A')).toMatchObject({ revenue: 500, appointments: 2, nextBookedPct: 50 });
  });
  it('marks small samples and returns null instead of 0 when nothing is there', () => {
    expect(revenue(d, FEB).small).toBe(true);
    const empty = revenuePerVisit(d, monthFilter('2025-06'));
    expect(empty.value).toBeNull();
    expect(empty.reason).toBe('too_few_records');
  });
  it('returns missing_source when the practice software is not connected', () => {
    const off = tiny({ sources: { ...tiny().sources, pvs: false } });
    const r = revenue(off, FEB);
    expect(r.value).toBeNull();
    expect(r.reason).toBe('missing_source');
    expect(r.missing).toBe('pvs');
    expect(labRevenue(tiny({ sources: { ...tiny().sources, lab: false } }), FEB).missing).toBe('lab');
  });
});

describe('revenue bridge', () => {
  it('matches the hand calculation', () => {
    const b = revenueBridge(tiny(), FEB, JAN).value!;
    // count: (4 − 3) × 600.50 / 3 = 200.17
    expect(b.count).toBeCloseTo(200.17, 2);
    // at old prices: 2 × 100 (check-ups) + 1 × 400 (crown) + 1 × 700 (implant: no old price, own price) = 1300; minus 4 × 200.1667 = 499.33
    expect(b.mix).toBeCloseTo(499.33, 2);
    expect(b.price).toBeCloseTo(849.75 - 200.17 - 499.33, 2);
  });
  it('the three parts sum to the difference, to the cent, for every demo month', () => {
    for (const m of months.slice(1)) {
      const f = monthFilter(m);
      const b = revenueBridge(demo, f, previousFilter(f)).value!;
      expect(toCents(b.count) + toCents(b.mix) + toCents(b.price)).toBe(toCents(b.change));
      expect(toCents(b.change)).toBe(toCents(revenue(demo, f).value!) - toCents(revenue(demo, previousFilter(f)).value!));
    }
  });
  it('also sums exactly with filters and odd cent amounts', () => {
    const b = revenueBridge(tiny(), FEB, JAN).value!;
    expect(toCents(b.count) + toCents(b.mix) + toCents(b.price)).toBe(toCents(1450.25 - 600.5));
    for (const staff of ['A', 'B', 'C', 'D', 'E']) {
      const f = monthFilter('2026-10', { staff });
      const r = revenueBridge(demo, f, previousFilter(f)).value!;
      expect(toCents(r.count) + toCents(r.mix) + toCents(r.price)).toBe(toCents(r.change));
    }
  });
  it('per-treatment split (sessions + price) sums to each treatment change', () => {
    for (const m of months.slice(1)) {
      const f = monthFilter(m);
      const rows = treatmentChanges(demo, f, previousFilter(f)).value!;
      let total = 0;
      for (const r of rows) {
        expect(toCents(r.countEffect) + toCents(r.priceEffect)).toBe(toCents(r.change));
        total += toCents(r.change);
      }
      expect(total).toBe(toCents(revenueBridge(demo, f, previousFilter(f)).value!.change));
    }
  });
  it('returns too_few_records without a comparison month', () => {
    const f = monthFilter(demo.firstMonth);
    expect(revenueBridge(demo, f, previousFilter(f)).value).toBeNull();
  });
});

describe('revenue = patients × visits × revenue per visit', () => {
  it('the three effects sum to the difference, to the cent, for every demo month', () => {
    for (const m of months.slice(1)) {
      const f = monthFilter(m);
      const x = revenueFactors(demo, f, previousFilter(f)).value!;
      expect(toCents(x.patients.effect) + toCents(x.visitsPerPatient.effect) + toCents(x.revenuePerVisit.effect)).toBe(toCents(x.change));
      // the factors really multiply to revenue
      expect(x.patients.current * x.visitsPerPatient.current * x.revenuePerVisit.current).toBeCloseTo(revenue(demo, f).value!, 4);
    }
  });
  it('gives each factor the right sign', () => {
    const x = revenueFactors(tiny(), FEB, JAN).value!;
    expect(x.patients.effect).toBeGreaterThan(0); // 2 -> 3 patients
    expect(x.visitsPerPatient.effect).toBeLessThan(0); // 1.5 -> 1.33
    expect(x.revenuePerVisit.effect).toBeGreaterThan(0);
  });
});

describe('treatment plans', () => {
  const d = tiny();
  it('proposed, accepted, acceptance and one point', () => {
    const s = planSummary(d, FEB).value!;
    expect(s.proposed).toBe(4500);
    expect(s.accepted).toBe(1000);
    expect(s.acceptancePct).toBeCloseTo((1000 / 4500) * 100, 6);
    expect(s.onePoint).toBe(45);
  });
  it('open plans split under / over 3 months, as of the period end', () => {
    const o = openPlans(d, FEB).value!;
    // p2 (open, new), p3 (open, old), p4 (declined on 1 March, so still open at end of February)
    expect(o).toMatchObject({ total: 4500, under3: 3500, over3: 1000 });
    expect(openPlans(d, monthFilter('2026-03')).value!.total).toBe(4000);
  });
  it('instalment comparison uses only plans where the offer is known', () => {
    const c = instalmentComparison(d, { from: '2025-10-01', to: '2026-02-28' }).value!;
    expect(c).toMatchObject({ withOfferPct: 100, withoutOfferPct: 0, withSample: 1, withoutSample: 2, unknown: 1 });
    expect(c.offeredSharePct).toBeCloseTo(100 / 3, 6);
    const off = instalmentComparison(tiny({ sources: { ...d.sources, instalments: false } }), FEB);
    expect(off.missing).toBe('instalments');
  });
  it('follow-up list: only open plans under 90 days, sorted by value × likelihood', () => {
    const list = followUpList(d, FEB).value!;
    expect(list.map((x) => x.planId)).toEqual(['p2', 'p4']);
    expect(list[0].step).toBe('offer_instalments');
  });
  it('acceptance by dentist', () => {
    const rows = acceptanceByDentist(d, FEB).value!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dentistId: 'A', plans: 3, open: 4500 });
  });
});

describe('request response time', () => {
  it('counts working minutes only within opening hours', () => {
    expect(workingMinutesBetween('2026-02-02T10:00', '2026-02-02T11:00')).toBe(60);
    expect(workingMinutesBetween('2026-02-06T15:30', '2026-02-09T10:30')).toBe(180); // Fri closes 16:00
    expect(workingMinutesBetween('2026-02-07T12:00', '2026-02-09T09:00')).toBe(60); // weekend is closed
    expect(workingMinutesBetween('2026-02-02T19:00', '2026-02-03T08:30')).toBe(30); // evening
    expect(addWorkingMinutes('2026-02-06T15:30', 60)).toBe('2026-02-09T08:30');
  });
  it('fast = first reply within 2 working hours; unanswered counts as slow', () => {
    const d = tiny();
    expect(d.requests.map(isFast)).toEqual([true, false, true, false, true]);
    const s = responseSpeed(d, FEB).value!;
    expect(s).toMatchObject({ requests: 4, fast: 2, slow: 2, fastPct: 50, fastConversionPct: 50, slowConversionPct: 0, missedNewPatients: 1 });
    expect(s.slowWeekendPct).toBe(50);
    expect(onlineRequests(d, FEB).value).toBe(4);
  });
  it('needs the inbox for reply times', () => {
    const d = tiny({ sources: { ...tiny().sources, inbox: false } });
    expect(responseSpeed(d, FEB).missing).toBe('inbox');
  });
});

describe('recall, capacity and marketing', () => {
  const d = tiny();
  it('overdue: more than 30 days past recall and no check-up since', () => {
    // #1 was due 1 Dec 2025 but came for check-ups in January -> not overdue. #3 due 20 Feb: not yet 30 days.
    expect(overduePatients(d, FEB).value!.length).toBe(0);
    const marchEnd = monthFilter('2026-03');
    expect(overduePatients(d, marchEnd).value!.map((o) => o.patientId)).toEqual(['#3']);
  });
  it('treatment time used and missed appointments', () => {
    // February 2026: 20 working days; A absent 2 days -> 18 × 10 + 20 × 5 = 280 slots
    expect(bookableSlots(d, FEB)).toBe(280);
    const t = treatmentTimeUsed(d, FEB).value!;
    expect(t).toMatchObject({ slots: 280, completed: 4, cancelled: 0, noShow: 1, neverBooked: 275 });
    const m = missedAppointments(d, JAN).value!;
    expect(m).toMatchObject({ cancelled: 1, noShow: 0, total: 1, value: 100 }); // average check-up in January = 100
    expect(weekdayUtilisation(d, FEB).value!.find((w) => w.weekday === 1)!.appointments).toBe(1);
  });
  it('next appointment booked, recall value and channel table', () => {
    expect(nextBookedRate(d, FEB).value).toBe(75);
    expect(recallVisitValue(d, FEB).value).toBe(100.5);
    const c = channelTable(d, FEB).value!;
    expect(c.rows.find((r) => r.channel === 'google')).toMatchObject({ requests: 1, newPatients: 1, conversionPct: 100, adSpend: 300 });
    expect(adsReturn(d, FEB).value).toMatchObject({ spend: 300, newPatients: 1, costPerNewPatient: 300 });
  });
});

describe('demo data: every metric returns a value for every month', () => {
  it.each(months)('%s', (m) => {
    const f = monthFilter(m);
    for (const r of [
      revenue(demo, f), appointmentCount(demo, f), revenuePerVisit(demo, f), patientsSeen(demo, f), newPatients(demo, f),
      existingPatientsShare(demo, f), labRevenue(demo, f), payerMix(demo, f), planSummary(demo, f), openPlans(demo, f),
      overduePatients(demo, f), nextBookedRate(demo, f), missedAppointments(demo, f), treatmentTimeUsed(demo, f),
      onlineRequests(demo, f), responseSpeed(demo, f), channelTable(demo, f), instagramFunnel(demo, f), adsReturn(demo, f),
      districtTable(demo, f), recallVisitValue(demo, f),
    ]) {
      expect(r.value).not.toBeNull();
      expect(r.sources.length).toBeGreaterThan(0);
    }
    expect(moneyOnTable(demo, f).total % 100).toBe(0);
  });
  it('history-based values exist', () => {
    expect(newPatientValue6m(demo).value).toBeGreaterThan(100);
    expect(typicalPatientValuePerYear(demo, monthFilter('2026-10')).value).toBeGreaterThan(100);
    expect(topChanges(demo, monthFilter('2026-10'), monthFilter('2026-09'))).toHaveLength(5);
  });
});
