// Rule-based answers for when the AI is unavailable (no API key, error, rate limit).
// Keyword rules pick a topic; the text is an i18n template filled with numbers from the
// same tools the AI uses. Answers are stored by key and re-rendered per language and month.
import type { Dataset } from '../data/types';
import { makeNames, translator, type TFn } from '../i18n';
import { fmtFor, type Fmt } from '../i18n/format';
import { buildMoneyCards } from '../insights/story';
import { runTool } from '../metrics/registry';
import type { Lang } from '../state/store';
import type { ToolName } from './toolDefs';
import { toolContext } from './toolLoop';
import { collectNumbers } from './verifyAnswer';

export const FALLBACK_KEYS = [
  'profit',
  'not_in_data',
  'cancel_reasons',
  'decline_reasons',
  'instalments',
  'google_ads',
  'instagram',
  'acceptance_period',
  'dentist_acceptance',
  'rebooking',
  'weekday',
  'best_month',
  'waiting',
  'request_speed',
  'overdue',
  'missed',
  'sources',
  'new_patients',
  'lab',
  'open_plans',
  'focus',
  'revenue_why',
  'unknown',
] as const;
export type FallbackKey = (typeof FALLBACK_KEYS)[number];

// Order matters: the first matching rule wins (e.g. "profit" before "revenue").
const RULES: [FallbackKey, RegExp][] = [
  ['profit', /gewinn|profit|marge|margin|deckungsbeitrag|verdien|rentab|kosten pro implant|earn/i],
  ['not_in_data', /zufrieden|satisf|wettbewerb|konkurren|competitor|andere praxen|other practices/i],
  ['cancel_reasons', /(warum|wieso|weshalb|grund|gründe|why|reason).*(sag\w* .*ab|absag|abgesagt|ausf[aä]ll|f[aä]ll\w* .* aus|nicht ersch|cancel|no.?show|miss)/i],
  ['decline_reasons', /(warum|wieso|weshalb|grund|gründe|why|reason).*(lehn\w*|abgelehnt|ablehn|declin|reject|nicht an(ge)?n)/i],
  ['instalments', /raten|instal+ment|finanzier|financ/i],
  ['google_ads', /google|ads\b|anzeigen|werbung|adwords|advertis/i],
  ['instagram', /instagram|insta\b|beitr[aä]g|posts?\b|reichweite|reels?\b|social/i],
  ['acceptance_period', /(annahme|acceptance|angenommen|accepted).*(halbjahr|half|quartal|quarter|jahr\b|year)|(halbjahr|half of|quartal|quarter).*(annahme|acceptance)/i],
  ['dentist_acceptance', /(welche[rs]?|which|wer|who).*(zahnarzt|zahnärztin|behandler|dentist).*(annahme|acceptance|pl[aä]n)|(annahme|acceptance).*(zahnarzt|behandler|dentist)/i],
  ['rebooking', /n[aä]chste[rn]? termin|folgetermin|next appointment|rebook|wiedereinbestell|mit termin nach hause/i],
  ['weekday', /wochentag|weekday|welcher tag|which day|freie zeit|free time|ruhig|quiet|leerlauf|auslastung|utili[sz]ation|freie termine|free slots|platz|genutzt|nutzen wir|behandlungszeit|treatment time|time used/i],
  ['best_month', /beste[rn]? monat|best month|st[aä]rkste[rn]? monat|strongest month|schw[aä]chste[rn]? monat|worst month|weakest month|h[oö]chste[rn]? umsatz|highest revenue/i],
  ['waiting', /(wie viele|how many).*(anfragen|requests).*(gewartet|warte|waited|wait|l[aä]nger|more than|over)/i],
  ['request_speed', /anfrage|request|antwort|reply|respon|beantwort|answer.*(fast|quick)|schnell|formular|\bform\b/i],
  ['overdue', /überf[aä]llig|overdue|recall|kontrolle|check.?up|prophylaxe|zahnreinigung|cleaning|wieder ?kommen|come back/i],
  ['missed', /ausf[aä]ll|ausgefallen|f[aä]ll\w* .* aus|absag|abgesagt|nicht erschienen|no.?show|cancel|missed/i],
  ['sources', /woher|where.*(come|from)|quelle|source|kanal|channel|bezirk|district|wohnen|live\b|empfehl|referral/i],
  ['new_patients', /neupatient|neue patienten|new patient/i],
  ['lab', /labor|\blab\b|kostentr[aä]ger|payer|gkv|pkv|privat|selbstzahler|self.?pay|insur|versicher/i],
  ['open_plans', /plan|pl[aä]ne|hkp|kostenvoranschlag|cost estimate|annahme|acceptance|gebucht|booked|offen|open/i],
  ['focus', /konzentrier|fokus|focus|priorit|wichtigste|most important|was tun|what should|worauf|n[aä]chste schritte|next steps|liegen|on the table|potenzial|potential/i],
  ['revenue_why', /umsatz|revenue|einnahmen|turnover|sales|gesunken|gefallen|gestiegen|fell|drop|rose|verändert|changed|implant/i],
];

