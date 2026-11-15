import { useMemo } from 'react';
import { Answer, Card, Delta, KeyVal, Metric, NotEnough, Note, Panel, ShareBar, StackedBar, TableWrap, Td, Term, Th, Tile, TileGrid, WithPanel, cx } from '../components/ui';
import { addMonths, monthEnd } from '../data/dates';
import type { Channel, StaffId } from '../data/types';
import { useT } from '../i18n';
import { emptySlotValue, missedAppointments, treatmentTimeUsed, weekdayUtilisation } from '../metrics/capacity';
import { monthFilter } from '../metrics/core';
import { instagramFunnel } from '../metrics/instagram';
import { adsReturn, channelFunnel, channelTable, districtTable, firstVisitValue, newPatientValue6m } from '../metrics/marketing';
import { nextBookedRate, overduePatients, patientVisits, recallVisitValue, typicalPatientValuePerYear } from '../metrics/recall';
import { onlineRequests, responseSpeed } from '../metrics/requests';
import { appointmentCount, newPatients, patientsSeen, revenueByStaff, revenueByTreatment } from '../metrics/revenue';
import { monthlySeries, perMonth } from '../metrics/series';
import { useStore } from '../state/store';
import { QuestionChips, TrendChart } from './InsightsPages1';
import { useMonth, type MonthCtx } from './shared';

// ---------------- Marketing ----------------
function ChannelPanel({ ctx, channel }: { ctx: MonthCtx; channel: Channel }) {
  const { t, f, names } = useT();
  const select = useStore((s) => s.select);
  const funnel = channelFunnel(ctx.data, ctx.half, channel);
  return (
    <Panel title={t('mkt.funnel.title', { channel: names.channel(channel) })} onClose={() => select(null)}>
      {funnel.value === null ? (
        funnel.reason === 'missing_source' ? (
          <NotEnough reason={funnel.reason} source={funnel.missing} compact />
        ) : (
          <p className="text-sm text-muted">{t('mkt.funnel.empty')}</p>
        )
      ) : (
        <>
          {(
            [
              ['requests', funnel.value.requests],
              ['fast', funnel.value.answeredFast],
              ['patients', funnel.value.newPatients],
              ['twice', funnel.value.cameTwice],
            ] as const
          ).map(([k, n]) => (
            <div key={k} className="py-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted">{t(`mkt.funnel.${k}`)}</span>
                <span className="num font-semibold">{f.num(n)}</span>
              </div>
              <ShareBar pct={(n / funnel.value!.requests) * 100} />
            </div>
          ))}
          <Note tone="check">{t(`mkt.funnel.drop${funnel.value.biggestDrop ?? 2}`)}</Note>
          {funnel.small && <p className="mt-2 text-xs text-opp">{t('common.tooFew')}</p>}
          <p className="mt-2 text-xs text-muted">{t('mkt.channels.period', { month: f.month(ctx.month) })}</p>
        </>
      )}
    </Panel>
  );
}

function MarketingSidePanel({ ctx }: { ctx: MonthCtx }) {
  const { t, f } = useT();
  const { data } = ctx;
  const npv = newPatientValue6m(data);
  return (
    <Panel title={t('m.npv6m.label')}>
      <Metric result={npv} compact>
        {(v) => (
          <>
            <p className="big-num text-2xl font-semibold">{f.eur(v)}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t('m.npv6m.help')}</p>
          </>
        )}
      </Metric>
      <p className="mt-3 text-xs text-muted">{t('mkt.funnel.hint')}</p>
    </Panel>
  );
}

