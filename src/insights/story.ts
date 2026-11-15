// The month's story: headline, 2–3 sentences and 3 key numbers.
// Used by the Overview page and the weekly summary. Every number comes from the metric functions.
import { addMonths } from '../data/dates';
import type { Dataset } from '../data/types';
import type { Names, TFn } from '../i18n';
import type { Fmt } from '../i18n/format';
import { treatmentChanges } from '../metrics/bridge';
import { monthFilter } from '../metrics/core';
import { ASSUMPTIONS, eventsIn, moneyOnTable, type OpportunityItem } from '../metrics/opportunity';
import { openPlans, planSummary } from '../metrics/plans';
import { onlineRequests, responseSpeed } from '../metrics/requests';
import { revenue, staffShareOfTreatment } from '../metrics/revenue';
import { monthlySeries } from '../metrics/series';
import { newPatientValue6m } from '../metrics/marketing';
import type { PageKey, Selection } from '../state/store';

export interface KeyNumber {
  label: string;
  value: string;
  page: PageKey;
  selection?: Selection;
  tone: 'loss' | 'gain' | 'plain';
}

export interface Story {
  headline: string;
  sentences: string[];
  keys: KeyNumber[];
}

interface Ctx {
  t: TFn;
  f: Fmt;
  names: Names;
}

export function buildStory(data: Dataset, month: string, { t, f, names }: Ctx): Story {
  const cur = monthFilter(month);
  const prevMonth = addMonths(month, -1);
  const prev = monthFilter(prevMonth);
  const hasPrev = prevMonth >= data.firstMonth;
  const rev = revenue(data, cur).value;
  const revPrev = hasPrev ? revenue(data, prev).value : null;
  const sentences: string[] = [];
  const keys: KeyNumber[] = [];
  let headline: string;

  if (rev === null) {
    return { headline: t('common.notEnough'), sentences: [t('common.connectHint', { source: names.source('pvs') })], keys: [] };
  }

  if (revPrev === null) {
    headline = t('story.headline.first', { month: f.monthName(month), revenue: f.eur(rev) });
  } else {
    const diff = rev - revPrev;
    const rows = treatmentChanges(data, cur, prev).value ?? [];
    // the treatment that moved most in the same direction as the total
    const sameDir = rows.filter((r) => Math.sign(r.change) === Math.sign(diff));
    const top = (sameDir.length ? sameDir : rows).slice().sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
    if (Math.abs(diff) < revPrev * 0.01 || !top) {
      headline = t('story.headline.flat', { month: f.monthName(month) });
    } else {
      headline = t(diff < 0 ? 'story.headline.down' : 'story.headline.up', {
        month: f.monthName(month),
        amount: f.eur(Math.abs(diff)),
        treatment: names.treatment(top.treatment),
      });
    }
    if (top) {
      sentences.push(t('story.sessions', { treatment: names.treatment(top.treatment), sessions: f.num(top.sessions), previous: f.num(top.previousSessions) }));
      keys.push({
        label: t('story.key.change', { treatment: names.treatment(top.treatment) }),
        value: f.eurSigned(top.change),
        page: 'revenue',
        selection: { kind: 'treatment', id: top.treatment },
        tone: top.change < 0 ? 'loss' : 'gain',
      });
      // a recorded event for the people who mainly deliver this treatment
      const main = staffShareOfTreatment(data, { from: `${data.firstMonth}-01`, to: cur.to }, top.treatment)[0];
      const ev = main ? eventsIn(data, cur, { staff: main.staffId })[0] : undefined;
      if (ev) sentences.push(t('story.event', { event: names.event(ev) }));
    }
    const acc = planSummary(data, cur).value?.acceptancePct ?? null;
    const accPrev = planSummary(data, prev).value?.acceptancePct ?? null;
    if (acc !== null && accPrev !== null && Math.abs(acc - accPrev) >= 3) {
      sentences.push(t(acc < accPrev ? 'story.acceptanceDown' : 'story.acceptanceUp', { previous: f.pct(accPrev), current: f.pct(acc) }));
    }
  }

  const open = openPlans(data, cur).value;
  if (open) keys.push({ label: t('story.key.open'), value: f.eur(open.total), page: 'plans', tone: 'plain' });

  const speed = responseSpeed(data, cur).value;
  const reqs = onlineRequests(data, cur).value;
  if (speed && reqs !== null) {
    const earlier = monthlySeries(data, 'online_requests', {}, data.firstMonth, month).slice(0, -1);
    const record = earlier.length >= 3 && earlier.every((p) => (p.value ?? 0) < reqs);
    if (sentences.length < 3 || record) {
      const s = t(record ? 'story.requestsRecord' : 'story.requests', { requests: f.num(reqs), share: f.pct(speed.fastPct) });
      if (sentences.length >= 3) sentences[2] = s;
      else sentences.push(s);
    }
    keys.push({ label: t('story.key.fast'), value: f.pct(speed.fastPct), page: 'marketing', tone: 'plain' });
  }
  if (revPrev !== null && sentences.length < 2) {
    sentences.unshift(t('story.revenue', { revenue: f.eur(rev), previous: f.eur(revPrev), prevMonth: f.monthName(prevMonth) }));
  }
  return { headline, sentences: sentences.slice(0, 3), keys: keys.slice(0, 3) };
}

export interface MoneyCard {
  key: OpportunityItem['key'];
  title: string;
  text: string;
  value: number | null;
  page: PageKey;
}

const MONEY_PAGE: Record<OpportunityItem['key'], PageKey> = { plans: 'plans', requests: 'marketing', overdue: 'patients', missed: 'chairs' };

/** The four "money left on the table" cards plus the cautious total. */
export function buildMoneyCards(data: Dataset, month: string, { t, f }: Ctx): { cards: MoneyCard[]; total: number } {
  const opp = moneyOnTable(data, monthFilter(month));
  const npv = newPatientValue6m(data).value;
  const cards = opp.items.map((item): MoneyCard => {
    let text: string;
    if (item.cautious === null) text = t('common.notEnough');
    else if (item.key === 'plans') text = t('money.plans.text', { full: f.eur(item.full), share: f.pct(ASSUMPTIONS.planFollowUpRate * 100), months: f.num(ASSUMPTIONS.planSpreadMonths) });
    else if (item.key === 'requests') text = t('money.requests.text', { count: f.num(Math.round(item.count ?? 0)), value: f.eur(npv) });
    else if (item.key === 'overdue') text = t('money.overdue.text', { count: f.num(item.count), share: f.pct(ASSUMPTIONS.recallReturnRate * 100), months: f.num(ASSUMPTIONS.recallSpreadMonths) });
    else text = t('money.missed.text', { count: f.num(item.count), full: f.eur(item.full), share: f.pct(ASSUMPTIONS.missedRecoverRate * 100) });
    return { key: item.key, title: t(`money.${item.key}.title`), text, value: item.cautious, page: MONEY_PAGE[item.key] };
  });
  return { cards, total: opp.total };
}