export function matchTopic(question: string): FallbackKey {
  const q = question.toLowerCase();
  for (const [key, re] of RULES) if (re.test(q)) return key;
  return 'unknown';
}

export interface FallbackAnswer {
  key: FallbackKey;
  text: string;
  metricCalls: ToolName[];
  /** numbers the answer may contain (tool results plus other code-calculated values) */
  toolNumbers: number[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/** A period named in the question, for the acceptance topic ("first half of the year" …). */
export function periodFromQuestion(question: string, month: string, data: Dataset): { from: string; to: string } {
  const q = question.toLowerCase();
  const year = month.slice(0, 4);
  const clamp = (from: string, to: string) => ({ from: from < data.firstMonth ? data.firstMonth : from, to: to > data.lastMonth ? data.lastMonth : to });
  if (/zweite[ns]? halbjahr|second half/.test(q)) return clamp(`${year}-07`, `${year}-12`);
  if (/halbjahr|first half|half of/.test(q)) return clamp(`${year}-01`, `${year}-06`);
  const quarter = q.match(/(?:q|quartal |quarter )([1-4])|([1-4])\. quartal/);
  if (quarter) {
    const n = +(quarter[1] ?? quarter[2]);
    return clamp(`${year}-${String(n * 3 - 2).padStart(2, '0')}`, `${year}-${String(n * 3).padStart(2, '0')}`);
  }
  if (/letzte[sn]? jahr|last year|vorjahr/.test(q)) return clamp(`${+year - 1}-01`, `${+year - 1}-12`);
  return clamp(`${year}-01`, month);
}

export function renderFallback(key: FallbackKey, data: Dataset, month: string, lang: Lang, question = ''): FallbackAnswer {
  const t: TFn = translator(lang);
  const f: Fmt = fmtFor(lang);
  const names = makeNames(t, data.staff, data.mode === 'demo');
  const ctx = toolContext(data, month);
  const metricCalls: ToolName[] = [];
  const toolNumbers: number[] = [];
  const run = (name: ToolName, input: Record<string, unknown> = {}): Any => {
    const out = runTool(data, name, input, ctx);
    metricCalls.push(name);
    collectNumbers(out, toolNumbers);
    return out;
  };
  const done = (text: string): FallbackAnswer => ({ key, text: text.replace(/\n{2,}/g, '\n').trim(), metricCalls, toolNumbers });
  const missing = (out: Any): string | null => {
    const m = out?.missing ?? out?.error;
    if (!m) return null;
    const known = ['pvs', 'webform', 'inbox', 'instagram', 'google_ads', 'gbp', 'provenexpert', 'phone', 'lab', 'instalments'];
    return t('fb.missing', { source: known.includes(m) ? names.source(m) : names.source('pvs') });
  };
  const M = f.monthName(month);
  const eur = (v: Any) => (typeof v === 'number' ? f.eur(v) : t('fb.na'));
  const eurS = (v: Any) => (typeof v === 'number' ? f.eurSigned(v) : t('fb.na'));
  const pct = (v: Any) => (typeof v === 'number' ? f.pct(v) : t('fb.na'));
  const num = (v: Any) => (typeof v === 'number' ? f.num(v) : t('fb.na'));
  // English staff labels from the tools -> labels in the answer language
  const staffLabel = (english: string): string => {
    const s = data.staff.find((x) => ctx.staffName(x.id) === english);
    return s ? names.staff(s.id) : english;
  };
  const dayName = (english: string): string => f.weekday(['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].indexOf(english));

  switch (key) {
    case 'profit': {
      const s = run('get_month_summary');
      return done(t('fb.profit', { revenue: eur(s.this_month?.revenue_eur), month: M }));
    }
    case 'not_in_data':
      return done(t('fb.not_in_data'));
    case 'unknown':
      return done(t('fb.unknown'));

    case 'revenue_why': {
      const b = run('get_revenue_breakdown');
      const miss = missing(b);
      if (miss) return done(miss);
      if (typeof b.bridge === 'string') return done(t('fb.revenue_first', { month: M, revenue: eur(b.revenue_eur) }));
      const rows: Any[] = b.treatments ?? [];
      const dir = Math.sign(b.change_eur);
      const same = rows.filter((r) => Math.sign(r.change_eur) === dir);
      const top = (same.length ? same : rows).slice().sort((x, y) => Math.abs(y.change_eur) - Math.abs(x.change_eur))[0];
      const lines = [
        t('fb.revenue_why', {
          month: M,
          revenue: eur(b.revenue_eur),
          change: eurS(b.change_eur),
          previous: eur(b.previous_revenue_eur),
          count: eurS(b.bridge.number_of_appointments_eur),
          mix: eurS(b.bridge.type_of_treatment_eur),
          price: eurS(b.bridge.prices_within_treatments_eur),
          treatment: top ? names.treatment(top.area) : t('fb.na'),
          tChange: eurS(top?.change_eur),
          sessions: num(top?.sessions),
          prevSessions: num(top?.previous_sessions),
        }),
      ];
      const s = run('get_month_summary');
      const mainStaff = top?.main_staff?.[0]?.staff;
      const ev = (b.events as Any[]).find((e) => e.staff && e.staff === mainStaff) ?? (b.events as Any[]).find((e) => e.staff);
      if (ev) {
        const original = data.events.find((e) => e.from === ev.from && e.to === ev.to && e.type === ev.type);
        lines.push(t('fb.eventLine', { event: original ? names.event(original) : ev.description }));
      }
      const acc = s.this_month?.plan_acceptance_pct;
      const accPrev = s.previous_month?.plan_acceptance_pct;
      if (typeof acc === 'number' && typeof accPrev === 'number') lines.push(t('fb.acceptanceLine', { current: pct(acc), previous: pct(accPrev) }));
      lines.push(t('fb.revenue_check'));
      return done(lines.join('\n'));
    }

    case 'open_plans': {
      const p = run('get_treatment_plans');
      const miss = missing(p);
      if (miss) return done(miss);
      if (typeof p.acceptance_pct === 'number') toolNumbers.push(p.acceptance_pct + 1);
      return done(
        t('fb.open_plans', {
          open: eur(p.open_eur),
          under3: eur(p.open_under_3_months_eur),
          over3: eur(p.open_older_than_3_months_eur),
          month: M,
          acceptance: pct(p.acceptance_pct),
          previous: pct(p.previous_acceptance_pct),
          next: typeof p.acceptance_pct === 'number' ? pct(p.acceptance_pct + 1) : t('fb.na'),
          onePercent: eur(p.value_if_acceptance_were_1_percent_higher_eur),
        }),
      );
    }

    case 'request_speed':
    case 'waiting': {
      const m = run('get_marketing');
      const miss = missing(m) ?? missing(m.online_requests) ?? missing(m.answered_within_2h_pct);
      if (miss) return done(miss);
      const vars = {
        month: M,
        fast: pct(m.answered_within_2h_pct),
        previous: pct(m.previous_answered_within_2h_pct),
        requests: num(m.online_requests),
        waiting: num(m.requests_waiting_over_2h),
        fastConv: pct(m.conversion_if_answered_within_2h_pct),
        slowConv: pct(m.conversion_if_answered_later_pct),
        missed: num(m.estimated_missed_new_patients),
        missedValue: eur(m.estimated_value_of_missed_patients_6_months_eur),
        weekend: pct(m.slow_replies_friday_afternoon_or_weekend_pct),
      };
      return done(t(key === 'waiting' ? 'fb.waiting' : 'fb.request_speed', vars));
    }

    case 'overdue': {
      const p = run('get_patients_recall');
      const miss = missing(p);
      if (miss) return done(miss);
      const lines = [
        t('fb.overdue', {
          count: num(p.overdue_for_checkup),
          value: eur(p.overdue_value_eur),
          recall: eur(p.recall_visit_value_eur),
          perYear: eur(p.typical_patient_value_per_year_eur),
          nextBooked: pct(p.next_appointment_booked_pct),
        }),
      ];
      const top = p.overdue_last_seen_by?.[0];
      if (top && p.overdue_for_checkup >= 10) lines.push(t('fb.overdueStaff', { n: num(top.patients), staff: staffLabel(top.member) }));
      return done(lines.join('\n'));
    }

    case 'missed': {
      const c = run('get_capacity_team');
      const miss = missing(c);
      if (miss) return done(miss);
      const total = (c.cancelled ?? 0) + (c.no_shows ?? 0);
      toolNumbers.push(total);
      return done(
        t('fb.missed', {
          month: M,
          total: num(total),
          value: eur(c.missed_value_eur),
          cancelled: num(c.cancelled),
          noShow: num(c.no_shows),
          perMissed: eur(c.value_per_missed_appointment_eur),
          previous: num(c.previous_missed),
          mostly: (c.missed_mostly as Any[]).map((x) => names.treatment(x.area)).join(', ') || t('fb.na'),
        }),
      );
    }

    case 'instalments': {
      const p = run('get_treatment_plans');
      const miss = missing(p) ?? missing(p.instalments);
      if (miss) return done(miss);
      const i = p.instalments;
      return done(
        t('fb.instalments', {
          with: pct(i.acceptance_with_offer_pct),
          without: pct(i.acceptance_without_offer_pct),
          share: pct(i.plans_with_offer_pct),
          nWith: num(i.plans_with_offer),
          nWithout: num(i.plans_without_offer),
        }),
      );
    }

    case 'sources': {
      const m = run('get_marketing');
      const miss = missing(m);
      if (miss) return done(miss);
      const channels = (m.channels as Any[])
        .filter((c) => c.new_patients > 0)
        .sort((a, b) => b.new_patients - a.new_patients)
        .slice(0, 4)
        .map((c) => t('fb.channelLine', { channel: names.channel(c.channel), patients: num(c.new_patients), requests: num(c.requests) }))
        .join('\n');
      const d = m.districts as Any[];
      return done(
        t('fb.sources', {
          month: M,
          total: num(m.new_patients),
          channels,
          noSource: num(m.no_recorded_source),
          district1: d[0] ? names.district(d[0].district) : t('fb.na'),
          district2: d[1] ? names.district(d[1].district) : t('fb.na'),
        }),
      );
    }

    case 'new_patients': {
      const p = run('get_patients_recall');
      const miss = missing(p);
      if (miss) return done(miss);
      const s = run('get_month_summary');
      return done(
        t('fb.new_patients', {
          month: M,
          count: num(p.new_patients),
          previous: num(s.previous_month?.new_patients),
          seen: num(p.patients_seen),
          value: eur(p.new_patient_value_first_6_months_eur),
        }),
      );
    }

    case 'instagram': {
      const ig = run('get_instagram');
      const miss = missing(ig);
      if (miss) return done(miss);
      const types = ig.by_post_type as Any[];
      const best = types[0];
      const reach = types.slice().sort((a, b) => (b.avg_reach_per_post ?? 0) - (a.avg_reach_per_post ?? 0))[0];
      return done(
        t('fb.instagram', {
          month: M,
          patients: num(ig.new_patients),
          requests: num(ig.requests),
          posts: num(ig.posts),
          reach: num(ig.reach),
          clicks: num(ig.link_in_bio_clicks),
          messages: num(ig.messages),
          best: best ? names.postType(best.type) : t('fb.na'),
          bestPatients: num(best?.new_patients),
          bestRequests: num(best?.requests),
          reachType: reach ? names.postType(reach.type) : t('fb.na'),
          reachAvg: num(reach?.avg_reach_per_post),
        }),
      );
    }

    case 'google_ads': {
      const m = run('get_marketing');
      const miss = missing(m) ?? missing(m.google_ads);
      if (miss) return done(miss);
      const g = m.google_ads;
      return done(
        t('fb.google_ads', {
          month: M,
          spend: eur(g.spend_eur),
          patients: num(g.new_patients),
          cost: eur(g.cost_per_new_patient_eur),
          ret: typeof g.return_per_eur_6_months === 'number' ? f.eur(g.return_per_eur_6_months, 2) : t('fb.na'),
        }),
      );
    }

    case 'focus': {
      // the same tools the AI would consult, plus the cautious "money on the table" estimate
      for (const name of ['get_month_summary', 'get_treatment_plans', 'get_marketing', 'get_patients_recall', 'get_capacity_team'] as ToolName[]) run(name);
      const money = buildMoneyCards(data, month, { t, f, names });
      const items = money.cards
        .filter((c) => c.value !== null)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        .map((c) => {
          const v = Math.round((c.value ?? 0) / 100) * 100;
          toolNumbers.push(v);
          return t('fb.focusLine', { title: c.title, value: f.eur(v) });
        });
      if (!items.length) return done(t('fb.missing', { source: names.source('pvs') }));
      toolNumbers.push(money.total);
      return done(t('fb.focus', { month: M, items: items.join('\n'), total: f.eur(money.total) }));
    }

    case 'cancel_reasons': {
      const p = run('get_patients_recall');
      const miss = missing(p);
      if (miss) return done(miss);
      const r = p.cancellation_reasons;
      if (typeof r === 'string') return done(t('fb.cancel_reasons', { notRecorded: t('fb.na'), total: t('fb.na'), reasons: '' }));
      const recorded = Object.entries(r).filter(([k, v]) => k !== 'not_recorded' && typeof v === 'number') as [string, number][];
      const total = recorded.reduce((s, [, n]) => s + n, 0) + r.not_recorded;
      toolNumbers.push(total);
      return done(
        t('fb.cancel_reasons', {
          notRecorded: num(r.not_recorded),
          total: num(total),
          reasons: recorded.map(([k, n]) => t('fb.reasonLine', { reason: t(`fb.reason.${k}`), n: num(n) })).join('\n'),
        }),
      );
    }

    case 'decline_reasons': {
      const p = run('get_treatment_plans');
      const miss = missing(p);
      if (miss) return done(miss);
      const r = p.decline_reasons;
      if (typeof r === 'string') return done(t('fb.decline_reasons', { notRecorded: t('fb.na'), total: t('fb.na'), reasons: '' }));
      const recorded = Object.entries(r).filter(([k, v]) => k !== 'not_recorded' && typeof v === 'number') as [string, number][];
      const total = recorded.reduce((s, [, n]) => s + n, 0) + r.not_recorded;
      toolNumbers.push(total);
      return done(
        t('fb.decline_reasons', {
          notRecorded: num(r.not_recorded),
          total: num(total),
          reasons: recorded.map(([k, n]) => t('fb.reasonLine', { reason: t(`fb.reason.${k}`), n: num(n) })).join('\n'),
        }),
      );
    }

    case 'weekday': {
      const c = run('get_capacity_team');
      const miss = missing(c);
      if (miss) return done(miss);
      const days = (c.weekdays as Any[]).slice().sort((a, b) => b.free_slots - a.free_slots);
      if (days.length < 2) return done(t('fb.missing', { source: names.source('pvs') }));
      return done(
        t('fb.weekday', {
          month: M,
          day1: dayName(days[0].day),
          free1: num(days[0].free_slots),
          used1: pct(days[0].utilisation_pct),
          day2: dayName(days[1].day),
          free2: num(days[1].free_slots),
          used2: pct(days[1].utilisation_pct),
          used: pct(c.time_used_pct),
          never: num(c.never_booked),
        }),
      );
    }

    case 'best_month': {
      const year = month.slice(0, 4);
      const thisYear = /dieses jahr|this year|in diesem jahr/i.test(question);
      const s = run('get_monthly_series', thisYear ? { metric: 'revenue_eur', from: `${year}-01`, to: month } : { metric: 'revenue_eur' });
      const miss = missing(s);
      if (miss || !s.highest) return done(miss ?? t('fb.missing', { source: names.source('pvs') }));
      return done(
        t('fb.best_month', {
          best: f.month(s.highest.month),
          bestValue: eur(s.highest.value),
          worst: f.month(s.lowest.month),
          worstValue: eur(s.lowest.value),
          average: eur(s.average),
        }),
      );
    }

    case 'dentist_acceptance': {
      const p = run('get_treatment_plans');
      const miss = missing(p);
      if (miss) return done(miss);
      const rows = (p.by_dentist as Any[]).filter((d) => typeof d.acceptance_pct === 'number').sort((a, b) => a.acceptance_pct - b.acceptance_pct);
      if (!rows.length) return done(t('fb.missing', { source: names.source('pvs') }));
      return done(
        t('fb.dentist_acceptance', {
          month: M,
          lowest: staffLabel(rows[0].dentist),
          lowestPct: pct(rows[0].acceptance_pct),
          rows: rows.map((d) => t('fb.dentistLine', { dentist: staffLabel(d.dentist), pct: pct(d.acceptance_pct), previous: pct(d.previous_acceptance_pct), open: eur(d.open_eur) })).join('\n'),
        }),
      );
    }

    case 'acceptance_period': {
      const period = periodFromQuestion(question, month, data);
      const p = run('get_treatment_plans', period);
      const miss = missing(p);
      if (miss) return done(miss);
      return done(
        t('fb.acceptance_period', {
          from: f.month(period.from),
          to: f.month(period.to),
          acceptance: pct(p.acceptance_pct),
          proposed: eur(p.proposed_eur),
          booked: eur(p.booked_eur),
          plans: num(p.plans),
        }),
      );
    }

    case 'rebooking': {
      const c = run('get_capacity_team');
      const miss = missing(c);
      if (miss) return done(miss);
      const rows = (c.team as Any[]).filter((m) => typeof m.next_appointment_booked_pct === 'number').sort((a, b) => a.next_appointment_booked_pct - b.next_appointment_booked_pct);
      return done(
        t('fb.rebooking', {
          team: pct(c.team_average_next_appointment_booked_pct),
          rows: rows.map((m) => t('fb.memberLine', { member: staffLabel(m.member), pct: pct(m.next_appointment_booked_pct), appointments: num(m.appointments) })).join('\n'),
        }),
      );
    }

    case 'lab': {
      const s = run('get_month_summary');
      const miss = missing(s);
      if (miss) return done(miss);
      const m = s.this_month;
      return done(
        t('fb.lab', {
          month: M,
          lab: typeof m.in_house_lab_eur === 'number' ? eur(m.in_house_lab_eur) : t('fb.na'),
          revenue: eur(m.revenue_eur),
          gkv: eur(m.payer_gkv_eur),
          pkv: eur(m.payer_pkv_eur),
          self: eur(m.payer_selfpay_eur),
        }),
      );
    }
  }
}