export function MarketingInsights() {
  const { t, f, names } = useT();
  const ctx = useMonth();
  const { data, cur, prev, month, prevMonth, hasPrev, half } = ctx;
  const selection = useStore((s) => s.selection);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const selected = selection?.kind === 'channel' ? (selection.id as Channel) : null;
  const requests = onlineRequests(data, cur);
  const speed = responseSpeed(data, cur);
  const speedPrev = hasPrev ? responseSpeed(data, prev).value : null;
  const npv = newPatientValue6m(data).value;
  const channels = channelTable(data, half);
  const districts = districtTable(data, ctx.toDate);
  const ig = instagramFunnel(data, cur);
  const igHalf = instagramFunnel(data, half);
  const ads = adsReturn(data, half);
  const record = useMemo(() => {
    const earlier = monthlySeries(data, 'online_requests', {}, data.firstMonth, month).slice(0, -1);
    return requests.value !== null && earlier.length >= 3 && earlier.every((p) => (p.value ?? 0) < requests.value!);
  }, [data, month, requests.value]);

  const convs = (channels.value?.rows ?? []).filter((r) => r.conversionPct !== null && (r.requests ?? 0) >= 10 && r.channel !== 'referral');
  const best = (channels.value?.rows ?? []).filter((r) => r.conversionPct !== null && (r.requests ?? 0) >= 10).sort((a, b) => b.conversionPct! - a.conversionPct!)[0]?.channel;
  const worst = convs.slice().sort((a, b) => a.conversionPct! - b.conversionPct!)[0]?.channel;
  const channelSentence = (r: { channel: Channel; requests: number | null; newPatients: number; adSpend: number | null }): string => {
    if (r.requests === null) return t('mkt.channels.noRequests');
    if (r.channel === best) return r.channel === 'referral' ? `${t('mkt.channels.best')} ${t('mkt.channels.direct')}` : t('mkt.channels.best');
    if (r.channel === worst) return t('mkt.channels.worst');
    if (r.adSpend) return t('mkt.channels.paid', { spend: f.eur(r.adSpend), patients: f.num(r.newPatients) });
    return t('mkt.channels.steady');
  };

  return (
    <WithPanel panel={selected ? <ChannelPanel ctx={ctx} channel={selected} /> : <MarketingSidePanel ctx={ctx} />}>
      {speed.value && requests.value !== null ? (
        <Answer
          sub={
            <>
              {speedPrev && t('mkt.answer.prev', { prevMonth: f.monthName(prevMonth), previous: f.pct(speedPrev.fastPct) })}{' '}
              {speed.value.fastConversionPct !== null && speed.value.slowConversionPct ? t('mkt.answer.sub', { factor: f.num(speed.value.fastConversionPct / speed.value.slowConversionPct, 1) }) : ''}
            </>
          }
        >
          {t(record ? 'mkt.answer.record' : 'mkt.answer.normal', { requests: f.num(requests.value), month: f.monthName(month), share: f.pct(speed.value.fastPct) })}
        </Answer>
      ) : (
        <NotEnough reason={speed.reason ?? requests.reason} source={speed.missing ?? requests.missing} />
      )}

      <Card title={t('mkt.speed.title')}>
        <Metric result={speed}>
          {(s) => (
            <>
              <TileGrid cols={4}>
                <Tile label={t('m.fast2h.label')} help={t('m.fast2h.help')} value={f.pct(s.fastPct)} delta={speedPrev ? <Delta value={Math.round(s.fastPct - speedPrev.fastPct)} text={f.points(s.fastPct - speedPrev.fastPct)} /> : undefined} />
                <Tile label={t('m.fastConv.label')} help={t('m.fastConv.help')} value={f.pct(s.fastConversionPct)} tone="gain" />
                <Tile label={t('m.slowConv.label')} help={t('m.slowConv.help')} value={f.pct(s.slowConversionPct)} tone="loss" />
                <Tile
                  label={t('m.missedPatients.label')}
                  help={t('m.missedPatients.help')}
                  value={s.missedNewPatients === null ? f.dash : `${t('common.about')} ${f.num(Math.round(s.missedNewPatients))}`}
                  sub={s.missedNewPatients !== null && npv !== null ? t('mkt.speed.missedValue', { value: f.eur(Math.round((s.missedNewPatients * npv) / 100) * 100) }) : undefined}
                  tone="opp"
                />
              </TileGrid>
              <p className="mt-3 text-sm leading-relaxed text-ink">
                {s.slowWeekendPct !== null && s.slow >= 5 && t('mkt.speed.weekend', { share: f.pct(s.slowWeekendPct) })} {t('mkt.speed.form')}
              </p>
              <p className="mt-1 text-sm text-muted">{t('common.linkNotProof')}</p>
            </>
          )}
        </Metric>
      </Card>

      <Card title={t('mkt.channels.title')} help={t('m.channelConv.help')}>
        <Metric result={channels}>
          {(v) => (
            <>
              <ul className="space-y-1">
                {v.rows.map((r) => (
                  <li key={r.channel}>
                    <button type="button" onClick={() => toggleSelect({ kind: 'channel', id: r.channel })} aria-pressed={selected === r.channel} className={cx('row-btn px-2 py-2.5', selected === r.channel && 'bg-bg ring-1 ring-accent')}>
                      <span className="grid items-center gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4.5rem]">
                        <span className="text-sm font-semibold">{names.channel(r.channel)}</span>
                        <span className="min-w-0">
                          <span className="num block text-sm text-ink">{r.requests === null ? f.num(r.newPatients) + ' ' + t('data.col.newPatients') : t('mkt.channels.fromTo', { requests: f.num(r.requests), patients: f.num(r.newPatients) })}</span>
                          <span className="block text-[13px] leading-snug text-muted">{channelSentence(r)}</span>
                        </span>
                        <span className="big-num text-lg font-semibold sm:text-right">{r.conversionPct === null ? f.dash : f.pct(Math.min(r.conversionPct, 100))}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {v.noSource > 0 && (
                <Note tone="check">
                  {t('mkt.channels.noSource', { count: f.num(v.noSource), share: f.pct(v.noSourcePct) })} {t('mkt.channels.noSourceHint')}
                </Note>
              )}
              <p className="mt-2 text-xs text-muted">
                {t('mkt.channels.period', { month: f.month(month) })} {t('common.clickRow')}
              </p>
            </>
          )}
        </Metric>
      </Card>

      <Card title={t('mkt.districts.title')}>
        <Metric result={districts}>
          {(rows) => {
            const total = rows.reduce((s, r) => s + r.newPatients, 0) || 1;
            const top = rows.filter((r) => r.value6m !== null).sort((a, b) => b.value6m! - a.value6m!)[0];
            return (
              <>
                <ul className="space-y-2">
                  {rows.map((r) => (
                    <li key={r.district} className="grid items-center gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_3rem_auto]">
                      <span className="font-medium">{names.district(r.district)}</span>
                      <ShareBar pct={(r.newPatients / total) * 100} color={r.aboveAverage ? '#9A4A12' : '#0E6B6B'} />
                      <span className="num font-semibold sm:text-right">{f.num(r.newPatients)}</span>
                      <span className="num text-[13px] text-muted sm:min-w-[11rem] sm:text-right">
                        {r.value6m === null ? f.dash : f.eur(r.value6m)}
                        {r.aboveAverage && <span className="ml-1 font-semibold text-opp">▲ {t('mkt.districts.above')}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm leading-relaxed text-ink">
                  {rows.length >= 2 && t('mkt.districts.text', { first: names.district(rows[0].district), second: names.district(rows[1].district) })}{' '}
                  {top && top.aboveAverage && t('mkt.districts.top', { district: names.district(top.district), value: f.eur(top.value6m) })}
                </p>
                <p className="mt-1 text-xs text-muted">{t('m.value6mShort.help')}</p>
              </>
            );
          }}
        </Metric>
      </Card>

      <Card title={t('mkt.ig.title')}>
        <Metric result={ig}>
          {(v) => {
            const steps: [string, string][] = [
              [t('m.igPosts.label'), f.num(v.posts)],
              [t('m.igReach.label'), f.num(v.reach)],
              [t('m.igLinkClicks.label'), f.num(v.linkClicks)],
              [t('m.igMessages.label'), f.num(v.messages)],
              [t('data.col.requests'), f.num(v.requests)],
              [t('data.col.newPatients'), f.num(v.newPatients)],
              [t('mkt.ig.value'), f.eur(v.value6m)],
            ];
            const types = igHalf.value?.byPostType ?? [];
            const bestType = types[0];
            const reachType = types.slice().sort((a, b) => (b.avgReach ?? 0) - (a.avgReach ?? 0))[0];
            return (
              <>
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                  {steps.map(([label, value], i) => (
                    <li key={label} className="relative rounded-lg bg-bg px-3 py-2.5">
                      <span className="block text-[12px] leading-tight text-muted">
                        {i + 1}. {label}
                      </span>
                      <span className="big-num block text-lg font-semibold">{value}</span>
                    </li>
                  ))}
                </ol>
                <h3 className="mb-1 mt-5 text-sm font-semibold">{t('mkt.ig.types')}</h3>
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>{t('data.col.postType')}</Th>
                      <Th right>{t('data.col.posts')}</Th>
                      <Th right help={t('m.igReach.help')}>{t('data.col.avgReach')}</Th>
                      <Th right>{t('data.col.requests')}</Th>
                      <Th right>{t('data.col.newPatients')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((r) => (
                      <tr key={r.type}>
                        <Td>{names.postType(r.type)}</Td>
                        <Td right>{f.num(r.posts)}</Td>
                        <Td right>{f.num(r.avgReach)}</Td>
                        <Td right>{f.num(r.requests)}</Td>
                        <Td right strong>{f.num(r.newPatients)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
                {bestType && reachType && bestType.requests > 0 && (
                  <p className="mt-3 text-sm leading-relaxed text-ink">
                    {bestType.type === reachType.type ? t('mkt.ig.textSame', { best: names.postType(bestType.type) }) : t('mkt.ig.text', { best: names.postType(bestType.type), reach: names.postType(reachType.type) })}{' '}
                    {reachType.type === 'team' && bestType.type !== 'team' && t('mkt.ig.trust')} {t('common.linkNotProof')}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted">{t('mkt.channels.period', { month: f.month(month) })}</p>
              </>
            );
          }}
        </Metric>
      </Card>

      <Card title={t('mkt.ads.title')}>
        <Metric result={ads}>
          {(a) => (
            <>
              <TileGrid cols={4}>
                <Tile label={t('m.adSpend.label')} help={t('m.adSpend.help')} value={f.eur(a.spend)} />
                <Tile label={t('m.newPatients.label')} value={f.num(a.newPatients)} />
                <Tile label={t('m.costPerNew.label')} help={t('m.costPerNew.help')} value={f.eur(a.costPerNewPatient)} />
                <Tile label={t('m.returnPerEuro.label')} help={t('m.returnPerEuro.help')} value={a.returnPerEuro === null ? f.dash : f.eur(a.returnPerEuro, 2)} tone="gain" />
              </TileGrid>
              {a.returnPerEuro !== null && <p className="mt-3 text-sm leading-relaxed text-ink">{t('mkt.ads.text', { ret: f.eur(a.returnPerEuro, 2) })}</p>}
              <Note>{t('mkt.ads.note')}</Note>
              <p className="mt-2 text-xs text-muted">{t('mkt.channels.period', { month: f.month(month) })}</p>
            </>
          )}
        </Metric>
      </Card>

      <Card title={t('chips.title')}>
        <QuestionChips keys={['chips.q3', 'chips.q7', 'chips.q8']} />
      </Card>
    </WithPanel>
  );
}

// ---------------- Patients & prevention ----------------
function PatientPanel({ ctx, patientId }: { ctx: MonthCtx; patientId: string }) {
  const { t, f, names } = useT();
  const select = useStore((s) => s.select);
  const row = overduePatients(ctx.data, ctx.cur).value?.find((o) => o.patientId === patientId);
  const visits = patientVisits(ctx.data, patientId, ctx.cur.to);
  return (
    <Panel title={t('pat.story.title', { id: patientId })} onClose={() => select(null)}>
      {row && (
        <div className="space-y-1.5 text-sm leading-relaxed text-ink">
          {row.daysSinceLastVisit !== null && (
            <p>{row.usualIntervalDays ? t('pat.story.text', { interval: f.num(row.usualIntervalDays), days: f.num(row.daysSinceLastVisit) }) : t('pat.story.textNoInterval', { days: f.num(row.daysSinceLastVisit) })}</p>
          )}
          <p>{t('pat.story.due', { date: f.date(row.due) })}</p>
          {row.visits > 0 && <p>{t('pat.story.worth', { billed: f.eur(row.totalBilled), visits: f.num(row.visits) })}</p>}
          {visits[0]?.nextBooked === false && <p>{t('pat.story.noNext')}</p>}
        </div>
      )}
      <h3 className="mb-1 mt-4 text-sm font-semibold">{t('pat.story.visits')}</h3>
      {visits.length === 0 ? (
        <p className="text-sm text-muted">{t('pat.story.noVisits')}</p>
      ) : (
        <ul className="divide-y divide-line/70 text-sm">
          {visits.map((a) => (
            <li key={a.id} className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="num font-medium">{f.date(a.at)}</span>
                <span className="num">{f.eur(a.billed)}</span>
              </div>
              <div className="text-[13px] text-muted">
                {names.treatment(a.treatment)} · {names.staff(a.staffId)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function GrowthPanel({ ctx }: { ctx: MonthCtx }) {
  const { t, f } = useT();
  const { data, month } = ctx;
  const back = addMonths(month, -3);
  const from = addMonths(month, -2) < data.firstMonth ? data.firstMonth : addMonths(month, -2);
  const fresh = newPatients(data, { from: `${from}-01`, to: monthEnd(month) }).value;
  const overdueNow = overduePatients(data, monthFilter(month)).value?.length ?? null;
  const overdueThen = back >= data.firstMonth ? (overduePatients(data, monthFilter(back)).value?.length ?? null) : null;
  const seenNow = patientsSeen(data, monthFilter(month)).value;
  const seenThen = back >= data.firstMonth ? patientsSeen(data, monthFilter(back)).value : null;
  const overdueDiff = overdueNow !== null && overdueThen !== null ? overdueNow - overdueThen : null;
  return (
    <Panel title={t('pat.growth.title')}>
      {fresh === null ? (
        <NotEnough reason="missing_source" source="pvs" compact />
      ) : (
        <>
          {overdueDiff !== null && <p className="mb-3 text-sm font-medium leading-relaxed text-ink">{t(fresh >= overdueDiff ? 'pat.growth.textGrow' : 'pat.growth.textShrink')}</p>}
          <KeyVal k={t('pat.growth.new')} v={f.num(fresh)} />
          <KeyVal k={t('pat.growth.overdueChange')} v={overdueDiff === null ? f.dash : <Delta value={overdueDiff} text={f.numSigned(overdueDiff)} goodWhen="down" />} />
          <KeyVal k={t('pat.growth.seen')} v={seenNow !== null && seenThen !== null ? <Delta value={seenNow - seenThen} text={f.numSigned(seenNow - seenThen)} /> : f.dash} />
          <p className="mt-3 text-xs text-muted">{t('pat.growth.hint')}</p>
        </>
      )}
    </Panel>
  );
}

export function PatientsInsights() {
  const { t, f, names } = useT();
  const ctx = useMonth();
  const { data, cur, month } = ctx;
  const selection = useStore((s) => s.selection);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const selected = selection?.kind === 'patient' ? selection.id : null;
  const overdue = overduePatients(data, cur);
  const recall = recallVisitValue(data, cur);
  const perYear = typicalPatientValuePerYear(data, cur);
  const npv = newPatientValue6m(data).value;
  const first = firstVisitValue(data).value;
  const appts = appointmentCount(data, cur).value;
  const seen = patientsSeen(data, cur).value;
  const fresh = newPatients(data, cur).value;
  const team = nextBookedRate(data, cur).value;
  const staffRows = revenueByStaff(data, cur).value ?? [];
  const byStaff = useMemo(() => {
    const m = new Map<StaffId, number>();
    for (const o of overdue.value ?? []) if (o.lastSeenBy) m.set(o.lastSeenBy, (m.get(o.lastSeenBy) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [overdue.value]);
  const topStaff = byStaff[0];
  const topStaffRate = topStaff ? staffRows.find((s) => s.staffId === topStaff[0])?.nextBookedPct : null;
  const shown = (overdue.value ?? []).slice(0, 8);
  return (
    <WithPanel panel={selected ? <PatientPanel ctx={ctx} patientId={selected} /> : <GrowthPanel ctx={ctx} />}>
      <Metric result={overdue}>
        {(list) => (
          <Answer sub={seen !== null && fresh !== null ? t('pat.answerSub', { month: f.monthName(month), seen: f.num(seen), fresh: f.num(fresh) }) : undefined}>
            {t('pat.answer', { count: f.num(list.length), value: recall.value !== null ? f.eur(Math.round((list.length * recall.value) / 100) * 100) : f.dash })} <Term k="recall" />
          </Answer>
        )}
      </Metric>

      <TileGrid cols={4}>
        <Tile label={t('m.patientValueYear.label')} help={t('m.patientValueYear.help')} value={perYear.value === null ? t('common.notEnough') : f.eur(perYear.value)} />
        <Tile label={t('pat.value.recall')} help={t('m.recallValue.help')} value={recall.value === null ? t('common.notEnough') : f.eur(recall.value)} />
        <Tile label={t('pat.value.onePoint')} help={t('pat.value.onePointHelp')} value={appts !== null && recall.value !== null ? f.eur((appts / 100) * recall.value) : f.dash} sub={t('pat.value.perMonth')} tone="opp" />
        <Tile label={t('pat.value.lost')} help={t('pat.value.lostHelp')} value={npv !== null && first !== null ? f.eur(Math.max(0, npv - first)) : f.dash} tone="loss" />
      </TileGrid>

      <Card title={t('pat.overdue.title')} help={t('m.overdue.help')}>
        <Metric result={overdue}>
          {(list) => (
            <>
              {topStaff && list.length >= 10 && topStaff[1] / list.length >= 0.25 && (
                <div className="mb-3">
                  <p className="text-sm leading-relaxed text-ink">{t('pat.overdue.byStaff', { count: f.num(topStaff[1]), total: f.num(list.length), staff: names.staff(topStaff[0]) })}</p>
                  {topStaffRate != null && team !== null && topStaffRate < team - 5 && <Note tone="check">{t('pat.overdue.byStaffCheck', { staff: names.staff(topStaff[0]), rate: f.pct(topStaffRate), team: f.pct(team) })}</Note>}
                </div>
              )}
              <ul className="space-y-1">
                {shown.map((o) => (
                  <li key={o.patientId}>
                    <button type="button" onClick={() => toggleSelect({ kind: 'patient', id: o.patientId })} aria-pressed={selected === o.patientId} className={cx('row-btn px-2 py-2', selected === o.patientId && 'bg-bg ring-1 ring-accent')}>
                      <span className="flex flex-wrap items-baseline gap-x-3">
                        <span className="num text-sm font-semibold">{o.patientId}</span>
                        <span className="text-[13px] text-muted">
                          {o.daysSinceLastVisit !== null && o.lastSeenBy
                            ? t('pat.overdue.row', { days: f.num(o.daysSinceLastVisit), billed: f.eur(o.totalBilled), staff: names.staff(o.lastSeenBy) })
                            : t('pat.overdue.rowNoVisit', { days: f.num(o.daysOverdue) })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                {t('pat.overdue.shown', { shown: f.num(shown.length) })} {t('common.clickRow')}
              </p>
            </>
          )}
        </Metric>
      </Card>

      <Card title={t('chips.title')}>
        <QuestionChips keys={['chips.q4', 'chips.q5']} />
      </Card>
    </WithPanel>
  );
}

// ---------------- Treatment time & team ----------------
function PersonPanel({ ctx, staffId }: { ctx: MonthCtx; staffId: StaffId }) {
  const { t, f, names } = useT();
  const { data, cur, month } = ctx;
  const select = useStore((s) => s.select);
  const trend = useMemo(
    () => perMonth(data, (flt) => nextBookedRate(data, { ...flt, staff: staffId }).value).filter((p) => p.month <= month && p.month >= addMonths(month, -11)),
    [data, staffId, month],
  );
  const mix = (revenueByTreatment(data, { ...cur, staff: staffId }).value ?? []).filter((r) => r.sessions > 0).sort((a, b) => b.sessions - a.sessions);
  const days = data.staff.find((s) => s.id === staffId) ? ctx.data.events.filter((e) => e.staffId === staffId && e.from <= cur.to && e.to >= cur.from) : [];
  return (
    <Panel title={names.staff(staffId)} onClose={() => select(null)}>
      <h3 className="mb-1 text-sm font-semibold">{t('chairs.person.trend')}</h3>
      <TrendChart points={trend} kind="pct" selected={month} />
      <h3 className="mb-1 mt-4 text-sm font-semibold">{t('chairs.person.mix', { month: f.month(month) })}</h3>
      {mix.map((r) => (
        <KeyVal key={r.treatment} k={names.treatment(r.treatment)} v={t('chairs.person.appointments', { n: f.num(r.sessions) })} />
      ))}
      {days.length > 0 && (
        <>
          <h3 className="mb-1 mt-4 text-sm font-semibold">{t('common.events')}</h3>
          <ul className="space-y-1 text-sm">
            {days.map((e) => (
              <li key={e.id}>{t('rev.detail.event', { event: names.event(e), from: f.date(e.from), to: f.date(e.to) })}</li>
            ))}
          </ul>
        </>
      )}
      <Note>{t('chairs.team.habit')}</Note>
    </Panel>
  );
}

function RoomPanel({ ctx }: { ctx: MonthCtx }) {
  const { t, f } = useT();
  const { data, cur } = ctx;
  const week = weekdayUtilisation(data, cur);
  const overdue = overduePatients(data, cur).value?.length ?? null;
  return (
    <Panel title={t('chairs.room.title')}>
      <Metric result={week} compact>
        {(rows) => {
          const quiet = rows.filter((r) => r.usedPct !== null).sort((a, b) => a.usedPct! - b.usedPct!).slice(0, 2);
          const free = quiet.reduce((s, r) => s + Math.max(0, r.slots - r.appointments), 0);
          return (
            <>
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.weekday} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
                    <span className={cx(quiet.includes(r) && 'font-semibold')}>{f.weekday(r.weekday)}</span>
                    <ShareBar pct={r.usedPct} color={quiet.includes(r) ? '#9A4A12' : '#0E6B6B'} />
                    <span className="num text-right">{f.pct(r.usedPct)}</span>
                  </li>
                ))}
              </ul>
              {quiet.length === 2 && <p className="mt-3 text-sm leading-relaxed text-ink">{t('chairs.room.text', { first: f.weekday(quiet[0].weekday), second: f.weekday(quiet[1].weekday), free: f.num(free) })}</p>}
              {overdue !== null && overdue > 0 && <p className="mt-1 text-sm leading-relaxed text-ink">{t('chairs.room.match', { overdue: f.num(overdue) })}</p>}
              <p className="mt-3 text-xs text-muted">{t('chairs.room.hint')}</p>
            </>
          );
        }}
      </Metric>
    </Panel>
  );
}

export function ChairsInsights() {
  const { t, f, names } = useT();
  const ctx = useMonth();
  const { data, cur, prev, month, hasPrev } = ctx;
  const selection = useStore((s) => s.selection);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const selected = selection?.kind === 'staff' ? selection.id : null;
  const time = treatmentTimeUsed(data, cur);
  const missed = missedAppointments(data, cur);
  const missedPrev = hasPrev ? missedAppointments(data, prev).value : null;
  const slotValue = emptySlotValue(data, cur);
  const neverValue = time.value && slotValue !== null ? time.value.neverBooked * slotValue : null;
  const team = revenueByStaff(data, cur);
  const teamRate = nextBookedRate(data, cur).value;
  const recall = recallVisitValue(data, cur).value;
  return (
    <WithPanel panel={selected ? <PersonPanel ctx={ctx} staffId={selected} /> : <RoomPanel ctx={ctx} />}>
      <Metric result={time}>
        {(v) => (
          <Answer sub={missed.value && neverValue !== null ? t('chairs.answerSub', { missed: f.eur(Math.round(missed.value.value / 100) * 100), never: f.eur(Math.round(neverValue / 100) * 100) }) : undefined}>
            {t('chairs.answer', { month: f.monthName(month), used: f.pct(v.usedPct) })}
          </Answer>
        )}
      </Metric>

      <Card title={t('chairs.bar.title')} help={t('m.timeUsed.help')}>
        <Metric result={time}>
          {(v) => (
            <StackedBar
              segments={[
                { key: 'completed', label: t('chairs.bar.completed'), value: v.completed, color: '#1E7A50', text: t('chairs.bar.slots', { n: f.num(v.completed) }) },
                { key: 'cancelled', label: t('chairs.bar.cancelled'), value: v.cancelled, color: '#B4501A', text: t('chairs.bar.slots', { n: f.num(v.cancelled) }) },
                { key: 'noShow', label: t('chairs.bar.noShow'), value: v.noShow, color: '#7A3410', text: t('chairs.bar.slots', { n: f.num(v.noShow) }), pattern: true },
                { key: 'never', label: t('chairs.bar.never'), value: v.neverBooked, color: '#C9C9C2', text: t('chairs.bar.slots', { n: f.num(v.neverBooked) }) },
              ]}
            />
          )}
        </Metric>
      </Card>

      <Metric result={missed}>
        {(m) => (
          <>
            <TileGrid cols={3}>
              <Tile
                label={t('chairs.tile.missedValue')}
                help={t('m.missed.help')}
                value={f.eur(m.value)}
                tone="loss"
                delta={missedPrev ? <Delta value={m.total - missedPrev.total} text={`${f.numSigned(m.total - missedPrev.total)} ${t('m.missed.label')}`} goodWhen="down" /> : undefined}
                sub={m.byTreatment.length >= 2 ? t('chairs.tile.missedMostly', { first: names.treatment(m.byTreatment[0].treatment), second: names.treatment(m.byTreatment[1].treatment) }) : undefined}
              />
              <Tile label={t('chairs.tile.perMissed')} value={f.eur(m.valuePerAppointment)} />
              <Tile label={t('chairs.tile.neverValue')} help={t('chairs.tile.neverHelp')} value={neverValue === null ? f.dash : `${t('common.about')} ${f.eur(Math.round(neverValue / 100) * 100)}`} tone="opp" />
            </TileGrid>
            {m.total > 0 && <Note tone="check">{t('chairs.reasons', { notRecorded: f.num(m.total - m.reasonsRecorded), total: f.num(m.total) })}</Note>}
          </>
        )}
      </Metric>

      <Card title={t('chairs.team.title')} help={t('m.nextBooked.help')}>
        <Metric result={team}>
          {(rows) => (
            <>
              <ul className="space-y-1">
                {rows
                  .filter((r) => r.nextBookedPct !== null)
                  .map((r) => {
                    const gap = teamRate !== null ? teamRate - r.nextBookedPct! : 0;
                    const value = gap > 3 && recall !== null ? (gap / 100) * r.nextBookedSample * recall : null;
                    return (
                      <li key={r.staffId}>
                        <button type="button" onClick={() => toggleSelect({ kind: 'staff', id: r.staffId })} aria-pressed={selected === r.staffId} className={cx('row-btn px-2 py-2.5', selected === r.staffId && 'bg-bg ring-1 ring-accent')}>
                          <span className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)]">
                            <span className="text-sm font-semibold">{names.staff(r.staffId)}</span>
                            <span>
                              <span className="flex items-center gap-2">
                                <ShareBar pct={r.nextBookedPct} color={value !== null ? '#B4501A' : '#0E6B6B'} />
                                <span className="num w-12 text-right text-sm font-semibold">{f.pct(r.nextBookedPct)}</span>
                              </span>
                              <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                                {value !== null
                                  ? t('chairs.team.below', { rate: f.pct(r.nextBookedPct), team: f.pct(teamRate), value: f.eur(Math.round(value / 10) * 10) })
                                  : t('chairs.team.above', { rate: f.pct(r.nextBookedPct), team: f.pct(teamRate) })}
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
              <Note>{t('chairs.team.habit')}</Note>
              <p className="mt-2 text-xs text-muted">{t('common.clickRow')}</p>
            </>
          )}
        </Metric>
      </Card>
    </WithPanel>
  );
}
