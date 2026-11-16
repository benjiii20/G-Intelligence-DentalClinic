// The AI tools: every tool is a thin wrapper around the tested metric functions.
// Results are small plain JSON with units in the field names. Only aggregates and
// pseudonymised ids leave this module: never names, never raw records.
import { TOOL_DEFS, type ToolDef, type ToolName } from '../ai/toolDefs';
import { addMonths, monthEnd, monthsBetween, monthStart } from '../data/dates';
import type { Dataset, PracticeEvent, SourceKey, StaffId } from '../data/types';
import { revenueBridge, revenueFactors, treatmentChanges } from './bridge';
import { emptySlotValue, missedAppointments, treatmentTimeUsed, weekdayUtilisation } from './capacity';
import { monthFilter, previousFilter, type Filter, type MetricResult } from './core';
import { instagramFunnel } from './instagram';
import { adsReturn, channelTable, districtTable, firstVisitValue, newPatientValue6m } from './marketing';
import { eventsIn } from './opportunity';
import { acceptanceByDentist, declineReasons, followUpList, instalmentComparison, openPlans, planSummary } from './plans';
import { nextBookedRate, overduePatients, recallVisitValue, typicalPatientValuePerYear } from './recall';
import { onlineRequests, responseSpeed } from './requests';
import { appointmentCount, existingPatientsShare, labRevenue, newPatients, patientsSeen, payerMix, revenue, revenueByStaff, revenuePerVisit, staffShareOfTreatment } from './revenue';
import { SERIES_METRICS, monthlySeries, type SeriesMetric } from './series';

export interface ToolContext {
  /** month selected in the dashboard, used when the tool input names none */
  month: string;
  /** anonymised label for a team member, e.g. "Dentist A" */
  staffName: (id: StaffId) => string;
  /** plain description of a recorded event */
  eventText: (e: PracticeEvent) => string;
}

export type ToolInput = Record<string, unknown>;
export type ToolOutput = Record<string, unknown>;

export interface RegisteredTool extends ToolDef {
  run: (data: Dataset, input: ToolInput, ctx: ToolContext) => ToolOutput;
}

export class ToolInputError extends Error {}

const r0 = (v: number | null | undefined): number | null => (v == null || !isFinite(v) ? null : Math.round(v));
const r1 = (v: number | null | undefined): number | null => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
const r2 = (v: number | null | undefined): number | null => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);

const ENUMS: Record<string, readonly string[]> = {
  treatment: ['implants_surgery', 'crowns_lab', 'aesthetics', 'endo_perio', 'prevention', 'checkups_cmd'],
  payer: ['GKV', 'PKV', 'self'],
  channel: ['website', 'google', 'instagram', 'referral', 'reviews', 'intl_site', 'phone'],
  district: ['charlottenburg', 'westend', 'wilmersdorf', 'grunewald', 'spandau', 'schoeneberg', 'other'],
  patient_type: ['new', 'existing'],
};

