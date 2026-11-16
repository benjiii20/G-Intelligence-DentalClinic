import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Answer, Card, Delta, DivergingRow, InfoTip, KeyVal, Metric, NotEnough, Note, PageLink, Panel, SourcesLine, StackedBar, Tile, TileGrid, WithPanel, cx } from '../components/ui';
import { addDays, addMonths } from '../data/dates';
import type { Treatment } from '../data/types';
import { useT } from '../i18n';
import { buildMoneyCards, buildStory } from '../insights/story';
import { revenueBridge, revenueFactors, treatmentChanges } from '../metrics/bridge';
import { absenceDays, eventsIn, topChanges } from '../metrics/opportunity';
import { acceptanceByDentist, declineReasons, followUpList, instalmentComparison, isOpenAt, openPlans, planSummary } from '../metrics/plans';
import { labRevenue, payerMix, revenue, staffShareOfTreatment } from '../metrics/revenue';
import { monthlySeries, type SeriesPoint } from '../metrics/series';
import { useStore } from '../state/store';
import { useMonth, type MonthCtx } from './shared';

// ---------- shared pieces ----------
export function TrendChart({ points, kind, selected }: { points: SeriesPoint[]; kind: 'eur' | 'num' | 'pct'; selected?: string }) {
  const { f } = useT();
  const fmt = (v: number) => (kind === 'eur' ? f.eur(v) : kind === 'pct' ? f.pct(v) : f.num(v));
  const rows = points.map((p) => ({ month: f.monthShort(p.month), key: p.month, value: p.value }));
  return (
    <div className="h-40 w-full" role="img" aria-label={points.map((p) => `${f.monthShort(p.month)}: ${p.value == null ? f.dash : fmt(p.value)}`).join(', ')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#E3E3DE" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#5A5E66' }} interval={2} tickLine={false} axisLine={{ stroke: '#E3E3DE' }} />
          <YAxis width={kind === 'eur' ? 62 : 40} tick={{ fontSize: 10, fill: '#5A5E66' }} tickFormatter={(v: number) => fmt(v)} tickLine={false} axisLine={false} domain={[0, 'auto']} />
          <Tooltip formatter={(v) => fmt(Number(v))} labelStyle={{ color: '#1B1D22' }} contentStyle={{ borderRadius: 8, borderColor: '#E3E3DE', fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#0E6B6B"
            strokeWidth={2}
            isAnimationActive={false}
            connectNulls
            dot={(props: { cx?: number; cy?: number; payload?: { key: string }; index?: number }) => (
              <circle key={props.index} cx={props.cx} cy={props.cy} r={props.payload?.key === selected ? 5 : 2.5} fill={props.payload?.key === selected ? '#B4501A' : '#0E6B6B'} stroke="#fff" strokeWidth={1} />
            )}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BridgeCard({ ctx, link }: { ctx: MonthCtx; link?: boolean }) {
  const { t, f } = useT();
  const { data, cur, prev, hasPrev } = ctx;
  if (!hasPrev) {
    return (
      <Card title={t('bridge.title')} help={t('bridge.help')}>
        <p className="text-sm text-muted">{t('bridge.noPrev')}</p>
      </Card>
    );
  }
  const bridge = revenueBridge(data, cur, prev);
  const factors = revenueFactors(data, cur, prev);
  return (
    <Card title={t('bridge.title')} help={t('bridge.help')} action={link ? <PageLink page="revenue">{t('nav.revenue.name')}</PageLink> : undefined}>
      <Metric result={bridge}>
        {(b) => {
          const max = Math.max(Math.abs(b.count), Math.abs(b.mix), Math.abs(b.price), 1);
          return (
            <>
              <div className="divide-y divide-line/70">
                <DivergingRow label={t('bridge.count.label')} sub={factors.value ? t('bridge.count.sub', { current: f.num(countOf(factors.value)), previous: f.num(prevCountOf(factors.value)) }) : undefined} value={b.count} max={max} text={f.eurSigned(b.count)} />
                <DivergingRow label={t('bridge.mix.label')} sub={t('bridge.mix.sub')} value={b.mix} max={max} text={f.eurSigned(b.mix)} />
                <DivergingRow label={t('bridge.price.label')} sub={t('bridge.price.sub')} value={b.price} max={max} text={f.eurSigned(b.price)} />
              </div>
              <p className="mt-3 text-sm font-medium text-ink">{t('bridge.sum', { change: f.eurSigned(b.change), previous: f.eur(b.previous), current: f.eur(b.current) })}</p>
              <SourcesLine sources={bridge.sources} />
            </>
          );
        }}
      </Metric>
    </Card>
  );
}
const countOf = (x: { patients: { current: number }; visitsPerPatient: { current: number } }) => Math.round(x.patients.current * x.visitsPerPatient.current);
const prevCountOf = (x: { patients: { previous: number }; visitsPerPatient: { previous: number } }) => Math.round(x.patients.previous * x.visitsPerPatient.previous);

function FactorsCard({ ctx }: { ctx: MonthCtx }) {
  const { t, f } = useT();
  const { data, cur, prev, hasPrev } = ctx;
  if (!hasPrev) return null;
  const factors = revenueFactors(data, cur, prev);
  return (
    <Card title={t('factors.title')} help={t('factors.help')}>
      <Metric result={factors}>
        {(x) => {
          const max = Math.max(Math.abs(x.patients.effect), Math.abs(x.visitsPerPatient.effect), Math.abs(x.revenuePerVisit.effect), 1);
          return (
            <div className="divide-y divide-line/70">
              <DivergingRow label={t('factors.patients')} sub={t('factors.fromTo', { previous: f.num(x.patients.previous), current: f.num(x.patients.current) })} value={x.patients.effect} max={max} text={f.eurSigned(x.patients.effect)} />
              <DivergingRow label={t('factors.visits')} sub={t('factors.fromTo', { previous: f.num(x.visitsPerPatient.previous, 2), current: f.num(x.visitsPerPatient.current, 2) })} value={x.visitsPerPatient.effect} max={max} text={f.eurSigned(x.visitsPerPatient.effect)} />
              <DivergingRow label={t('factors.revenue')} sub={t('factors.fromTo', { previous: f.eur(x.revenuePerVisit.previous), current: f.eur(x.revenuePerVisit.current) })} value={x.revenuePerVisit.effect} max={max} text={f.eurSigned(x.revenuePerVisit.effect)} />
            </div>
          );
        }}
      </Metric>
    </Card>
  );
}

export function QuestionChips({ keys }: { keys: string[] }) {
  const { t } = useT();
  const askAbout = useStore((s) => s.askAbout);
  return (
    <div className="flex flex-wrap gap-2">
      {keys.map((k) => (
        <button key={k} type="button" onClick={() => askAbout(t(k))} className="min-h-[44px] rounded-full border border-line bg-white px-4 text-left text-sm font-medium text-ink hover:border-accent hover:text-accent">
          {t(k)}
        </button>
      ))}
    </div>
  );
}

// ---------------- Overview ----------------
export function OverviewInsights() {
  const tools = useT();
  const { t, f, names } = tools;
  const ctx = useMonth();
  const { data, month, cur, prev, hasPrev } = ctx;
  const go = useStore((s) => s.go);
  const story = useMemo(() => buildStory(data, month, tools), [data, month, tools.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = useMemo(() => buildMoneyCards(data, month, tools), [data, month, tools.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = useMemo(() => (hasPrev ? topChanges(data, cur, prev) : []), [data, cur, prev, hasPrev]);
  const maxTop = Math.max(1, ...top.map((x) => Math.abs(x.change)));
  return (
    <div className="space-y-4">
      <section className="dark-surface rounded-card bg-side p-5 text-white sm:p-6" aria-label={t('story.label', { month: f.month(month) })}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#7FD6D0]">{t('story.label', { month: f.month(month) })}</p>
        <h2 className="mt-2 max-w-4xl font-display text-xl font-semibold leading-snug sm:text-2xl">{story.headline}</h2>
        <div className="mt-3 max-w-3xl space-y-1 text-[15px] leading-relaxed text-[#D5D8DE]">
          {story.sentences.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>
        {story.keys.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {story.keys.map((k) => (
              <button key={k.label} type="button" onClick={() => go(k.page, k.selection ?? null)} className="rounded-lg border border-white/15 bg-white/5 p-4 text-left transition-colors hover:bg-white/10">
                <span className="block text-[13px] text-[#C5C9D1]">{k.label}</span>
                <span className={cx('big-num mt-1 block text-2xl font-semibold', k.tone === 'loss' ? 'text-[#FFB48A]' : k.tone === 'gain' ? 'text-[#8FE0B5]' : 'text-white')}>
                  {k.tone !== 'plain' && <span aria-hidden="true" className="mr-1 text-base">{k.tone === 'loss' ? '▼' : '▲'}</span>}
                  {k.value}
                </span>
                <span className="mt-1 block text-xs font-semibold text-[#7FD6D0]">
                  {t(`nav.${k.page}.name`)} <span aria-hidden="true">→</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <BridgeCard ctx={ctx} link />
        <FactorsCard ctx={ctx} />
      </div>

      <Card title={t('money.title')} help={t('money.help')}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {money.cards.map((c) => (
            <button key={c.key} type="button" onClick={() => go(c.page)} className="rounded-lg border border-line bg-bg p-4 text-left transition-colors hover:border-opp">
              <span className="big-num block text-2xl font-semibold text-opp">{c.value === null ? f.dash : f.eur(Math.round(c.value / 100) * 100)}</span>
              <span className="mt-0.5 block text-xs text-muted">{t('money.perMonth')}</span>
              <span className="mt-2 block text-sm font-semibold text-ink">{c.title}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-muted">{c.text}</span>
              <span className="mt-2 block text-xs font-semibold text-accent">
                {t(`nav.${c.page}.name`)} <span aria-hidden="true">→</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-base font-semibold text-ink">{t('money.total', { total: f.eur(money.total) })}</p>
      </Card>

      {hasPrev && top.length > 0 && (
        <Card title={t('top.title')}>
          <div className="divide-y divide-line/70">
            {top.map((x) => {
              const label = x.kind === 'treatment' ? names.treatment(x.key) : x.kind === 'staff' ? names.staff(x.key) : t(`top.${x.key}`);
              const onClick = x.kind === 'treatment' ? () => go('revenue', { kind: 'treatment', id: x.key }) : x.kind === 'staff' ? () => go('chairs', { kind: 'staff', id: x.key }) : () => go('patients');
              return (
                <DivergingRow
                  key={`${x.kind}-${x.key}`}
                  label={
                    <>
                      <span className="mr-2 rounded bg-bg px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{t(`top.kind.${x.kind}`)}</span>
                      {label}
                    </>
                  }
                  sub={t('top.fromTo', { previous: f.eur(x.previous), current: f.eur(x.current) })}
                  value={x.change}
                  max={maxTop}
                  text={f.eurSigned(x.change)}
                  onClick={onClick}
                />
              );
            })}
          </div>
          <Note>{t('top.note')}</Note>
        </Card>
      )}

      <Card title={t('chips.title')}>
        <QuestionChips keys={['chips.q1', 'chips.q2', 'chips.q3', 'chips.q4', 'chips.q9']} />
      </Card>
    </div>
  );
}

// ---------------- Revenue ----------------
function TreatmentPanel({ ctx, treatment }: { ctx: MonthCtx; treatment: Treatment }) {
  const { t, f, names } = useT();
  const { data, cur, prev, month, hasPrev } = ctx;
  const select = useStore((s) => s.select);
  const trend = useMemo(() => monthlySeries(data, 'revenue_eur', { treatment }, addMonths(month, -11) < data.firstMonth ? data.firstMonth : addMonths(month, -11), month), [data, month, treatment]);
  const who = staffShareOfTreatment(data, ctx.half, treatment).slice(0, 3);
  const row = treatmentChanges(data, cur, prev).value?.find((r) => r.treatment === treatment);
  const acc = planSummary(data, { ...cur, treatment }).value;
  const accPrev = hasPrev ? planSummary(data, { ...prev, treatment }).value : null;
  const notes: string[] = [];
  for (const w of who) {
    const days = absenceDays(data, cur, w.staffId);
    if (days > 0 && w.sharePct >= 20) notes.push(t('rev.detail.absence', { staff: names.staff(w.staffId), days: f.num(days), share: f.pct(w.sharePct) }));
  }
  for (const e of eventsIn(data, cur)) {
    if (e.staffId) continue;
    notes.push(t('rev.detail.event', { event: names.event(e), from: f.date(e.from), to: f.date(e.to) }));
  }
  const showAcc = acc && accPrev && acc.acceptancePct !== null && accPrev.acceptancePct !== null && acc.count >= 5 && accPrev.count >= 5;
  return (
    <Panel title={names.treatment(treatment)} onClose={() => select(null)}>
      {row && (
        <div className="mb-3">
          <KeyVal k={t('m.revenue.label')} v={<>{f.eur(row.revenue)} {hasPrev && <Delta value={row.change} text={f.eurSigned(row.change)} className="ml-1" />}</>} />
          <KeyVal k={t('rev.detail.sessions')} v={hasPrev ? t('factors.fromTo', { previous: f.num(row.previousSessions), current: f.num(row.sessions) }) : f.num(row.sessions)} />
          <KeyVal k={t('rev.detail.avg')} v={f.eur(row.avg)} />
        </div>
      )}
      <h3 className="mb-1 text-sm font-semibold">{t('rev.detail.trend')}</h3>
      <TrendChart points={trend} kind="eur" selected={month} />
      <h3 className="mb-1 mt-4 text-sm font-semibold">{t('rev.detail.who')}</h3>
      {who.map((w) => (
        <KeyVal key={w.staffId} k={names.staff(w.staffId)} v={t('rev.detail.whoRow', { share: f.pct(w.sharePct) })} />
      ))}
      <h3 className="mb-1 mt-4 text-sm font-semibold">{t('rev.detail.notes')}</h3>
      <ul className="space-y-2 text-sm leading-relaxed text-ink">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
        {showAcc && <li>{t('rev.detail.acceptance', { current: f.pct(acc.acceptancePct), previous: f.pct(accPrev.acceptancePct) })}</li>}
        {!notes.length && !showAcc && <li className="text-muted">{t('rev.detail.none')}</li>}
      </ul>
      {showAcc && acc.acceptancePct! < accPrev.acceptancePct! - 5 && <Note tone="check">{t('rev.detail.acceptanceCheck')}</Note>}
    </Panel>
  );
}

function UnusualPanel({ ctx }: { ctx: MonthCtx }) {
  const { t, f } = useT();
  const { data, month, cur } = ctx;
  const rev = revenue(data, cur).value;
  const from = addMonths(month, -12) < data.firstMonth ? data.firstMonth : addMonths(month, -12);
  const before = monthlySeries(data, 'revenue_eur', {}, from, addMonths(month, -1)).filter((p) => p.value !== null) as { month: string; value: number }[];
  const avg = before.length ? before.reduce((s, p) => s + p.value, 0) / before.length : null;
  const lastYearMonth = addMonths(month, -12);
  const lastYear = lastYearMonth >= data.firstMonth ? monthlySeries(data, 'revenue_eur', {}, lastYearMonth, lastYearMonth)[0].value : null;
  let verdict: string | null = null;
  if (rev !== null && before.length >= 6) {
    const sorted = before.map((p) => p.value).sort((a, b) => a - b);
    const lowCut = sorted[1];
    const highCut = sorted[sorted.length - 2];
    verdict = rev < lowCut ? t('rev.unusual.low') : rev > highCut ? t('rev.unusual.high') : t('rev.unusual.within');
  }
  return (
    <Panel title={t('rev.unusual.title')}>
      {rev === null ? (
        <NotEnough reason="missing_source" source="pvs" compact />
      ) : (
        <>
          {verdict && <p className="mb-3 text-sm font-medium leading-relaxed text-ink">{verdict}</p>}
          <KeyVal k={t('m.revenue.label')} v={f.eur(rev)} />
          <KeyVal k={t('rev.unusual.avg')} v={f.eur(avg)} />
          {avg !== null && <KeyVal k={t('rev.unusual.vsAvg', { month: f.monthName(month) })} v={<Delta value={rev - avg} text={`${f.eurSigned(rev - avg)} (${f.pctSigned(((rev - avg) / avg) * 100)})`} />} />}
          <KeyVal k={t('rev.unusual.lastYear')} v={lastYear === null ? f.dash : f.eur(lastYear)} />
          {lastYear !== null ? (
            <KeyVal k={t('rev.unusual.vsLastYear', { month: f.monthName(month) })} v={<Delta value={rev - lastYear} text={`${f.eurSigned(rev - lastYear)} (${f.pctSigned(((rev - lastYear) / lastYear) * 100)})`} />} />
          ) : (
            <p className="mt-2 text-xs text-muted">{t('rev.unusual.noLastYear')}</p>
          )}
          <p className="mt-3 text-xs text-muted">{t('rev.unusual.hint')}</p>
        </>
      )}
    </Panel>
  );
}

export function RevenueInsights() {
  const { t, f, names } = useT();
  const ctx = useMonth();
  const { data, cur, prev, month, prevMonth, hasPrev } = ctx;
  const selection = useStore((s) => s.selection);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const rev = revenue(data, cur);
  const revPrev = hasPrev ? revenue(data, prev).value : null;
  const changes = treatmentChanges(data, cur, prev);
  const payer = payerMix(data, cur);
  const lab = labRevenue(data, cur);
  const selected = selection?.kind === 'treatment' ? (selection.id as Treatment) : null;
  const rows = [...(changes.value ?? [])].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.change)));
  const top = rows[0];
  return (
    <WithPanel panel={selected ? <TreatmentPanel ctx={ctx} treatment={selected} /> : <UnusualPanel ctx={ctx} />}>
      <Metric result={rev}>
        {(v) => (
          <Answer sub={hasPrev && top ? t('rev.answer.sub', { treatment: names.treatment(top.treatment), change: f.eurSigned(top.change) }) : undefined}>
            {revPrev === null
              ? t('rev.answer.first', { month: f.monthName(month), revenue: f.eur(v) })
              : t(v < revPrev ? 'rev.answer.down' : 'rev.answer.up', { month: f.monthName(month), revenue: f.eur(v), amount: f.eur(Math.abs(v - revPrev)), prevMonth: f.monthName(prevMonth) })}
          </Answer>
        )}
      </Metric>

      <BridgeCard ctx={ctx} />

      {hasPrev && (
        <Card title={t('rev.which.title')}>
          <Metric result={changes}>
            {() => (
              <>
                <div className="space-y-1">
                  {rows.map((r) => (
                    <DivergingRow
                      key={r.treatment}
                      label={names.treatment(r.treatment)}
                      sub={t('rev.which.sub', { previous: f.num(r.previousSessions), current: f.num(r.sessions), countEffect: f.eurSigned(r.countEffect), priceEffect: f.eurSigned(r.priceEffect) })}
                      value={r.change}
                      max={max}
                      text={f.eurSigned(r.change)}
                      onClick={() => toggleSelect({ kind: 'treatment', id: r.treatment })}
                      active={selected === r.treatment}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">{t('common.clickRow')}</p>
              </>
            )}
          </Metric>
        </Card>
      )}

      <Card
        title={
          <>
            {t('rev.payer.title')} <InfoTip text={t('glossary:gkv.text')} label={t('glossary:gkv.term')} />
          </>
        }
      >
        <Metric result={payer}>
          {(p) => (
            <StackedBar
              segments={[
                { key: 'GKV', label: names.payer('GKV'), value: p.GKV, color: '#0E6B6B', text: f.eur(p.GKV) },
                { key: 'PKV', label: names.payer('PKV'), value: p.PKV, color: '#5FA8A3', text: f.eur(p.PKV) },
                { key: 'self', label: names.payer('self'), value: p.self, color: '#B9D6D3', text: f.eur(p.self), pattern: true },
              ]}
            />
          )}
        </Metric>
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm font-semibold">
            {t('rev.payer.lab')} <InfoTip text={t('glossary:lab.text')} label={t('glossary:lab.term')} />
          </p>
          <Metric result={lab} compact>
            {(amount) => <p className="mt-1 text-sm leading-relaxed text-ink">{t('rev.payer.labText', { amount: f.eur(amount), share: f.pct(rev.value ? (amount / rev.value) * 100 : null) })}</p>}
          </Metric>
        </div>
      </Card>
    </WithPanel>
  );
}

// ---------------- Treatment plans ----------------
export function PlansInsights() {
  const { t, f, names } = useT();
  const ctx = useMonth();
  const { data, cur, prev, month, prevMonth, hasPrev, half } = ctx;
  const summary = planSummary(data, cur);
  const summaryPrev = hasPrev ? planSummary(data, prev).value : null;
  const open = openPlans(data, cur);
  const inst = instalmentComparison(data, half);
  const dentists = acceptanceByDentist(data, cur, hasPrev ? prev : undefined);
  const follow = followUpList(data, cur, 10);
  const reasons = declineReasons(data, ctx.toDate);
  // what became of the plans created in the 12 months up to the selected month
  const outcome = useMemo(() => {
    const from = addDays(cur.to, -364);
    const list = data.plans.filter((p) => p.created >= from && p.created <= cur.to);
    const cutoff = addDays(cur.to, -90);
    let booked = 0;
    let under3 = 0;
    let over3 = 0;
    let closed = 0;
    for (const p of list) {
      if (isOpenAt(p, cur.to)) {
        if (p.created > cutoff) under3 += p.value;
        else over3 += p.value;
      } else if (p.status === 'accepted') booked += p.value;
      else closed += p.value;
    }
    return { booked, under3, over3, closed, n: list.length };
  }, [data, cur.to]);

  return (
    <div className="space-y-4">
      <Metric result={summary}>
        {(s) => (
          <Answer
            sub={
              <>
                <span className="block">{t('plans.whatIs')}</span>
                <span className="mt-2 block space-y-1 text-ink">
                  {summaryPrev?.acceptancePct != null && <span className="block">{t('plans.answerChange', { prevMonth: f.monthName(prevMonth), previous: f.pct(summaryPrev.acceptancePct) })}</span>}
                  {open.value && <span className="block">{t('plans.answerOpen', { open: f.eur(open.value.total) })}</span>}
                  {open.value && <span className="block">{t('plans.answerFresh', { under3: f.eur(open.value.under3) })}</span>}
                </span>
              </>
            }
          >
            {t('plans.answer', { month: f.monthName(month), accepted: f.eur(s.accepted), proposed: f.eur(s.proposed), acceptance: f.pct(s.acceptancePct) })}
          </Answer>
        )}
      </Metric>

      <Card title={t('plans.bar.title')}>
        {outcome.n === 0 ? (
          <NotEnough reason={summary.reason ?? 'too_few_records'} source={summary.missing} />
        ) : (
          <StackedBar
            segments={[
              { key: 'booked', label: t('plans.bar.booked'), value: outcome.booked, color: '#1E7A50', text: f.eur(outcome.booked) },
              { key: 'under3', label: t('plans.bar.under3'), value: outcome.under3, color: '#D08A2E', text: f.eur(outcome.under3) },
              { key: 'over3', label: t('plans.bar.over3'), value: outcome.over3, color: '#9A4A12', text: f.eur(outcome.over3), pattern: true },
              { key: 'closed', label: t('plans.bar.closed'), value: outcome.closed, color: '#C9C9C2', text: f.eur(outcome.closed) },
            ]}
          />
        )}
        {summary.value && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-sm text-ink">
              <span className="font-semibold">{t('plans.onePercent.label')} </span>
              {summary.value.acceptancePct !== null &&
                t('plans.onePercent.text', {
                  next: f.pct(Math.round(summary.value.acceptancePct) + 1),
                  current: f.pct(Math.round(summary.value.acceptancePct)),
                  value: f.eur(summary.value.onePercent),
                })}
            </p>
          </div>
        )}
      </Card>

      <Card title={t('plans.inst.title')} help={t('m.instalments.help')}>
        <Metric result={inst}>
          {(c) => {
            const diff = c.withOfferPct !== null && c.withoutOfferPct !== null ? c.withOfferPct - c.withoutOfferPct : null;
            return (
              <>
                <TileGrid cols={2}>
                  <Tile label={t('plans.inst.with')} value={f.pct(c.withOfferPct)} sub={t('plans.inst.sample', { n: f.num(c.withSample) })} tone="gain" small={c.withSample < 10} />
                  <Tile label={t('plans.inst.without')} value={f.pct(c.withoutOfferPct)} sub={t('plans.inst.sample', { n: f.num(c.withoutSample) })} small={c.withoutSample < 10} />
                </TileGrid>
                {diff !== null && (
                  <p className="mt-3 text-sm leading-relaxed text-ink">
                    {Math.abs(diff) < 3 ? t('plans.inst.textNoDiff') : t('plans.inst.text', { with: f.pct(c.withOfferPct), without: f.pct(c.withoutOfferPct), share: f.pct(c.offeredSharePct) })} {t('common.linkNotProof')}
                  </p>
                )}
                <Note tone="check">{t('plans.inst.check')}</Note>
                <p className="mt-2 text-xs text-muted">{t('plans.inst.period', { month: f.month(month) })}</p>
              </>
            );
          }}
        </Metric>
      </Card>

      <Card title={t('plans.dentist.title')}>
        <Metric result={dentists}>
          {(rows) => (
            <ul className="divide-y divide-line/70">
              {rows.map((r) => {
                const days = absenceDays(data, cur, r.dentistId);
                const diff = r.acceptancePct !== null && r.previousAcceptancePct !== null ? r.acceptancePct - r.previousAcceptancePct : null;
                return (
                  <li key={r.dentistId} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{names.staff(r.dentistId)}</p>
                      <p className="text-sm leading-relaxed text-ink">
                        {r.acceptancePct === null
                          ? t('plans.dentist.none')
                          : r.previousAcceptancePct === null
                            ? t('plans.dentist.rowFirst', { staff: names.staff(r.dentistId), current: f.pct(r.acceptancePct), month: f.monthName(month) })
                            : t('plans.dentist.row', { staff: names.staff(r.dentistId), current: f.pct(r.acceptancePct), month: f.monthName(month), previous: f.pct(r.previousAcceptancePct), prevMonth: f.monthName(prevMonth) })}
                        {r.plans < 10 && r.acceptancePct !== null && <span className="ml-2 text-xs text-opp">{t('common.fewCases')}</span>}
                      </p>
                      <p className="text-sm leading-relaxed text-muted">{t('plans.dentist.waiting', { open: f.eur(r.open), staff: names.staff(r.dentistId) })}</p>
                      {days > 0 && <p className="text-sm leading-relaxed text-ink">{t('plans.dentist.absence', { staff: names.staff(r.dentistId), days: f.num(days), month: f.monthName(month) })}</p>}
                    </div>
                    {diff !== null && <Delta value={Math.round(diff)} text={f.pctFromTo(r.previousAcceptancePct, r.acceptancePct)} className="text-sm" />}
                  </li>
                );
              })}
            </ul>
          )}
        </Metric>
      </Card>

      <Card title={t('plans.follow.title')} help={t('plans.follow.help')}>
        <Metric result={follow}>
          {(rows) =>
            rows.length === 0 ? (
              <p className="text-sm text-muted">{t('plans.follow.empty')}</p>
            ) : (
              <ol className="divide-y divide-line/70">
                {rows.map((r, i) => (
                  <li key={r.planId} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
                    <span className="num text-sm font-semibold text-muted">{i + 1}.</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {r.patientId} · {names.treatment(r.treatment)}
                      </p>
                      <p className="text-[13px] text-muted">
                        {names.staff(r.dentistId)} · {t('common.days', { count: r.daysOpen, n: f.num(r.daysOpen) })} · {r.planId}
                      </p>
                      <p className="mt-1 text-sm text-ink">
                        <span className="font-semibold text-accent">{t('plans.follow.stepLabel')}: </span>
                        {t(`plans.follow.step.${r.step}`)}
                      </p>
                    </div>
                    <span className="big-num text-lg font-semibold sm:text-right">{f.eur(r.value)}</span>
                  </li>
                ))}
              </ol>
            )
          }
        </Metric>
      </Card>

      {reasons.value && reasons.value.notRecorded + reasons.value.recordedCount > 0 && (
        <Card title={t('plans.reasons.title')}>
          <p className="text-sm leading-relaxed text-ink">{t('plans.reasons.text', { notRecorded: f.num(reasons.value.notRecorded), total: f.num(reasons.value.notRecorded + reasons.value.recordedCount) })}</p>
          {reasons.value.recordedCount > 0 && (
            <div className="mt-2 max-w-sm">
              {Object.entries(reasons.value.recorded).map(([k, n]) => (
                <KeyVal key={k} k={t(`plans.reason.${k}`)} v={f.num(n)} />
              ))}
            </div>
          )}
          <Note tone="check">{t('plans.reasons.hint')}</Note>
        </Card>
      )}
    </div>
  );
}
