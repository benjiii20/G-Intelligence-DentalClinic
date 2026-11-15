import { monthsBetween } from '../data/dates';
import type { Dataset } from '../data/types';
import { missedAppointments, treatmentTimeUsed } from './capacity';
import { monthFilter, type Filter } from './core';
import { instagramFunnel } from './instagram';
import { openPlans, planSummary } from './plans';
import { overduePatients } from './recall';
import { onlineRequests, responseSpeed } from './requests';
import { appointmentCount, newPatients, patientsSeen, revenue } from './revenue';

export const SERIES_METRICS = [
  'revenue_eur',
  'appointments',
  'new_patients',
  'patients_seen',
  'plan_acceptance_pct',
  'open_plans_eur',
  'online_requests',
  'answered_within_2h_pct',
  'cancellations',
  'no_shows',
  'time_used_pct',
  'instagram_reach',
  'instagram_new_patients',
  'implant_revenue_eur',
  'overdue_checkup_patients',
] as const;
export type SeriesMetric = (typeof SERIES_METRICS)[number];

export interface SeriesPoint {
  month: string;
  value: number | null;
}

/** One value per month for a named metric. Extra filters (staff, treatment …) are passed through. */
export function seriesValue(data: Dataset, metric: SeriesMetric, f: Filter): number | null {
  switch (metric) {
    case 'revenue_eur':
      return revenue(data, f).value;
    case 'appointments':
      return appointmentCount(data, f).value;
    case 'new_patients':
      return newPatients(data, f).value;
    case 'patients_seen':
      return patientsSeen(data, f).value;
    case 'plan_acceptance_pct':
      return planSummary(data, f).value?.acceptancePct ?? null;
    case 'open_plans_eur':
      return openPlans(data, f).value?.total ?? null;
    case 'online_requests':
      return onlineRequests(data, f).value;
    case 'answered_within_2h_pct':
      return responseSpeed(data, f).value?.fastPct ?? null;
    case 'cancellations':
      return missedAppointments(data, f).value?.cancelled ?? null;
    case 'no_shows':
      return missedAppointments(data, f).value?.noShow ?? null;
    case 'time_used_pct':
      return treatmentTimeUsed(data, f).value?.usedPct ?? null;
    case 'instagram_reach':
      return instagramFunnel(data, f).value?.reach ?? null;
    case 'instagram_new_patients':
      return instagramFunnel(data, f).value?.newPatients ?? null;
    case 'implant_revenue_eur':
      return revenue(data, { ...f, treatment: 'implants_surgery' }).value;
    case 'overdue_checkup_patients':
      return overduePatients(data, f).value?.length ?? null;
  }
}

export function monthlySeries(data: Dataset, metric: SeriesMetric, extra: Partial<Filter> = {}, from?: string, to?: string): SeriesPoint[] {
  return monthsBetween(from ?? data.firstMonth, to ?? data.lastMonth).map((month) => ({
    month,
    value: seriesValue(data, metric, monthFilter(month, extra)),
  }));
}

/** Generic helper: evaluate any function once per month. */
export function perMonth<T>(data: Dataset, fn: (f: Filter, month: string) => T): { month: string; value: T }[] {
  return monthsBetween(data.firstMonth, data.lastMonth).map((month) => ({ month, value: fn(monthFilter(month), month) }));
}