/** Turns tool input into a metric filter. Throws a clear error for anything outside the data. */
export function resolveFilter(data: Dataset, input: ToolInput, ctx: ToolContext): { filter: Filter; label: string; isMonth: boolean } {
  const str = (k: string): string | undefined => {
    const v = input[k];
    if (v == null || v === '') return undefined;
    if (typeof v !== 'string') throw new ToolInputError(`"${k}" must be a string.`);
    return v;
  };
  const range = `Data covers ${data.firstMonth} to ${data.lastMonth}.`;
  let from: string;
  let to: string;
  let label: string;
  let isMonth = false;
  const f = str('from');
  const t = str('to');
  if (f || t) {
    if (!f || !t) throw new ToolInputError('Give both "from" and "to", or use "month".');
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(f) || !/^\d{4}-\d{2}(-\d{2})?$/.test(t)) throw new ToolInputError('"from" and "to" must be YYYY-MM or YYYY-MM-DD.');
    from = f.length === 7 ? monthStart(f) : f;
    to = t.length === 7 ? monthEnd(t) : t;
    if (to < from) throw new ToolInputError('"to" is before "from".');
    label = `${from} to ${to}`;
    isMonth = from.slice(0, 7) === to.slice(0, 7) && from === monthStart(from.slice(0, 7)) && to === monthEnd(to.slice(0, 7));
  } else {
    const m = str('month') ?? ctx.month;
    if (!/^\d{4}-\d{2}$/.test(m)) throw new ToolInputError('"month" must be YYYY-MM.');
    from = monthStart(m);
    to = monthEnd(m);
    label = m;
    isMonth = true;
  }
  if (to < monthStart(data.firstMonth) || from > monthEnd(data.lastMonth)) throw new ToolInputError(`No data for ${label}. ${range}`);
  const filter: Filter = { from, to };
  const staff = str('staff');
  if (staff) {
    const id = staff.replace(/^(dentist|hygienist|zahnarzt|zahnärztin|prophylaxe)\s+/i, '').trim().toUpperCase();
    const found = data.staff.find((s) => s.id.toUpperCase() === id || s.label.toUpperCase() === id);
    if (!found) throw new ToolInputError(`Unknown team member "${staff}". Known: ${data.staff.map((s) => s.label).join(', ')}.`);
    filter.staff = found.id;
  }
  for (const key of ['treatment', 'payer', 'channel', 'district', 'patient_type'] as const) {
    const v = str(key);
    if (!v) continue;
    if (!ENUMS[key].includes(v)) throw new ToolInputError(`Unknown ${key} "${v}". Allowed: ${ENUMS[key].join(', ')}.`);
    if (key === 'patient_type') filter.patientType = v as Filter['patientType'];
    else (filter as unknown as Record<string, string>)[key] = v;
  }
  return { filter, label, isMonth };
}

function missingOf(...results: MetricResult<unknown>[]): SourceKey | null {
  for (const r of results) if (r.reason === 'missing_source' && r.missing) return r.missing;
  return null;
}

function eventList(data: Dataset, f: Filter, ctx: ToolContext) {
  return eventsIn(data, f).map((e) => ({
    type: e.type,
    description: ctx.eventText(e),
    from: e.from,
    to: e.to,
    ...(e.staffId ? { staff: ctx.staffName(e.staffId) } : {}),
  }));
}

function monthSummaryBlock(data: Dataset, f: Filter, ctx: ToolContext): ToolOutput {
  const scope: Filter = { from: f.from, to: f.to };
  const plans = planSummary(data, f).value;
  const speed = responseSpeed(data, scope).value;
  const missed = missedAppointments(data, f).value;
  const payer = payerMix(data, f).value;
  const share = existingPatientsShare(data, f).value;
  return {
    period: `${f.from} to ${f.to}`,
    revenue_eur: r0(revenue(data, f).value),
    appointments: appointmentCount(data, f).value,
    revenue_per_visit_eur: r0(revenuePerVisit(data, f).value),
    patients_seen: patientsSeen(data, f).value,
    new_patients: newPatients(data, f).value,
    existing_patients_share_pct: r0(share?.patientsPct),
    cancellations: missed?.cancelled ?? null,
    no_shows: missed?.noShow ?? null,
    plans_proposed_eur: r0(plans?.proposed),
    plans_booked_eur: r0(plans?.accepted),
    plan_acceptance_pct: r0(plans?.acceptancePct),
    online_requests: onlineRequests(data, scope).value,
    requests_answered_within_2h_pct: speed ? r0(speed.fastPct) : { missing: responseSpeed(data, scope).missing ?? 'inbox' },
    events: eventList(data, scope, ctx),
    in_house_lab_eur: labRevenue(data, f).value === null ? { missing: 'lab' } : r0(labRevenue(data, f).value),
    payer_gkv_eur: r0(payer?.GKV),
    payer_pkv_eur: r0(payer?.PKV),
    payer_selfpay_eur: r0(payer?.self),
    overdue_checkup_patients: overduePatients(data, scope).value?.length ?? null,
  };
}

