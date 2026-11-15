// Tool definitions shared by the browser (which runs the tools) and the proxy (which sends them to the model).
// No data access here: only names, labels, descriptions and input schemas.
import { SERIES_METRICS } from '../metrics/series';
import type { SourceKey } from '../data/types';

export const TOOL_NAMES = [
  'get_month_summary',
  'get_revenue_breakdown',
  'get_treatment_plans',
  'get_marketing',
  'get_instagram',
  'get_patients_recall',
  'get_capacity_team',
  'get_monthly_series',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const isToolName = (name: unknown): name is ToolName => typeof name === 'string' && (TOOL_NAMES as readonly string[]).includes(name);

export interface ToolDef {
  name: ToolName;
  label: { de: string; en: string };
  /** data sources behind the tool (shown under each answer) */
  sources: SourceKey[];
  /** for the model: what it returns, when to use it, what is NOT recorded */
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

const MONTH = { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'Month as YYYY-MM. Defaults to the month selected in the dashboard.' };
const RANGE = {
  from: { type: 'string', pattern: '^\\d{4}-\\d{2}(-\\d{2})?$', description: 'Start of a longer period (YYYY-MM or YYYY-MM-DD). Use together with "to" instead of "month", e.g. for a half-year.' },
  to: { type: 'string', pattern: '^\\d{4}-\\d{2}(-\\d{2})?$', description: 'End of the period (YYYY-MM or YYYY-MM-DD), inclusive.' },
};
const F = {
  staff: { type: 'string', description: 'Team member letter, e.g. "A". Dentists A, B, C; hygienists D, E.' },
  treatment: { type: 'string', enum: ['implants_surgery', 'crowns_lab', 'aesthetics', 'endo_perio', 'prevention', 'checkups_cmd'] },
  payer: { type: 'string', enum: ['GKV', 'PKV', 'self'], description: 'GKV = statutory insurance, PKV = private insurance, self = self-pay.' },
  channel: { type: 'string', enum: ['website', 'google', 'instagram', 'referral', 'reviews', 'intl_site', 'phone'], description: 'Where the patient came from.' },
  district: { type: 'string', enum: ['charlottenburg', 'westend', 'wilmersdorf', 'grunewald', 'spandau', 'schoeneberg', 'other'] },
  patient_type: { type: 'string', enum: ['new', 'existing'] },
};

const schema = (properties: Record<string, unknown>, required?: string[]): ToolDef['input_schema'] => ({
  type: 'object',
  properties,
  ...(required ? { required } : {}),
  additionalProperties: false,
});

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'get_month_summary',
    label: { de: 'Monatsüberblick', en: 'Month summary' },
    sources: ['pvs', 'webform', 'inbox'],
    description:
      'Key figures for one month (or a longer period) and the period before: revenue, appointments, patients, new patients, plan acceptance, online requests, reply speed, missed appointments, payer split, in-house lab, overdue patients, plus recorded events such as staff holidays. Use it first for "what happened" and "what should we focus on" questions. Profit and costs are NOT recorded.',
    input_schema: schema({ month: MONTH, ...RANGE, staff: F.staff, treatment: F.treatment, payer: F.payer, channel: F.channel, district: F.district, patient_type: F.patient_type }),
  },
  {
    name: 'get_revenue_breakdown',
    label: { de: 'Umsatz-Aufschlüsselung', en: 'Revenue breakdown' },
    sources: ['pvs'],
    description:
      'Why revenue changed versus the period before: an exact three-part bridge (number of appointments, type of treatment, prices within treatments), the factors patients × visits × revenue per visit, and one row per treatment area with sessions, average per session and who delivers it. Use it for every "why did revenue change" question. It shows what changed, NOT the reason behind it.',
    input_schema: schema({ month: MONTH, ...RANGE, staff: F.staff, payer: F.payer, channel: F.channel, district: F.district, patient_type: F.patient_type }),
  },
  {
    name: 'get_treatment_plans',
    label: { de: 'Behandlungspläne', en: 'Treatment plans' },
    sources: ['pvs', 'instalments'],
    description:
      'Treatment plans (cost estimates): proposed and booked value, acceptance, open value by age, acceptance per dentist, the instalment comparison (a correlation only) and a follow-up list of open plans. Accepts a month or a longer period, and filters such as treatment or payer. Decline reasons are mostly NOT recorded; the tool returns the few that are.',
    input_schema: schema({ month: MONTH, ...RANGE, staff: F.staff, treatment: F.treatment, payer: F.payer, district: F.district }),
  },
  {
    name: 'get_marketing',
    label: { de: 'Marketing & Anfragen', en: 'Marketing & requests' },
    sources: ['webform', 'inbox', 'phone', 'google_ads', 'pvs'],
    description:
      'Online requests and how fast they were answered, conversion of fast versus late replies, estimated missed new patients, new patients per channel with conversion and ad spend, Google Ads cost per new patient and return, and new patients by district. Use it for questions about requests, channels, Google Ads and where new patients come from. Competitors and patient satisfaction are NOT recorded.',
    input_schema: schema({ month: MONTH, ...RANGE, channel: F.channel, district: F.district }),
  },
  {
    name: 'get_instagram',
    label: { de: 'Instagram', en: 'Instagram' },
    sources: ['instagram', 'pvs'],
    description:
      'Instagram funnel for a month or period: posts, reach, profile visits, link clicks, messages, requests, new patients, and results per type of post. Use it for any Instagram question. The link between posts and patients is a correlation, NOT proof.',
    input_schema: schema({ month: MONTH, ...RANGE }),
  },
  {
    name: 'get_patients_recall',
    label: { de: 'Patienten & Recall', en: 'Patients & recall' },
    sources: ['pvs'],
    description:
      'Patients seen, new and existing patients, patients overdue for a check-up and what that is worth, the value of a recall visit, a typical patient per year, and pseudonymised examples of overdue patients. Use it for recall, check-up and patient-base questions. Reasons why patients cancel are mostly NOT recorded; the tool returns the few that are.',
    input_schema: schema({ month: MONTH, ...RANGE, staff: F.staff, payer: F.payer, channel: F.channel, district: F.district }),
  },
  {
    name: 'get_capacity_team',
    label: { de: 'Behandlungszeit & Team', en: 'Treatment time & team' },
    sources: ['pvs'],
    description:
      'Bookable slots, completed, cancelled and missed appointments, time never booked and its value, each team member with appointments and how often the next appointment was booked, and utilisation per weekday. Use it for missed appointments, free time, weekdays and team questions. "Next appointment booked" is a booking habit, NOT a measure of clinical quality.',
    input_schema: schema({ month: MONTH, ...RANGE, staff: F.staff }),
  },
  {
    name: 'get_monthly_series',
    label: { de: 'Monatsverlauf', en: 'Monthly trend' },
    sources: ['pvs', 'webform', 'instagram'],
    description:
      'One value per month for a single metric across the whole data range, with average, highest and lowest month. Use it for trends, "best month", "since when" and comparisons across several months.',
    input_schema: schema({ metric: { type: 'string', enum: [...SERIES_METRICS] }, from: RANGE.from, to: RANGE.to, staff: F.staff, treatment: F.treatment }, ['metric']),
  },
];

export const toolDef = (name: ToolName): ToolDef => TOOL_DEFS.find((d) => d.name === name)!;
