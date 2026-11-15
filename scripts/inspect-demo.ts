// Prints the demo data month by month. Run: npx tsx scripts/inspect-demo.ts
import { monthsBetween } from '../src/data/dates';
import { generateDemo } from '../src/data/demo';
import { missedAppointments, treatmentTimeUsed, weekdayUtilisation } from '../src/metrics/capacity';
import { monthFilter } from '../src/metrics/core';
import { instagramFunnel } from '../src/metrics/instagram';
import { adsReturn, channelTable, districtTable, newPatientValue6m } from '../src/metrics/marketing';
import { moneyOnTable } from '../src/metrics/opportunity';
import { acceptanceByDentist, instalmentComparison, openPlans, planSummary } from '../src/metrics/plans';
import { overduePatients, typicalPatientValuePerYear } from '../src/metrics/recall';
import { onlineRequests, responseSpeed } from '../src/metrics/requests';
import { appointmentCount, newPatients, patientsSeen, revenue, revenueByStaff, revenueByTreatment } from '../src/metrics/revenue';

const t0 = Date.now();
const d = generateDemo();
console.log('generated in', Date.now() - t0, 'ms;', d.appointments.length, 'appointments,', d.patients.length, 'patients');
const r = (x: number | null | undefined) => (x == null ? 'n/a' : Math.round(x));
for (const m of monthsBetween(d.firstMonth, d.lastMonth)) {
  const f = monthFilter(m);
  const ps = planSummary(d, f).value!;
  const sp = responseSpeed(d, f).value!;
  const tu = treatmentTimeUsed(d, f).value!;
  const mi = missedAppointments(d, f).value!;
  console.log(
    m,
    'rev', r(revenue(d, f).value),
    'appts', appointmentCount(d, f).value,
    'seen', patientsSeen(d, f).value,
    'new', newPatients(d, f).value,
    'acc%', r(ps.acceptancePct),
    'open', r(openPlans(d, f).value!.total),
    'req', onlineRequests(d, f).value,
    'fast%', r(sp.fastPct),
    'conv f/s', r(sp.fastConversionPct), r(sp.slowConversionPct),
    'missed', mi.total,
    'used%', r(tu.usedPct),
    'overdue', overduePatients(d, f).value!.length,
    'impl', revenueByTreatment(d, f).value![0].sessions,
  );
}
const f = monthFilter(d.lastMonth);
const half = { from: '2026-05-01', to: '2026-10-31' };
console.log('treatments', revenueByTreatment(d, f).value!.map((x) => `${x.treatment}:${x.sessions}/${r(x.revenue)}/${r(x.avg)}`).join('  '));
console.log('staff', revenueByStaff(d, f).value!.map((x) => `${x.staffId}:${x.appointments}/${r(x.revenue)}/${r(x.nextBookedPct)}%`).join('  '));
console.log('instalments 6m', instalmentComparison(d, half).value);
console.log('by dentist', acceptanceByDentist(d, f, monthFilter('2026-09')).value);
console.log('weekdays', weekdayUtilisation(d, f).value!.map((x) => `${x.weekday}:${r(x.usedPct)}%`).join(' '));
console.log('channels', channelTable(d, f).value);
console.log('channels 6m', channelTable(d, half).value!.rows.map((x) => `${x.channel}:${x.requests}->${x.newPatients} ${r(x.conversionPct)}%`).join('  '));
console.log('districts', districtTable(d, half).value);
console.log('ig', instagramFunnel(d, f).value);
console.log('ig 6m types', instagramFunnel(d, half).value!.byPostType);
console.log('google ads', adsReturn(d, f).value, 'npv6m', r(newPatientValue6m(d).value), 'typical/yr', r(typicalPatientValuePerYear(d, f).value));
console.log('money', moneyOnTable(d, f));
const od = overduePatients(d, f).value!;
const by: Record<string, number> = {};
for (const o of od) by[o.lastSeenBy ?? '-'] = (by[o.lastSeenBy ?? '-'] ?? 0) + 1;
console.log('overdue last seen by', by);