const RUN: Record<ToolName, RegisteredTool['run']> = {
  get_month_summary(data, input, ctx) {
    const { filter, isMonth } = resolveFilter(data, input, ctx);
    const miss = missingOf(revenue(data, filter));
    if (miss) return { missing: miss };
    const prev = previousFilter(filter);
    const hasPrev = prev.from >= monthStart(data.firstMonth);
    const cur = revenue(data, filter).value!;
    const before = hasPrev ? revenue(data, prev).value : null;
    const out: ToolOutput = {
      this_month: monthSummaryBlock(data, filter, ctx),
      previous_month: hasPrev ? monthSummaryBlock(data, prev, ctx) : 'no earlier data',
      revenue_change_eur: before !== null ? r0(cur - before) : null,
      revenue_change_pct: before ? r1(((cur - before) / before) * 100) : null,
    };
    if (isMonth) {
      const m = filter.from.slice(0, 7);
      const start = addMonths(m, -12) < data.firstMonth ? data.firstMonth : addMonths(m, -12);
      const extra = { staff: filter.staff, treatment: filter.treatment, payer: filter.payer, channel: filter.channel, district: filter.district, patientType: filter.patientType };
      const earlier = start < m ? monthsBetween(start, addMonths(m, -1)).map((x) => revenue(data, monthFilter(x, extra)).value ?? 0) : [];
      out.twelve_month_average_revenue_eur = earlier.length ? r0(earlier.reduce((a, b) => a + b, 0) / earlier.length) : null;
      const ly = addMonths(m, -12);
      out.same_month_last_year = ly >= data.firstMonth ? { month: ly, revenue_eur: r0(revenue(data, monthFilter(ly, extra)).value) } : 'not available';
    }
    return out;
  },

  get_revenue_breakdown(data, input, ctx) {
    const { filter } = resolveFilter(data, input, ctx);
    const miss = missingOf(revenue(data, filter));
    if (miss) return { missing: miss };
    const prev = previousFilter(filter);
    const bridge = revenueBridge(data, filter, prev).value;
    const factors = revenueFactors(data, filter, prev).value;
    const rows = treatmentChanges(data, filter, prev).value ?? [];
    const total = revenue(data, filter).value ?? 0;
    return {
      period: `${filter.from} to ${filter.to}`,
      compared_with: `${prev.from} to ${prev.to}`,
      revenue_eur: r0(total),
      previous_revenue_eur: bridge ? r0(bridge.previous) : null,
      change_eur: bridge ? r0(bridge.change) : null,
      bridge: bridge
        ? { number_of_appointments_eur: r0(bridge.count), type_of_treatment_eur: r0(bridge.mix), prices_within_treatments_eur: r0(bridge.price), note: 'the three parts sum exactly to change_eur (before rounding)' }
        : 'no earlier period to compare with',
      factors: factors
        ? {
            patients_seen: { value: factors.patients.current, previous: factors.patients.previous, effect_eur: r0(factors.patients.effect) },
            visits_per_patient: { value: r2(factors.visitsPerPatient.current), previous: r2(factors.visitsPerPatient.previous), effect_eur: r0(factors.visitsPerPatient.effect) },
            revenue_per_visit_eur: { value: r0(factors.revenuePerVisit.current), previous: r0(factors.revenuePerVisit.previous), effect_eur: r0(factors.revenuePerVisit.effect) },
          }
        : null,
      treatments: rows.map((r) => ({
        area: r.treatment,
        revenue_eur: r0(r.revenue),
        previous_revenue_eur: r0(r.previousRevenue),
        change_eur: r0(r.change),
        sessions: r.sessions,
        previous_sessions: r.previousSessions,
        avg_per_session_eur: r0(r.avg),
        effect_of_session_count_eur: r0(r.countEffect),
        effect_of_price_eur: r0(r.priceEffect),
        share_of_revenue_pct: total ? r0((r.revenue / total) * 100) : null,
        main_staff: staffShareOfTreatment(data, filter, r.treatment)
          .slice(0, 2)
          .map((s) => ({ staff: ctx.staffName(s.staffId), share_pct: r0(s.sharePct) })),
      })),
      events: eventList(data, { from: filter.from, to: filter.to }, ctx),
    };
  },

  get_treatment_plans(data, input, ctx) {
    const { filter, isMonth } = resolveFilter(data, input, ctx);
    const summary = planSummary(data, filter);
    const miss = missingOf(summary);
    if (miss) return { missing: miss };
    const prev = previousFilter(filter);
    const s = summary.value!;
    const before = planSummary(data, prev).value;
    const open = openPlans(data, filter).value!;
    // instalments: a single month is too small, so use the 6 months up to the period end
    const instFilter: Filter = isMonth ? { ...filter, from: monthStart(addMonths(filter.to.slice(0, 7), -5) < data.firstMonth ? data.firstMonth : addMonths(filter.to.slice(0, 7), -5)) } : filter;
    const inst = instalmentComparison(data, instFilter);
    const reasons = declineReasons(data, { ...filter, from: monthStart(data.firstMonth) }).value!;
    return {
      period: `${filter.from} to ${filter.to}`,
      plans: s.count,
      proposed_eur: r0(s.proposed),
      booked_eur: r0(s.accepted),
      acceptance_pct: r0(s.acceptancePct),
      previous_acceptance_pct: r0(before?.acceptancePct),
      open_eur: r0(open.total),
      open_under_3_months_eur: r0(open.under3),
      open_older_than_3_months_eur: r0(open.over3),
      value_if_acceptance_were_1_percent_higher_eur: r0(s.onePercent),
      by_dentist: (acceptanceByDentist(data, filter, prev).value ?? []).map((d) => ({
        dentist: ctx.staffName(d.dentistId),
        plans: d.plans,
        acceptance_pct: r0(d.acceptancePct),
        previous_acceptance_pct: r0(d.previousAcceptancePct),
        open_eur: r0(d.open),
      })),
      events: eventList(data, { from: filter.from, to: filter.to }, ctx),
      open_by_treatment: open.byTreatment.map((t) => ({ area: t.treatment, open_eur: r0(t.open) })),
      instalments: inst.value
        ? {
            period: `${instFilter.from} to ${instFilter.to}`,
            plans_with_offer_pct: r0(inst.value.offeredSharePct),
            acceptance_with_offer_pct: r0(inst.value.withOfferPct),
            acceptance_without_offer_pct: r0(inst.value.withoutOfferPct),
            plans_with_offer: inst.value.withSample,
            plans_without_offer: inst.value.withoutSample,
            note: 'correlation only',
          }
        : { missing: inst.missing ?? 'instalments' },
      follow_up_list: (followUpList(data, filter, 6).value ?? []).map((p) => ({
        patient: p.patientId,
        dentist: ctx.staffName(p.dentistId),
        area: p.treatment,
        value_eur: r0(p.value),
        days_open: p.daysOpen,
        instalments_discussed: p.instalments,
      })),
      decline_reasons:
        reasons.recordedCount === 0
          ? 'not recorded'
          : { ...reasons.recorded, not_recorded: reasons.notRecorded, note: 'all declined plans since the start of the data; most have no recorded reason' },
    };
  },

  get_marketing(data, input, ctx) {
    const { filter, isMonth } = resolveFilter(data, input, ctx);
    const scope: Filter = { from: filter.from, to: filter.to, channel: filter.channel, district: filter.district };
    const prev = previousFilter(scope);
    const reqs = onlineRequests(data, scope);
    const speed = responseSpeed(data, scope);
    const speedPrev = responseSpeed(data, prev).value;
    const npv = newPatientValue6m(data).value;
    const table = channelTable(data, scope);
    if (table.reason === 'missing_source') return { missing: table.missing };
    const ads = adsReturn(data, scope);
    const s = speed.value;
    const out: ToolOutput = {
      period: `${filter.from} to ${filter.to}`,
      online_requests: reqs.value ?? { missing: reqs.missing ?? 'webform' },
      previous_online_requests: onlineRequests(data, prev).value,
    };
    if (s) {
      Object.assign(out, {
        answered_within_2h_pct: r0(s.fastPct),
        previous_answered_within_2h_pct: r0(speedPrev?.fastPct),
        requests_waiting_over_2h: s.slow,
        conversion_if_answered_within_2h_pct: r0(s.fastConversionPct),
        conversion_if_answered_later_pct: r0(s.slowConversionPct),
        conversion_note: isMonth ? 'conversion rates use the 6 months up to the period end' : 'conversion rates use the whole period',
        estimated_missed_new_patients: r0(s.missedNewPatients),
        estimated_value_of_missed_patients_6_months_eur: s.missedNewPatients !== null && npv !== null ? r0(s.missedNewPatients * npv) : null,
        slow_replies_mostly: s.slowWeekendPct !== null ? `${Math.round(s.slowWeekendPct)} percent of late replies were to requests from Friday afternoon or the weekend` : null,
        slow_replies_friday_afternoon_or_weekend_pct: r0(s.slowWeekendPct),
      });
    } else {
      out.answered_within_2h_pct = { missing: speed.missing ?? 'inbox' };
    }
    Object.assign(out, {
      booking_method: 'appointment request form, phone or e-mail; a request is not a booking',
      new_patients: table.value!.newPatients,
      new_patient_value_first_6_months_eur: r0(npv),
      no_recorded_source: table.value!.noSource,
      channels: table.value!.rows.map((r) => ({
        channel: r.channel,
        requests: r.requests,
        new_patients: r.newPatients,
        conversion_pct: r0(r.conversionPct),
        ...(r.adSpend !== null ? { ad_spend_eur: r0(r.adSpend) } : {}),
      })),
      google_ads: ads.value
        ? {
            spend_eur: r0(ads.value.spend),
            new_patients: ads.value.newPatients,
            cost_per_new_patient_eur: r0(ads.value.costPerNewPatient),
            return_per_eur_6_months: r2(ads.value.returnPerEuro),
            note: 'the google channel also includes patients from ordinary Google search; return is an estimate from history',
          }
        : { missing: ads.missing ?? 'google_ads' },
      districts: (districtTable(data, scope).value ?? []).map((d) => ({ district: d.district, new_patients: d.newPatients, revenue_6_months_per_patient_eur: r0(d.value6m) })),
    });
    return out;
  },

  get_instagram(data, input, ctx) {
    const { filter, isMonth } = resolveFilter(data, input, ctx);
    const scope: Filter = { from: filter.from, to: filter.to };
    const ig = instagramFunnel(data, scope);
    if (ig.value === null) return { missing: ig.missing ?? 'instagram' };
    const prev = instagramFunnel(data, previousFilter(scope)).value;
    // post types: one month has too few posts per type, so use the 6 months up to the period end
    const typeFilter: Filter = isMonth ? { from: monthStart(addMonths(scope.to.slice(0, 7), -5) < data.firstMonth ? data.firstMonth : addMonths(scope.to.slice(0, 7), -5)), to: scope.to } : scope;
    const types = instagramFunnel(data, typeFilter).value!;
    const v = ig.value;
    return {
      period: `${scope.from} to ${scope.to}`,
      posts: v.posts,
      previous_posts: prev?.posts ?? null,
      reach: v.reach,
      previous_reach: prev?.reach ?? null,
      profile_visits: v.profileVisits,
      link_in_bio_clicks: v.linkClicks,
      messages: v.messages,
      requests: v.requests,
      new_patients: v.newPatients,
      conversion_pct: r0(v.conversionPct),
      value_of_new_patients_6_months_eur: r0(v.value6m),
      by_post_type_period: `${typeFilter.from} to ${typeFilter.to}`,
      by_post_type: types.byPostType.map((t) => ({ type: t.type, posts: t.posts, avg_reach_per_post: r0(t.avgReach), requests: t.requests, new_patients: t.newPatients })),
      note: 'correlation, not proof',
    };
  },

  get_patients_recall(data, input, ctx) {
    const { filter } = resolveFilter(data, input, ctx);
    const seen = patientsSeen(data, filter);
    const miss = missingOf(seen);
    if (miss) return { missing: miss };
    const prev = previousFilter(filter);
    const share = existingPatientsShare(data, filter).value;
    const overdue = overduePatients(data, filter).value ?? [];
    const recall = recallVisitValue(data, filter).value;
    const missed = missedAppointments(data, { ...filter, from: monthStart(data.firstMonth) }).value;
    const byStaff = new Map<string, number>();
    for (const o of overdue) if (o.lastSeenBy) byStaff.set(o.lastSeenBy, (byStaff.get(o.lastSeenBy) ?? 0) + 1);
    return {
      period: `${filter.from} to ${filter.to}`,
      patients_seen: seen.value,
      previous_patients_seen: patientsSeen(data, prev).value,
      new_patients: newPatients(data, filter).value,
      existing_patients: share?.existing ?? null,
      existing_share_pct: r0(share?.patientsPct),
      existing_share_of_revenue_pct: r0(share?.revenuePct),
      overdue_for_checkup: overdue.length,
      recall_visit_value_eur: r0(recall),
      overdue_value_eur: recall !== null ? r0(overdue.length * recall) : null,
      typical_patient_value_per_year_eur: r0(typicalPatientValuePerYear(data, filter).value),
      first_visit_value_eur: r0(firstVisitValue(data).value),
      new_patient_value_first_6_months_eur: r0(newPatientValue6m(data).value),
      next_appointment_booked_pct: r0(nextBookedRate(data, filter).value),
      overdue_last_seen_by: [...byStaff.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ member: ctx.staffName(id), patients: n })),
      overdue_examples: overdue.slice(0, 6).map((o) => ({
        patient: o.patientId,
        days_since_last_visit: o.daysSinceLastVisit,
        usual_interval_days: o.usualIntervalDays,
        visits: o.visits,
        total_billed_eur: r0(o.totalBilled),
        last_seen_by: o.lastSeenBy ? ctx.staffName(o.lastSeenBy) : null,
      })),
      cancellation_reasons:
        !missed || missed.reasonsRecorded === 0
          ? 'not recorded'
          : { ...missed.reasons, not_recorded: missed.total - missed.reasonsRecorded, note: 'all missed appointments since the start of the data; most have no recorded reason' },
    };
  },

  get_capacity_team(data, input, ctx) {
    const { filter } = resolveFilter(data, input, ctx);
    const scope: Filter = { from: filter.from, to: filter.to, staff: filter.staff };
    const time = treatmentTimeUsed(data, scope);
    const miss = missingOf(time);
    if (miss) return { missing: miss };
    const prev = previousFilter(scope);
    const missed = missedAppointments(data, scope).value!;
    const missedPrev = missedAppointments(data, prev).value;
    const t = time.value;
    const slotValue = emptySlotValue(data, scope);
    const team = revenueByStaff(data, { from: scope.from, to: scope.to }).value ?? [];
    const teamPrev = revenueByStaff(data, { from: prev.from, to: prev.to }).value ?? [];
    return {
      period: `${scope.from} to ${scope.to}`,
      bookable_slots: t?.slots ?? null,
      completed: t?.completed ?? appointmentCount(data, scope).value,
      cancelled: missed.cancelled,
      no_shows: missed.noShow,
      previous_missed: missedPrev?.total ?? null,
      never_booked: t?.neverBooked ?? null,
      time_used_pct: r0(t?.usedPct),
      previous_time_used_pct: r0(treatmentTimeUsed(data, prev).value?.usedPct),
      missed_value_eur: r0(missed.value),
      value_per_missed_appointment_eur: r0(missed.valuePerAppointment),
      missed_mostly: missed.byTreatment.slice(0, 2).map((m) => ({ area: m.treatment, count: m.count })),
      never_booked_value_eur: t && slotValue !== null ? r0(t.neverBooked * slotValue) : null,
      never_booked_value_note: 'never-booked slots valued at an average check-up or cleaning; a cautious estimate',
      events: eventList(data, { from: scope.from, to: scope.to }, ctx),
      team_average_next_appointment_booked_pct: r0(nextBookedRate(data, { from: scope.from, to: scope.to }).value),
      team: team
        .filter((m) => !scope.staff || m.staffId === scope.staff)
        .map((m) => ({
          member: ctx.staffName(m.staffId),
          role: data.staff.find((s) => s.id === m.staffId)?.role ?? null,
          appointments: m.appointments,
          previous_appointments: teamPrev.find((p) => p.staffId === m.staffId)?.appointments ?? null,
          billed_eur: r0(m.revenue),
          next_appointment_booked_pct: r0(m.nextBookedPct),
        })),
      team_note: 'next appointment booked is a booking habit, not a measure of clinical quality',
      weekdays: (weekdayUtilisation(data, scope).value ?? []).map((w) => ({
        day: ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][w.weekday],
        appointments: w.appointments,
        slots: w.slots,
        free_slots: Math.max(0, w.slots - w.appointments),
        utilisation_pct: r0(w.usedPct),
      })),
    };
  },

  get_monthly_series(data, input, ctx) {
    const metric = input.metric;
    if (typeof metric !== 'string' || !(SERIES_METRICS as readonly string[]).includes(metric)) {
      throw new ToolInputError(`Unknown metric. Allowed: ${SERIES_METRICS.join(', ')}.`);
    }
    const hasRange = input.from != null || input.to != null;
    const { filter } = resolveFilter(data, hasRange ? input : { ...input, from: data.firstMonth, to: data.lastMonth }, ctx);
    const from = filter.from.slice(0, 7) < data.firstMonth ? data.firstMonth : filter.from.slice(0, 7);
    const to = filter.to.slice(0, 7) > data.lastMonth ? data.lastMonth : filter.to.slice(0, 7);
    const points = monthlySeries(data, metric as SeriesMetric, { staff: filter.staff, treatment: filter.treatment }, from, to);
    const known = points.filter((p) => p.value !== null) as { month: string; value: number }[];
    if (!known.length) return { metric, missing: 'no data for this metric; a data source may be disconnected' };
    const round = r0;
    const hi = known.reduce((a, b) => (b.value > a.value ? b : a));
    const lo = known.reduce((a, b) => (b.value < a.value ? b : a));
    return {
      metric,
      months: points.map((p) => ({ month: p.month, value: round(p.value) })),
      average: round(known.reduce((s, p) => s + p.value, 0) / known.length),
      highest: { month: hi.month, value: round(hi.value) },
      lowest: { month: lo.month, value: round(lo.value) },
    };
  },
};

export const TOOLS: RegisteredTool[] = TOOL_DEFS.map((d) => ({ ...d, run: RUN[d.name] }));

/** Runs one tool. Errors are returned as { error } so the model can say what went wrong. */
export function runTool(data: Dataset, name: string, input: unknown, ctx: ToolContext): ToolOutput {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool "${name}".` };
  try {
    return tool.run(data, (input && typeof input === 'object' ? input : {}) as ToolInput, ctx);
  } catch (e) {
    if (e instanceof ToolInputError) return { error: e.message };
    return { error: 'The tool could not calculate this.' };
  }
}
