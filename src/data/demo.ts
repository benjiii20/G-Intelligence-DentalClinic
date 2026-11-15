// Deterministic, seeded demo data: raw records for Oct 2025 – Oct 2026.
// The "stories" (spec §5) are built into the records; no metric value is hard-coded anywhere.
import {
  addDays,
  addMonths,
  addWorkingMinutes,
  daysBetween,
  daysInRange,
  hhmm,
  monthEnd,
  monthOf,
  monthStart,
  monthsBetween,
  weekdayOf,
} from './dates';
import type {
  AdSpend,
  Appointment,
  Capacity,
  Channel,
  Dataset,
  District,
  InstagramMonthly,
  InstagramPost,
  Instalments,
  LabWork,
  Patient,
  Payer,
  PostType,
  PracticeEvent,
  Recall,
  Request,
  RequestChannel,
  Review,
  StaffId,
  StaffMember,
  Treatment,
  TreatmentPlan,
} from './types';
import { SOURCE_KEYS } from './types';

export const DEMO_FIRST_MONTH = '2025-10';
export const DEMO_LAST_MONTH = '2026-10';

// ---------- seeded random ----------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private r: () => number;
  constructor(seed: number) {
    this.r = mulberry32(seed);
  }
  next(): number {
    return this.r();
  }
  chance(p: number): boolean {
    return this.r() < p;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.r() * (max - min + 1));
  }
  range(min: number, max: number): number {
    return min + this.r() * (max - min);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.r() * arr.length)];
  }
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of items) total += w;
    let x = this.r() * total;
    for (const [item, w] of items) {
      x -= w;
      if (x <= 0) return item;
    }
    return items[items.length - 1][0];
  }
}

// ---------- parameters ----------
const SEASON: Record<string, number> = {
  '2025-10': 0.95,
  '2025-11': 0.97,
  '2025-12': 0.83,
  '2026-01': 0.93,
  '2026-02': 0.95,
  '2026-03': 1.0,
  '2026-04': 0.97,
  '2026-05': 0.98,
  '2026-06': 1.0,
  '2026-07': 0.85,
  '2026-08': 0.93,
  '2026-09': 1.0,
  '2026-10': 0.98,
};

const BASE_PRICE: Record<Treatment, number> = {
  implants_surgery: 2300,
  crowns_lab: 980,
  aesthetics: 1150,
  endo_perio: 320,
  prevention: 120,
  checkups_cmd: 140,
};

// Statutory (GKV) billing is far lower for basic care; elective care is paid privately.
const PAYER_FACTOR: Record<Treatment, Record<Payer, number>> = {
  implants_surgery: { GKV: 0.97, PKV: 1.05, self: 1 },
  crowns_lab: { GKV: 0.92, PKV: 1.1, self: 1 },
  aesthetics: { GKV: 1, PKV: 1, self: 1 },
  endo_perio: { GKV: 0.55, PKV: 1.1, self: 1 },
  prevention: { GKV: 0.9, PKV: 1.05, self: 1 },
  checkups_cmd: { GKV: 0.25, PKV: 1.05, self: 0.9 },
};

const STAFF_SHARE: Record<Treatment, (readonly [StaffId, number])[]> = {
  implants_surgery: [['A', 85], ['B', 15]],
  crowns_lab: [['B', 58], ['A', 27], ['C', 15]],
  aesthetics: [['B', 75], ['C', 15], ['A', 10]],
  endo_perio: [['C', 80], ['A', 10], ['B', 10]],
  prevention: [['D', 52], ['E', 48]],
  checkups_cmd: [['A', 31], ['B', 32], ['C', 37]],
};

const REBOOK_P: Record<StaffId, number> = { A: 0.7, B: 0.73, C: 0.69, D: 0.8, E: 0.5 };
const WEEKDAY_WEIGHT: Record<number, number> = { 1: 1.0, 2: 0.97, 3: 0.7, 4: 0.95, 5: 0.66 };
const SLOTS: Record<'dentist' | 'hygienist', Record<number, number>> = {
  dentist: { 1: 14, 2: 14, 3: 14, 4: 14, 5: 11 },
  hygienist: { 1: 9, 2: 9, 3: 9, 4: 9, 5: 7 },
};

const PUBLIC_HOLIDAYS = [
  '2025-10-03',
  '2026-04-03',
  '2026-04-06',
  '2026-05-01',
  '2026-05-14',
  '2026-05-25',
];
const CLOSURE = { from: '2025-12-24', to: '2026-01-02' };

