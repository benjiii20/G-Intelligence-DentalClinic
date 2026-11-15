// Raw record types. Everything downstream (metrics, AI tools, pages) works only on these.
// Dates are naive local strings: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm'. Months are 'YYYY-MM'.

export type StaffId = string; // demo: 'A'..'E'
export type Role = 'dentist' | 'hygienist' | 'assistant';
export type Payer = 'GKV' | 'PKV' | 'self';

export const TREATMENTS = [
  'implants_surgery',
  'crowns_lab',
  'aesthetics',
  'endo_perio',
  'prevention',
  'checkups_cmd',
] as const;
export type Treatment = (typeof TREATMENTS)[number];

/** Where a patient came from (acquisition channel). */
export const CHANNELS = ['website', 'google', 'instagram', 'referral', 'reviews', 'intl_site', 'phone'] as const;
export type Channel = (typeof CHANNELS)[number];

/** How a request physically arrived. */
export const REQUEST_CHANNELS = [
  'website_form',
  'email',
  'site_en',
  'site_ru',
  'instagram_dm',
  'instagram_bio',
  'phone',
] as const;
export type RequestChannel = (typeof REQUEST_CHANNELS)[number];

export const DISTRICTS = [
  'charlottenburg',
  'westend',
  'wilmersdorf',
  'grunewald',
  'spandau',
  'schoeneberg',
  'other',
] as const;
export type District = (typeof DISTRICTS)[number];

export const POST_TYPES = ['before_after', 'implant_lab', 'team', 'tips', 'anxious'] as const;
export type PostType = (typeof POST_TYPES)[number];

export interface DateRange {
  from: string;
  to: string;
}

export interface StaffMember {
  id: StaffId;
  label: string; // 'A'..'E'
  role: Role;
  focus: Treatment[];
  weeklyHours: number;
  absences: DateRange[];
}

export interface Patient {
  id: string; // pseudonymised, e.g. '#4812'
  firstVisit: string | null;
  /** null when the export does not say */
  payer: Payer | null;
  channel: Channel | null;
  district: District | null;
  birthYearRange: string | null; // e.g. '1970-1979'
  flags?: string[]; // import validation marks
}

export type AppointmentStatus = 'completed' | 'cancelled' | 'no_show';
export type CancelReason = 'illness' | 'forgot' | 'cost' | 'other' | 'not_recorded';

export interface Appointment {
  id: string;
  patientId: string;
  staffId: StaffId;
  at: string; // 'YYYY-MM-DDTHH:mm'
  treatment: Treatment;
  status: AppointmentStatus;
  billed: number; // euros; 0 for cancelled / no-show
  nextBooked: boolean | null; // null = unknown
  cancelReason?: CancelReason;
  flags?: string[];
}

export interface LabWork {
  appointmentId: string;
  amount: number;
}

export type PlanStatus = 'open' | 'accepted' | 'declined' | 'expired';
export type DeclineReason = 'cost' | 'wants_to_think' | 'second_opinion' | 'other' | 'not_recorded';
export type Instalments = 'yes' | 'no' | 'unknown';

export interface TreatmentPlan {
  id: string;
  patientId: string;
  dentistId: StaffId;
  treatment: Treatment;
  value: number;
  created: string;
  status: PlanStatus;
  acceptedDate?: string;
  closedDate?: string; // declined / expired on
  instalmentsOffered: Instalments;
  declineReason?: DeclineReason;
}

export interface Recall {
  patientId: string;
  due: string;
  createdAt?: string; // when this recall was set (usually the last check-up)
}

export interface Capacity {
  staffId: StaffId; // one chair per clinician
  weekday: number; // 1 = Mon … 5 = Fri
  slots: number;
}

export interface Request {
  id: string;
  receivedAt: string;
  channel: RequestChannel;
  source: Channel | null; // attribution (utm / "how did you find us")
  firstReplyAt: string | null;
  becamePatientId: string | null;
  igPostId?: string;
}

export interface InstagramPost {
  id: string;
  date: string;
  type: PostType;
  reach: number;
  profileVisits: number;
  linkClicks: number;
}

export interface InstagramMonthly {
  month: string;
  messages: number;
}

export interface AdSpend {
  month: string;
  platform: 'google_ads' | 'meta_ads';
  spend: number;
}

export interface Review {
  date: string;
  platform: 'provenexpert' | 'google';
  rating: number;
}

export type EventType = 'holiday' | 'staff_change' | 'campaign' | 'price_change' | 'closure' | 'other';

export interface PracticeEvent {
  id: string;
  from: string;
  to: string;
  type: EventType;
  /** Demo events use an i18n key; user-entered events use free text. */
  descriptionKey?: string;
  description?: string;
  staffId?: StaffId;
}

export const SOURCE_KEYS = [
  'pvs',
  'webform',
  'inbox',
  'instagram',
  'google_ads',
  'gbp',
  'provenexpert',
  'phone',
  'lab',
  'instalments',
] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

export interface Dataset {
  mode: 'demo' | 'real';
  firstMonth: string;
  lastMonth: string;
  staff: StaffMember[];
  patients: Patient[];
  appointments: Appointment[];
  labWork: LabWork[];
  plans: TreatmentPlan[];
  recalls: Recall[];
  capacity: Capacity[];
  requests: Request[];
  igPosts: InstagramPost[];
  igMonthly: InstagramMonthly[];
  adSpend: AdSpend[];
  reviews: Review[];
  events: PracticeEvent[];
  /** Which sources are connected / imported. Metrics return "missing" for the rest. */
  sources: Record<SourceKey, boolean>;
}

/** Opening hours: Mon–Thu 8:00–18:00, Fri 8:00–16:00. Index = JS weekday (0 = Sun). */
export const OPENING: Record<number, [number, number] | null> = {
  0: null,
  1: [8, 18],
  2: [8, 18],
  3: [8, 18],
  4: [8, 18],
  5: [8, 16],
  6: null,
};