const DISTRICT_W: (readonly [District, number])[] = [
  ['charlottenburg', 38],
  ['westend', 22],
  ['wilmersdorf', 14],
  ['grunewald', 7],
  ['spandau', 8],
  ['schoeneberg', 5],
  ['other', 6],
];
const DISTRICT_VALUE: Record<District, number> = {
  charlottenburg: 1,
  westend: 1.15,
  wilmersdorf: 0.95,
  grunewald: 2.4,
  spandau: 0.7,
  schoeneberg: 0.85,
  other: 0.8,
};

const ONLINE_SOURCE_W: (readonly [Channel, number])[] = [
  ['website', 28],
  ['google', 25],
  ['instagram', 27],
  ['reviews', 6],
  ['intl_site', 9],
  ['referral', 5],
];
const PHONE_SOURCE_W: (readonly [Channel, number])[] = [
  ['referral', 42],
  ['google', 20],
  ['website', 13],
  ['reviews', 10],
  ['phone', 15],
];
const CONV_MULT: Record<Channel, number> = {
  website: 1.0,
  google: 1.2,
  instagram: 0.64,
  referral: 1.6,
  reviews: 1.1,
  intl_site: 1.0,
  phone: 0.9,
};
// Which elective treatment a new patient from a channel tends to want.
const JOURNEY_W: Record<Channel | 'none', (readonly [Treatment, number])[]> = {
  website: [['implants_surgery', 3], ['crowns_lab', 4], ['aesthetics', 2]],
  google: [['implants_surgery', 5], ['crowns_lab', 3], ['aesthetics', 1]],
  instagram: [['aesthetics', 6], ['implants_surgery', 1], ['crowns_lab', 1]],
  referral: [['implants_surgery', 4], ['crowns_lab', 4], ['aesthetics', 2]],
  reviews: [['implants_surgery', 3], ['crowns_lab', 4], ['aesthetics', 2]],
  intl_site: [['implants_surgery', 5], ['crowns_lab', 2], ['aesthetics', 3]],
  phone: [['crowns_lab', 4], ['implants_surgery', 2], ['aesthetics', 1]],
  none: [['crowns_lab', 4], ['implants_surgery', 2], ['aesthetics', 1]],
};

const POST_TYPE_W: (readonly [PostType, number])[] = [
  ['before_after', 22],
  ['implant_lab', 20],
  ['team', 24],
  ['tips', 22],
  ['anxious', 12],
];
const POST_REACH: Record<PostType, number> = {
  team: 2500,
  before_after: 1750,
  implant_lab: 1250,
  tips: 1000,
  anxious: 920,
};
const POST_VISIT_RATE: Record<PostType, number> = {
  team: 0.035,
  before_after: 0.07,
  implant_lab: 0.045,
  tips: 0.03,
  anxious: 0.05,
};
const POST_CLICK_RATE: Record<PostType, number> = {
  team: 0.03,
  before_after: 0.16,
  implant_lab: 0.11,
  tips: 0.06,
  anxious: 0.12,
};
const POST_REQUEST_W: Record<PostType, number> = {
  before_after: 5,
  implant_lab: 2.2,
  anxious: 1.6,
  tips: 0.7,
  team: 0.2,
};

interface PState {
  p: Patient;
  due: string | null;
  rebooked: boolean;
  interval: number;
  visited: boolean; // had any visit in data range
}

interface Pending {
  earliest: string;
  treatment: Treatment;
  patientId: string;
  first?: boolean;
}

export function generateDemo(seed = 20261031): Dataset {
  const rng = new Rng(seed);
  const months = monthsBetween(DEMO_FIRST_MONTH, DEMO_LAST_MONTH);
  const dataEnd = monthEnd(DEMO_LAST_MONTH);

  // ---------- staff & events ----------
  const staff: StaffMember[] = [
    {
      id: 'A',
      label: 'A',
      role: 'dentist',
      focus: ['implants_surgery'],
      weeklyHours: 38,
      absences: [
        { from: '2026-10-12', to: '2026-10-16' },
        { from: '2026-02-09', to: '2026-02-11' },
      ],
    },
    {
      id: 'B',
      label: 'B',
      role: 'dentist',
      focus: ['crowns_lab', 'aesthetics'],
      weeklyHours: 38,
      absences: [{ from: '2026-07-13', to: '2026-07-24' }],
    },
    {
      id: 'C',
      label: 'C',
      role: 'dentist',
      focus: ['endo_perio', 'checkups_cmd'],
      weeklyHours: 36,
      absences: [{ from: '2026-08-03', to: '2026-08-07' }],
    },
    { id: 'D', label: 'D', role: 'hygienist', focus: ['prevention'], weeklyHours: 36, absences: [{ from: '2026-07-27', to: '2026-07-31' }] },
    { id: 'E', label: 'E', role: 'hygienist', focus: ['prevention'], weeklyHours: 34, absences: [{ from: '2026-06-01', to: '2026-06-03' }] },
  ];
  const staffById = new Map(staff.map((s) => [s.id, s]));

  const events: PracticeEvent[] = [
    { id: 'ev1', from: CLOSURE.from, to: CLOSURE.to, type: 'closure', descriptionKey: 'events.demo.closure' },
    { id: 'ev2', from: '2026-10-12', to: '2026-10-16', type: 'holiday', descriptionKey: 'events.demo.holidayA', staffId: 'A' },
    { id: 'ev3', from: '2026-07-13', to: '2026-07-24', type: 'holiday', descriptionKey: 'events.demo.holidayB', staffId: 'B' },
    { id: 'ev4', from: '2026-04-01', to: '2026-04-01', type: 'price_change', descriptionKey: 'events.demo.pricePzr' },
    { id: 'ev5', from: '2026-09-07', to: '2026-10-25', type: 'campaign', descriptionKey: 'events.demo.campaignIg' },
    { id: 'ev6', from: '2026-08-03', to: '2026-08-07', type: 'holiday', descriptionKey: 'events.demo.holidayC', staffId: 'C' },
    ...PUBLIC_HOLIDAYS.map(
      (d, i): PracticeEvent => ({ id: `ph${i}`, from: d, to: d, type: 'closure', descriptionKey: 'events.demo.publicHoliday' }),
    ),
  ];

  const capacity: Capacity[] = [];
  for (const s of staff) {
    for (let wd = 1; wd <= 5; wd++) {
      capacity.push({ staffId: s.id, weekday: wd, slots: SLOTS[s.role === 'dentist' ? 'dentist' : 'hygienist'][wd] });
    }
  }

  const isClosed = (day: string): boolean =>
    (day >= CLOSURE.from && day <= CLOSURE.to) || PUBLIC_HOLIDAYS.includes(day) || weekdayOf(day) === 0 || weekdayOf(day) === 6;
  const isAbsent = (id: StaffId, day: string): boolean =>
    staffById.get(id)!.absences.some((a) => day >= a.from && day <= a.to);
  const slotsFor = (id: StaffId, day: string): number => {
    if (isClosed(day) || isAbsent(id, day)) return 0;
    return SLOTS[staffById.get(id)!.role === 'dentist' ? 'dentist' : 'hygienist'][weekdayOf(day)] ?? 0;
  };

  // ---------- patients ----------
  const patients: Patient[] = [];
  const states = new Map<string, PState>();
  const usedIds = new Set<number>();
  const recalls: Recall[] = [];
  const BIRTH = ['1940-1949', '1950-1959', '1960-1969', '1970-1979', '1980-1989', '1990-1999', '2000-2009'];

  const makePatient = (firstVisit: string, channel: Channel | null, district?: District): PState => {
    let n = rng.int(1000, 9999);
    while (usedIds.has(n)) n = rng.int(1000, 9999);
    usedIds.add(n);
    const p: Patient = {
      id: `#${n}`,
      firstVisit,
      payer: rng.weighted<Payer>([['GKV', 68], ['PKV', 22], ['self', 10]]),
      channel,
      district: district ?? rng.weighted(DISTRICT_W),
      birthYearRange: rng.weighted(BIRTH.map((b, i) => [b, [4, 9, 16, 20, 22, 19, 10][i]] as const)),
    };
    if (p.district === 'grunewald' && p.payer === 'GKV' && rng.chance(0.5)) p.payer = 'PKV';
    patients.push(p);
    const st: PState = { p, due: null, rebooked: false, interval: rng.chance(0.85) ? 182 : 365, visited: false };
    states.set(p.id, st);
    return st;
  };

  const OLD_CHANNEL_W: (readonly [Channel | null, number])[] = [
    ['referral', 40],
    ['website', 15],
    ['google', 14],
    ['phone', 10],
    ['reviews', 5],
    ['instagram', 3],
    [null, 13],
  ];
  for (let i = 0; i < 2600; i++) {
    const year = rng.int(2014, 2025);
    const first = `${year}-${String(rng.int(1, year === 2025 ? 8 : 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`;
    const st = makePatient(first, rng.weighted(OLD_CHANNEL_W));
    if (i < 1780) {
      st.due = addDays('2025-10-01', rng.int(0, 181));
      st.rebooked = rng.chance(0.68);
    } else if (i < 2150) {
      st.interval = 365;
      st.due = addDays('2026-04-01', rng.int(0, 181));
      st.rebooked = rng.chance(0.68);
    } else if (i < 2390) {
      st.due = addDays('2025-04-10', rng.int(0, 170));
      st.rebooked = false;
    }
    if (st.due) recalls.push({ patientId: st.p.id, due: st.due, createdAt: addDays(st.due, -st.interval) });
  }
  const basePool = [...states.values()];

  // ---------- containers ----------
  const appointments: Appointment[] = [];
  const labWork: LabWork[] = [];
  const plans: TreatmentPlan[] = [];
  const requests: Request[] = [];
  const igPosts: InstagramPost[] = [];
  const igMonthly: InstagramMonthly[] = [];
  const adSpend: AdSpend[] = [];
  const reviews: Review[] = [];
  const pending = new Map<string, Pending[]>();
  const pushPending = (item: Pending) => {
    const m = monthOf(item.earliest);
    if (m > DEMO_LAST_MONTH) return;
    if (!pending.has(m)) pending.set(m, []);
    pending.get(m)!.push(item);
  };
  const acceptedPlanQueue: Record<string, { patientId: string; from: string }[]> = {};
  let apptSeq = 0;
  let planSeq = 0;
  let reqSeq = 0;
  let postSeq = 0;

  const newPatientFromChannel = (firstVisitTarget: string, channel: Channel | null): PState | null => {
    if (firstVisitTarget > addDays(dataEnd, -1)) return null;
    const recorded = rng.chance(0.95) ? channel : null;
    const district =
      channel === 'intl_site'
        ? rng.weighted<District>([['charlottenburg', 40], ['wilmersdorf', 20], ['grunewald', 14], ['westend', 12], ['other', 14]])
        : undefined;
    const st = makePatient(firstVisitTarget, recorded, district);
    pushPending({ earliest: firstVisitTarget, treatment: 'checkups_cmd', patientId: st.p.id, first: true });
    if (rng.chance(0.55)) pushPending({ earliest: addDays(firstVisitTarget, rng.int(7, 35)), treatment: 'prevention', patientId: st.p.id });
    const value = DISTRICT_VALUE[st.p.district ?? 'other'];
    const pHigh = Math.min(0.75, 0.2 * value * (channel === 'instagram' ? 0.8 : channel === 'referral' ? 1.2 : 1));
    if (rng.chance(pHigh)) {
      const t = rng.weighted(JOURNEY_W[channel ?? 'none']);
      pushPending({ earliest: addDays(firstVisitTarget, rng.int(14, 60)), treatment: t, patientId: st.p.id });
      if (value > 1.5 && rng.chance(0.45)) {
        pushPending({ earliest: addDays(firstVisitTarget, rng.int(50, 110)), treatment: 'crowns_lab', patientId: st.p.id });
      }
    }
    if (rng.chance(0.1)) pushPending({ earliest: addDays(firstVisitTarget, rng.int(5, 40)), treatment: 'endo_perio', patientId: st.p.id });
    return st;
  };

  // ---------- month loop ----------
  months.forEach((month, mi) => {
    const season = SEASON[month] ?? 1;
    const isOct26 = month === '2026-10';
    const isSep26 = month === '2026-09';
    const days = daysInRange(monthStart(month), monthEnd(month));
    const workDays = days.filter((d) => !isClosed(d));
    const used = new Map<string, number>(); // staff|day -> count

    // --- Instagram posts ---
    const nPosts = Math.min(18, Math.max(12, Math.round(13 + mi * 0.25 + rng.range(-1.5, 2))));
    const monthPosts: InstagramPost[] = [];
    for (let i = 0; i < nPosts; i++) {
      const type = rng.weighted(POST_TYPE_W);
      const reach = Math.round(POST_REACH[type] * (1 + 0.028 * mi) * rng.range(0.75, 1.3));
      const profileVisits = Math.round(reach * POST_VISIT_RATE[type] * rng.range(0.8, 1.2));
      const post: InstagramPost = {
        id: `ig${++postSeq}`,
        date: rng.pick(days),
        type,
        reach,
        profileVisits,
        linkClicks: Math.round(profileVisits * POST_CLICK_RATE[type] * rng.range(0.7, 1.3)),
      };
      monthPosts.push(post);
    }
    monthPosts.sort((a, b) => (a.date < b.date ? -1 : 1));
    igPosts.push(...monthPosts);

    // --- ad spend & reviews ---
    adSpend.push({ month, platform: 'google_ads', spend: Math.round(rng.range(1320, 1620)) });
    adSpend.push({ month, platform: 'meta_ads', spend: Math.round(rng.range(290, 430)) });
    const nReviews = rng.int(2, 5);
    for (let i = 0; i < nReviews; i++) {
      reviews.push({
        date: rng.pick(days),
        platform: rng.chance(0.55) ? 'google' : 'provenexpert',
        rating: rng.weighted([[5, 80], [4, 16], [3, 4]]),
      });
    }

    // --- requests ---
    const onlineTarget = isOct26 ? 92 : isSep26 ? 79 : Math.round((58 + mi * 1.7) * (0.9 + season * 0.1) + rng.range(-4, 4));
    const phoneTarget = Math.round(38 * season + rng.range(-4, 4));
    const fastInHours = isOct26 ? 0.61 : 0.8;
    const mondayQuick = isOct26 ? 0.08 : 0.34;
    let igDm = 0;
    const makeRequest = (online: boolean) => {
      const day = rng.weighted(
        days.map((d) => [d, online ? [12, 16, 15, 14, 15, 16, 12][weekdayOf(d)] : isClosed(d) ? 0 : 10] as const),
      );
      const wd = weekdayOf(day);
      let minute: number;
      if (!online) {
        minute = rng.int(8 * 60, (wd === 5 ? 16 : 18) * 60 - 5);
      } else {
        const u = rng.next();
        minute = u < 0.58 ? rng.int(8 * 60, 18 * 60 - 1) : u < 0.9 ? rng.int(18 * 60, 23 * 60) : rng.int(6 * 60, 8 * 60 - 1);
      }
      const receivedAt = `${day}T${hhmm(minute)}`;
      const source = rng.weighted(online ? ONLINE_SOURCE_W : PHONE_SOURCE_W);
      let channel: RequestChannel = 'phone';
      let igPostId: string | undefined;
      if (online) {
        if (source === 'instagram') {
          channel = rng.chance(0.55) ? 'instagram_dm' : 'instagram_bio';
          if (channel === 'instagram_dm') igDm++;
          const cands = monthPosts.filter((p) => p.date <= day);
          const pool = cands.length ? cands : monthPosts;
          igPostId = rng.weighted(pool.map((p) => [p.id, POST_REQUEST_W[p.type]] as const));
        } else if (source === 'intl_site') {
          channel = rng.chance(0.6) ? 'site_en' : 'site_ru';
        } else {
          channel = rng.chance(0.76) ? 'website_form' : 'email';
        }
      }
      // reply time
      let firstReplyAt: string | null;
      let fast: boolean;
      if (!online) {
        fast = rng.chance(0.85);
        firstReplyAt = fast ? receivedAt : addWorkingMinutes(receivedAt, rng.int(150, 420));
      } else {
        const afterHoursLong = wd === 6 || wd === 0 || (wd === 5 && minute >= 13 * 60);
        if (afterHoursLong) {
          fast = rng.chance(mondayQuick);
          // next Monday (or next open day)
          const base = addWorkingMinutes(receivedAt, 0);
          firstReplyAt = fast && wd !== 5 ? addWorkingMinutes(base, rng.int(15, 110)) : addWorkingMinutes(base, rng.int(150, 420));
          if (wd === 5 && fast) firstReplyAt = addWorkingMinutes(receivedAt, rng.int(15, 110));
        } else {
          fast = rng.chance(fastInHours);
          firstReplyAt = fast ? addWorkingMinutes(receivedAt, rng.int(8, 112)) : addWorkingMinutes(receivedAt, rng.int(135, 540));
        }
        if (!fast && rng.chance(0.04)) firstReplyAt = null;
      }
      // conversion
      const baseConv = online ? (fast ? 0.42 : 0.2) : fast ? 0.44 : 0.3;
      const conv = Math.min(0.85, baseConv * CONV_MULT[source]);
      let becamePatientId: string | null = null;
      if (rng.chance(conv)) {
        const st = newPatientFromChannel(addDays(day, rng.int(2, 11)), source);
        becamePatientId = st ? st.p.id : null;
      }
      requests.push({ id: `rq${++reqSeq}`, receivedAt, channel, source, firstReplyAt, becamePatientId, igPostId });
    };
    for (let i = 0; i < onlineTarget; i++) makeRequest(true);
    for (let i = 0; i < phoneTarget; i++) makeRequest(false);
    igMonthly.push({ month, messages: Math.round(igDm * rng.range(4.2, 6) + rng.range(18, 34) + mi * 1.5) });

    // walk-ins / family referrals without a request
    const walkIns = rng.int(2, 5);
    for (let i = 0; i < walkIns; i++) {
      newPatientFromChannel(rng.pick(workDays.length ? workDays : days), rng.chance(0.6) ? 'referral' : null);
    }

    // --- scheduling helpers ---
    const pickDay = (staffId: StaffId, earliest?: string): string | null => {
      const cands: (readonly [string, number])[] = [];
      for (const d of workDays) {
        if (earliest && d < earliest) continue;
        const cap = slotsFor(staffId, d);
        const u = used.get(`${staffId}|${d}`) ?? 0;
        if (cap - u <= 0) continue;
        cands.push([d, (WEEKDAY_WEIGHT[weekdayOf(d)] ?? 0.8) * cap * (0.35 + (0.65 * (cap - u)) / cap)]);
      }
      if (!cands.length) return null;
      return rng.weighted(cands);
    };
    const pickStaff = (t: Treatment, earliest?: string): { staffId: StaffId; day: string } | null => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const staffId = rng.weighted(STAFF_SHARE[t]);
        const day = pickDay(staffId, earliest);
        if (day) return { staffId, day };
      }
      return null;
    };
    const priceFactor = (t: Treatment, day: string): number => (t === 'prevention' && day >= '2026-04-01' ? 1.05 : 1);

    const book = (
      st: PState,
      t: Treatment,
      slot: { staffId: StaffId; day: string },
      status: Appointment['status'] = 'completed',
    ): Appointment => {
      const key = `${slot.staffId}|${slot.day}`;
      const idx = used.get(key) ?? 0;
      used.set(key, idx + 1);
      const cap = Math.max(1, slotsFor(slot.staffId, slot.day));
      const wd = weekdayOf(slot.day);
      const openMin = 8 * 60;
      const span = ((wd === 5 ? 16 : 18) - 8) * 60;
      const minute = openMin + Math.floor((idx * span) / cap / 5) * 5;
      const completed = status === 'completed';
      let billed = 0;
      if (completed) {
        const noise = t === 'implants_surgery' ? rng.range(0.8, 1.22) : rng.range(0.82, 1.2);
        billed = Math.round(BASE_PRICE[t] * PAYER_FACTOR[t][st.p.payer ?? 'GKV'] * priceFactor(t, slot.day) * noise);
      }
      const a: Appointment = {
        id: `ap${++apptSeq}`,
        patientId: st.p.id,
        staffId: slot.staffId,
        at: `${slot.day}T${hhmm(minute)}`,
        treatment: t,
        status,
        billed,
        nextBooked: completed
          ? rng.chance(t === 'prevention' || t === 'checkups_cmd' ? REBOOK_P[slot.staffId] : Math.min(0.9, REBOOK_P[slot.staffId] + 0.12))
          : false,
      };
      if (!completed) {
        a.cancelReason = rng.chance(0.2) ? rng.weighted([['illness', 5], ['forgot', 3], ['cost', 1], ['other', 2]]) : 'not_recorded';
        if (status === 'no_show') a.cancelReason = rng.chance(0.12) ? 'forgot' : 'not_recorded';
      }
      appointments.push(a);
      if (completed) {
        st.visited = true;
        if (t === 'crowns_lab') labWork.push({ appointmentId: a.id, amount: Math.round(billed * rng.range(0.3, 0.42)) });
        else if (t === 'implants_surgery' && rng.chance(0.5)) labWork.push({ appointmentId: a.id, amount: Math.round(billed * rng.range(0.08, 0.16)) });
        else if (t === 'aesthetics' && rng.chance(0.4)) labWork.push({ appointmentId: a.id, amount: Math.round(billed * rng.range(0.15, 0.3)) });
      }
      return a;
    };
    const setRecall = (st: PState, a: Appointment) => {
      st.due = addDays(a.at, st.interval);
      st.rebooked = a.nextBooked === true;
      recalls.push({ patientId: st.p.id, due: st.due, createdAt: a.at.slice(0, 10) });
    };

    // --- targets ---
    const noise = () => rng.range(0.95, 1.05);
    const target: Record<Treatment, number> = {
      implants_surgery: isOct26 ? 7 : isSep26 ? 12 : Math.round(10 * season * noise()),
      crowns_lab: Math.round(14 * season * noise()),
      aesthetics: Math.round(6.4 * season * noise()),
      endo_perio: Math.round(40 * season * noise()),
      prevention: Math.round(318 * season * noise()),
      checkups_cmd: Math.round(575 * season * noise()),
    };
    const done: Record<Treatment, number> = {
      implants_surgery: 0,
      crowns_lab: 0,
      aesthetics: 0,
      endo_perio: 0,
      prevention: 0,
      checkups_cmd: 0,
    };

    // 1) pending sessions (new patients' first visits and journeys)
    const pend = (pending.get(month) ?? []).sort((a, b) => (a.earliest < b.earliest ? -1 : 1));
    for (const item of pend) {
      const st = states.get(item.patientId)!;
      if (!item.first && done[item.treatment] >= target[item.treatment] && item.treatment !== 'prevention') {
        // month is full for this treatment: push to next month
        pushPending({ ...item, earliest: monthStart(addMonths(month, 1)) });
        continue;
      }
      const slot = pickStaff(item.treatment, item.earliest) ?? pickStaff(item.treatment);
      if (!slot) continue;
      const a = book(st, item.treatment, slot);
      if (item.first) st.p.firstVisit = slot.day;
      done[item.treatment]++;
      if (item.treatment === 'prevention' || (item.first && rng.chance(0.5))) setRecall(st, a);
    }

    // 2) elective and endo sessions for existing patients
    const existing = basePool;
    for (const t of ['implants_surgery', 'crowns_lab', 'aesthetics', 'endo_perio'] as Treatment[]) {
      while (done[t] < target[t]) {
        const slot = pickStaff(t);
        if (!slot) break;
        const queue = acceptedPlanQueue[t] ?? [];
        const qi = queue.findIndex((q) => q.from <= slot.day);
        let st: PState;
        if (qi >= 0 && rng.chance(0.8)) {
          st = states.get(queue[qi].patientId)!;
          queue.splice(qi, 1);
        } else {
          st = rng.pick(existing);
        }
        book(st, t, slot);
        done[t]++;
      }
    }

    // 3) recall-driven prevention: who comes back depends on whether the next visit was booked
    const mEnd = monthEnd(month);
    const cands: { st: PState; key: number }[] = [];
    for (const st of states.values()) {
      if (!st.due || st.due > addDays(mEnd, 10)) continue;
      if (st.p.firstVisit && st.p.firstVisit > mEnd) continue;
      const late = daysBetween(st.due, mEnd);
      let w: number;
      if (late <= 45) w = st.rebooked ? 1 : 0.22;
      else if (late <= 80) w = st.rebooked ? 0.3 : 0.1;
      else w = 0.018;
      cands.push({ st, key: Math.pow(rng.next(), 1 / w) });
    }
    cands.sort((a, b) => b.key - a.key);
    const attendees = cands.slice(0, Math.max(0, target.prevention - done.prevention)).map((c) => c.st);
    const missRate = isOct26 ? 0.108 : isSep26 ? 0.058 : 0.062 + rng.range(-0.006, 0.006);
    const totalTarget = Object.values(target).reduce((a, b) => a + b, 0);
    let missLeft = Math.round(totalTarget * missRate);
    const bookMissed = (st: PState, t: Treatment) => {
      const slot = pickStaff(t);
      if (!slot) return;
      book(st, t, slot, rng.chance(0.28) ? 'no_show' : 'cancelled');
      missLeft--;
    };
    for (const st of attendees) {
      // a few of the booked patients cancel or do not show up; they stay due
      if (missLeft > 0 && rng.chance(missRate * 0.9)) {
        bookMissed(st, rng.chance(0.55) ? 'prevention' : 'checkups_cmd');
        continue;
      }
      const hyg = pickStaff('prevention');
      if (!hyg) break;
      if (rng.chance(0.62) && done.checkups_cmd < target.checkups_cmd) {
        const dent = pickStaff('checkups_cmd');
        if (dent) {
          if (dent.day > hyg.day) {
            const alt = pickDay(hyg.staffId, dent.day);
            if (alt) hyg.day = alt;
          }
          book(st, 'checkups_cmd', dent);
          done.checkups_cmd++;
        }
      }
      const a = book(st, 'prevention', hyg);
      done.prevention++;
      setRecall(st, a);
    }

    // 4) other check-ups, fillings, CMD: random existing patients, overdue ones a bit more often
    while (done.checkups_cmd < target.checkups_cmd) {
      const slot = pickStaff('checkups_cmd');
      if (!slot) break;
      const st = rng.pick(existing);
      if (missLeft > 0 && rng.chance(missRate * 0.6)) {
        bookMissed(st, 'checkups_cmd');
        continue;
      }
      const a = book(st, 'checkups_cmd', slot);
      done.checkups_cmd++;
      if (st.due && st.due < slot.day && rng.chance(0.5)) setRecall(st, a);
    }
    // 5) remaining missed appointments (other treatments included)
    let guard = 0;
    while (missLeft > 0 && guard++ < 400) {
      const t = rng.weighted<Treatment>([
        ['checkups_cmd', 46],
        ['prevention', 38],
        ['endo_perio', 9],
        ['crowns_lab', 4],
        ['implants_surgery', 2],
        ['aesthetics', 1],
      ]);
      bookMissed(rng.pick(existing), t);
    }

    // --- treatment plans (cost estimates) ---
    const accBase = isOct26 ? 0.55 : isSep26 ? 0.66 : 0.645 + rng.range(-0.025, 0.03);
    const dentistOffset: Record<StaffId, number> = isOct26 ? { A: -0.11, B: 0.08, C: 0.1 } : { A: 0.01, B: 0, C: -0.01 };
    const planCounts: [Treatment, number, number, number][] = [
      ['implants_surgery', Math.round(13 * season * noise()), 3200, 6500],
      ['crowns_lab', Math.round(20 * season * noise()), 1200, 2800],
      ['aesthetics', Math.round(9 * season * noise()), 1400, 3200],
      ['endo_perio', Math.round(11 * season * noise()), 450, 1100],
    ];
    const monthPlans: (TreatmentPlan & { _acc: boolean })[] = [];
    const recentNew = patients.slice(-60);
    for (const [t, n, lo, hi] of planCounts) {
      for (let i = 0; i < n; i++) {
        const dentistId = rng.weighted(STAFF_SHARE[t]);
        const dayCands = workDays.filter((d) => !isAbsent(dentistId, d));
        const created = rng.pick(dayCands.length ? dayCands : workDays);
        const value = Math.round(rng.range(lo, hi) / 10) * 10;
        const inst: Instalments =
          value < 900
            ? rng.weighted<Instalments>([['no', 80], ['yes', 8], ['unknown', 12]])
            : rng.weighted<Instalments>([['yes', 31], ['no', 59], ['unknown', 10]]);
        const p = accBase + (dentistOffset[dentistId] ?? 0) + (inst === 'yes' ? 0.125 : inst === 'no' ? -0.055 : 0);
        const patient = rng.chance(0.25) && recentNew.length ? rng.pick(recentNew) : rng.pick(existing).p;
        monthPlans.push({
          id: `HKP-${String(++planSeq).padStart(4, '0')}`,
          patientId: patient.id,
          dentistId,
          treatment: t,
          value,
          created,
          status: 'open',
          instalmentsOffered: inst,
          _acc: rng.chance(p),
        });
      }
    }
    // calibrate the value-weighted acceptance per dentist to the month's level (keeps the stories stable)
    for (const dentistId of ['A', 'B', 'C']) {
      const group = monthPlans.filter((p) => p.dentistId === dentistId);
      const proposed = group.reduce((s, p) => s + p.value, 0);
      if (!proposed) continue;
      const goal = accBase + (dentistOffset[dentistId] ?? 0) + (isOct26 || isSep26 ? 0 : rng.range(-0.03, 0.03));
      for (let iter = 0; iter < 30; iter++) {
        const acc = group.reduce((s, p) => s + (p._acc ? p.value : 0), 0);
        const diff = acc / proposed - goal;
        if (Math.abs(diff) <= 0.02) break;
        const wantAccepted = diff > 0; // true: flip an accepted plan to not accepted
        let best: (typeof monthPlans)[number] | null = null;
        let bestErr = Math.abs(diff);
        for (const p of group) {
          if (p._acc !== wantAccepted) continue;
          // keep the instalment pattern: prefer flips that agree with it
          const against = wantAccepted ? p.instalmentsOffered === 'yes' : p.instalmentsOffered === 'no';
          const err = Math.abs(diff + ((wantAccepted ? -1 : 1) * p.value) / proposed) + (against ? 0.015 : 0);
          if (err < bestErr) {
            bestErr = err;
            best = p;
          }
        }
        if (!best) break;
        best._acc = !best._acc;
      }
    }
    for (const mp of monthPlans) {
      const { _acc, ...plan } = mp;
      if (_acc) {
        const accepted = addDays(plan.created, rng.int(0, 18));
        if (accepted <= dataEnd) {
          plan.status = 'accepted';
          plan.acceptedDate = accepted;
          (acceptedPlanQueue[plan.treatment] ??= []).push({ patientId: plan.patientId, from: addDays(accepted, 5) });
        } else {
          plan.status = 'accepted';
          plan.acceptedDate = dataEnd;
        }
      } else {
        const fate = rng.weighted([['declined', 52], ['expired', 16], ['open', 32]] as const);
        if (fate === 'declined') {
          const closed = addDays(plan.created, rng.int(10, 130));
          if (closed <= dataEnd) {
            plan.status = 'declined';
            plan.closedDate = closed;
            plan.declineReason = rng.chance(0.22)
              ? rng.weighted([['cost', 5], ['wants_to_think', 3], ['second_opinion', 2], ['other', 1]] as const)
              : 'not_recorded';
          }
        } else if (fate === 'expired') {
          const closed = addDays(plan.created, 183);
          if (closed <= dataEnd) {
            plan.status = 'expired';
            plan.closedDate = closed;
          }
        }
      }
      plans.push(plan);
    }
  });

  appointments.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  requests.sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1));

  const sources = Object.fromEntries(SOURCE_KEYS.map((k) => [k, true])) as Dataset['sources'];
  return {
    mode: 'demo',
    firstMonth: DEMO_FIRST_MONTH,
    lastMonth: DEMO_LAST_MONTH,
    staff,
    patients,
    appointments,
    labWork,
    plans,
    recalls,
    capacity,
    requests,
    igPosts,
    igMonthly,
    adSpend,
    reviews,
    events,
    sources,
  };
}

let cached: Dataset | null = null;
export function getDemoData(): Dataset {
  if (!cached) cached = generateDemo();
  return cached;
}
