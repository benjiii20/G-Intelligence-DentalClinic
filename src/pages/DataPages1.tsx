import { useMemo } from 'react';
import { Card, Delta, Metric, ShareBar, TableWrap, Td, Th, TileGrid } from '../components/ui';
import { daysBetween } from '../data/dates';
import { TREATMENTS } from '../data/types';
import { useT } from '../i18n';
import { treatmentChanges } from '../metrics/bridge';
import { treatmentTimeUsed } from '../metrics/capacity';
import { channelTable } from '../metrics/marketing';
import { acceptanceByDentist, isOpenAt, openPlans, planSummary } from '../metrics/plans';
import { onlineRequests, responseSpeed } from '../metrics/requests';
import { appointmentCount, existingPatientsShare, labRevenue, newPatients, patientsSeen, payerMix, revenue, revenueByStaff, revenueByTreatment, revenuePerVisit } from '../metrics/revenue';
import { monthlySeries, perMonth } from '../metrics/series';
import { useStore } from '../state/store';
import { MetricTile, SeriesBars, rowClass, useMonth } from './shared';

export function MonthCell({ month }: { month: string }) {
  const { t, f } = useT();
  const setMonth = useStore((s) => s.setMonth);
  return (
    <th scope="row" className="td p-0 text-left font-inherit">
      <button type="button" onClick={() => setMonth(month)} aria-label={t('common.selectMonth', { month: f.month(month) })} className="min-h-[44px] w-full whitespace-nowrap px-3 text-left hover:underline">
        {f.month(month)}
      </button>
    </th>
  );
}

// ---------------- Overview ----------------
export function OverviewData() {
  const { t, f, names } = useT();
  const { data, cur, prev } = useMonth();
  const go = useStore((s) => s.go);
  const series = useMemo(() => monthlySeries(data, 'revenue_eur'), [data]);
  const treat = revenueByTreatment(data, cur);
  const treatPrev = revenueByTreatment(data, prev);
  const staff = revenueByStaff(data, cur);
  const staffPrev = revenueByStaff(data, prev);
  const channels = channelTable(data, cur);
  return (
    <div className="space-y-4">
      <TileGrid cols={5}>
        <MetricTile label={t('m.revenue.label')} help={t('m.revenue.help')} result={revenue(data, cur)} prev={revenue(data, prev)} kind="eur" onClick={() => go('revenue')} />
        <MetricTile label={t('m.appointments.label')} help={t('m.appointments.help')} result={appointmentCount(data, cur)} prev={appointmentCount(data, prev)} kind="num" onClick={() => go('chairs')} />
        <MetricTile label={t('m.revenuePerVisit.label')} help={t('m.revenuePerVisit.help')} result={revenuePerVisit(data, cur)} prev={revenuePerVisit(data, prev)} kind="eur2" onClick={() => go('revenue')} />
        <MetricTile label={t('m.patientsSeen.label')} help={t('m.patientsSeen.help')} result={patientsSeen(data, cur)} prev={patientsSeen(data, prev)} kind="num" onClick={() => go('patients')} />
        <MetricTile label={t('m.newPatients.label')} help={t('m.newPatients.help')} result={newPatients(data, cur)} prev={newPatients(data, prev)} kind="num" onClick={() => go('marketing')} />
        <MetricTile label={t('m.acceptance.label')} help={t('m.acceptance.help')} result={planSummary(data, cur)} prev={planSummary(data, prev)} pick={(v) => v.acceptancePct} kind="pct" onClick={() => go('plans')} />
        <MetricTile label={t('m.openPlans.label')} help={t('m.openPlans.help')} result={openPlans(data, cur)} prev={openPlans(data, prev)} pick={(v) => v.total} kind="eur" goodWhen="down" onClick={() => go('plans')} />
        <MetricTile label={t('m.onlineRequests.label')} help={t('m.onlineRequests.help')} result={onlineRequests(data, cur)} prev={onlineRequests(data, prev)} kind="num" onClick={() => go('marketing')} />
        <MetricTile label={t('m.fast2h.label')} help={t('m.fast2h.help')} result={responseSpeed(data, cur)} prev={responseSpeed(data, prev)} pick={(v) => v.fastPct} kind="pct" onClick={() => go('marketing')} />
        <MetricTile label={t('m.timeUsed.label')} help={t('m.timeUsed.help')} result={treatmentTimeUsed(data, cur)} prev={treatmentTimeUsed(data, prev)} pick={(v) => v.usedPct} kind="pct" onClick={() => go('chairs')} />
      </TileGrid>

      <Card title={t('data.overview.revenuePerMonth')} help={t('m.revenue.help')}>
        <SeriesBars points={series} kind="eur" />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('data.overview.byTreatment')}>
          <Metric result={treat}>
            {(rows) => (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>{t('data.col.treatment')}</Th>
                    <Th right>{t('data.col.revenue')}</Th>
                    <Th right>{t('common.change')}</Th>
                    <Th right help={t('m.sessions.help')}>{t('m.sessions.label')}</Th>
                    <Th right>{t('common.share')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const before = treatPrev.value?.find((x) => x.treatment === r.treatment);
                    return (
                      <tr key={r.treatment}>
                        <Td>{names.treatment(r.treatment)}</Td>
                        <Td right strong>{f.eur(r.revenue)}</Td>
                        <Td right>{before ? <Delta value={r.revenue - before.revenue} text={f.eurSigned(r.revenue - before.revenue)} /> : f.dash}</Td>
                        <Td right>{f.num(r.sessions)}</Td>
                        <Td right>{f.pct(r.sharePct)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </Metric>
        </Card>

        <Card title={t('data.overview.byTeam')}>
          <Metric result={staff}>
            {(rows) => (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>{t('data.col.member')}</Th>
                    <Th right>{t('data.col.revenue')}</Th>
                    <Th right>{t('common.change')}</Th>
                    <Th right>{t('data.col.appointments')}</Th>
                    <Th right help={t('m.nextBooked.help')}>{t('data.col.nextBooked')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const before = staffPrev.value?.find((x) => x.staffId === r.staffId);
                    return (
                      <tr key={r.staffId}>
                        <Td>{names.staff(r.staffId)}</Td>
                        <Td right strong>{f.eur(r.revenue)}</Td>
                        <Td right>{before ? <Delta value={r.revenue - before.revenue} text={f.eurSigned(r.revenue - before.revenue)} /> : f.dash}</Td>
                        <Td right>{f.num(r.appointments)}</Td>
                        <Td right>{f.pct(r.nextBookedPct)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </Metric>
        </Card>
      </div>

      <Card title={t('data.overview.byChannel')}>
        <Metric result={channels}>
          {(v) => (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('data.col.channel')}</Th>
                  <Th right help={t('m.requests.help')}>{t('data.col.requests')}</Th>
                  <Th right>{t('data.col.newPatients')}</Th>
                  <Th right help={t('m.channelConv.help')}>{t('data.col.conversion')}</Th>
                  <Th right help={t('m.adSpend.help')}>{t('data.col.adSpend')}</Th>
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r) => (
                  <tr key={r.channel}>
                    <Td>{names.channel(r.channel)}</Td>
                    <Td right>{f.num(r.requests)}</Td>
                    <Td right strong>{f.num(r.newPatients)}</Td>
                    <Td right>{f.pct(r.conversionPct)}</Td>
                    <Td right>{f.eur(r.adSpend)}</Td>
                  </tr>
                ))}
                <tr>
                  <Td>{names.channel(null)}</Td>
                  <Td right>{f.dash}</Td>
                  <Td right strong>{f.num(v.noSource)}</Td>
                  <Td right>{f.dash}</Td>
                  <Td right>{f.dash}</Td>
                </tr>
              </tbody>
            </TableWrap>
          )}
        </Metric>
      </Card>
    </div>
  );
}

// ---------------- Revenue ----------------
export function RevenueData() {
  const { t, f, names } = useT();
  const { data, cur, prev, month } = useMonth();
  const series = useMemo(() => monthlySeries(data, 'revenue_eur'), [data]);
  const monthly = useMemo(
    () =>
      perMonth(data, (flt) => ({
        total: revenue(data, flt).value,
        byT: revenueByTreatment(data, flt).value,
        payer: payerMix(data, flt).value,
        lab: labRevenue(data, flt).value,
      })),
    [data],
  );
  const changes = treatmentChanges(data, cur, prev);
  const share = existingPatientsShare(data, cur);
  const sharePrev = existingPatientsShare(data, prev);
  const total = revenue(data, cur);
  return (
    <div className="space-y-4">
      <TileGrid cols={4}>
        <MetricTile label={t('m.revenue.label')} help={t('m.revenue.help')} result={total} prev={revenue(data, prev)} kind="eur" />
        <MetricTile label={t('m.revenuePerVisit.label')} help={t('m.revenuePerVisit.help')} result={revenuePerVisit(data, cur)} prev={revenuePerVisit(data, prev)} kind="eur2" />
        <MetricTile label={t('m.labRevenue.label')} help={t('m.labRevenue.help')} result={labRevenue(data, cur)} prev={labRevenue(data, prev)} kind="eur" />
        <MetricTile label={t('m.existingRevenueShare.label')} help={t('m.existingRevenueShare.help')} result={share} prev={sharePrev} pick={(v) => v.revenuePct} kind="pct" goodWhen="neutral" />
      </TileGrid>

      <Card title={t('data.overview.revenuePerMonth')} help={t('m.revenue.help')}>
        <SeriesBars points={series} kind="eur" />
      </Card>

      <Card title={t('data.revenue.thisMonth', { month: f.month(month) })}>
        <Metric result={changes}>
          {(rows) => (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('data.col.treatment')}</Th>
                  <Th right>{t('data.col.revenue')}</Th>
                  <Th right>{t('data.col.prevRevenue')}</Th>
                  <Th right>{t('common.change')}</Th>
                  <Th right help={t('m.sessions.help')}>{t('m.sessions.label')}</Th>
                  <Th right help={t('m.avgPerSession.help')}>{t('m.avgPerSession.label')}</Th>
                  <Th>{t('common.share')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pctShare = total.value ? (r.revenue / total.value) * 100 : null;
                  return (
                    <tr key={r.treatment}>
                      <Td>{names.treatment(r.treatment)}</Td>
                      <Td right strong>{f.eur(r.revenue)}</Td>
                      <Td right>{f.eur(r.previousRevenue)}</Td>
                      <Td right><Delta value={r.change} text={f.eurSigned(r.change)} /></Td>
                      <Td right>{f.num(r.sessions)}</Td>
                      <Td right>{f.eur(r.avg)}</Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <ShareBar pct={pctShare} />
                          <span className="num w-12 text-right">{f.pct(pctShare)}</span>
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </Metric>
      </Card>

      <Card title={t('data.revenue.monthly')}>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t('common.month')}</Th>
              <Th right>{t('common.total')}</Th>
              {TREATMENTS.map((tr) => (
                <Th key={tr} right>{names.treatment(tr)}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthly.map(({ month: m, value }) => (
              <tr key={m} className={rowClass(m === month)}>
                <MonthCell month={m} />
                <Td right strong>{f.eur(value.total)}</Td>
                {TREATMENTS.map((tr) => (
                  <Td key={tr} right>{f.eur(value.byT?.find((x) => x.treatment === tr)?.revenue)}</Td>
                ))}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card title={t('data.revenue.payerLab')} help={t('m.payerMix.help')}>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t('common.month')}</Th>
              <Th right>{names.payer('GKV')}</Th>
              <Th right>{names.payer('PKV')}</Th>
              <Th right>{names.payer('self')}</Th>
              <Th right help={t('m.labRevenue.help')}>{t('data.col.lab')}</Th>
            </tr>
          </thead>
          <tbody>
            {monthly.map(({ month: m, value }) => (
              <tr key={m} className={rowClass(m === month)}>
                <MonthCell month={m} />
                <Td right>{f.eur(value.payer?.GKV)}</Td>
                <Td right>{f.eur(value.payer?.PKV)}</Td>
                <Td right>{f.eur(value.payer?.self)}</Td>
                <Td right>{value.lab === null ? t('common.notEnough') : f.eur(value.lab)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}

// ---------------- Treatment plans ----------------
export function PlansData() {
  const { t, f, names } = useT();
  const { data, cur, prev, month } = useMonth();
  const series = useMemo(() => monthlySeries(data, 'open_plans_eur'), [data]);
  const monthly = useMemo(() => perMonth(data, (flt) => ({ s: planSummary(data, flt).value, o: openPlans(data, flt).value })), [data]);
  const summary = planSummary(data, cur);
  const summaryPrev = planSummary(data, prev);
  const open = openPlans(data, cur);
  const openPrev = openPlans(data, prev);
  const dentists = acceptanceByDentist(data, cur, prev);
  const openList = useMemo(
    () =>
      data.plans
        .filter((p) => isOpenAt(p, cur.to))
        .sort((a, b) => b.value - a.value)
        .slice(0, 40),
    [data, cur.to],
  );
  return (
    <div className="space-y-4">
      <TileGrid cols={5}>
        <MetricTile label={t('m.plansProposed.label')} help={t('m.plansProposed.help')} result={summary} prev={summaryPrev} pick={(v) => v.proposed} kind="eur" />
        <MetricTile label={t('m.plansAccepted.label')} help={t('m.plansAccepted.help')} result={summary} prev={summaryPrev} pick={(v) => v.accepted} kind="eur" />
        <MetricTile label={t('m.acceptance.label')} help={t('m.acceptance.help')} result={summary} prev={summaryPrev} pick={(v) => v.acceptancePct} kind="pct" />
        <MetricTile label={t('m.openUnder3.label')} help={t('m.openUnder3.help')} result={open} prev={openPrev} pick={(v) => v.under3} kind="eur" goodWhen="down" />
        <MetricTile label={t('m.openOver3.label')} help={t('m.openOver3.help')} result={open} prev={openPrev} pick={(v) => v.over3} kind="eur" goodWhen="down" />
      </TileGrid>

      <Card title={t('data.plans.openPerMonth')} help={t('m.openPlans.help')}>
        <SeriesBars points={series} kind="eur" />
      </Card>

      <Card title={t('data.plans.monthly')}>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t('common.month')}</Th>
              <Th right>{t('data.col.plans')}</Th>
              <Th right help={t('m.plansProposed.help')}>{t('data.col.proposed')}</Th>
              <Th right help={t('m.plansAccepted.help')}>{t('data.col.accepted')}</Th>
              <Th right help={t('m.acceptance.help')}>{t('data.col.acceptance')}</Th>
              <Th right help={t('m.openPlans.help')}>{t('data.col.open')}</Th>
            </tr>
          </thead>
          <tbody>
            {monthly.map(({ month: m, value }) => (
              <tr key={m} className={rowClass(m === month)}>
                <MonthCell month={m} />
                <Td right>{f.num(value.s?.count)}</Td>
                <Td right>{f.eur(value.s?.proposed)}</Td>
                <Td right>{f.eur(value.s?.accepted)}</Td>
                <Td right strong>{f.pct(value.s?.acceptancePct)}</Td>
                <Td right>{f.eur(value.o?.total)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card title={t('data.plans.byDentist', { month: f.month(month) })}>
        <Metric result={dentists}>
          {(rows) => (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('data.col.dentist')}</Th>
                  <Th right>{t('data.col.plans')}</Th>
                  <Th right>{t('data.col.proposed')}</Th>
                  <Th right>{t('data.col.acceptance')}</Th>
                  <Th right>{t('common.change')}</Th>
                  <Th right>{t('m.openPlans.label')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dentistId}>
                    <Td>{names.staff(r.dentistId)}</Td>
                    <Td right>{f.num(r.plans)}</Td>
                    <Td right>{f.eur(r.proposed)}</Td>
                    <Td right strong>{f.pct(r.acceptancePct)}</Td>
                    <Td right>
                      {r.acceptancePct !== null && r.previousAcceptancePct !== null ? (
                        <Delta value={Math.round(r.acceptancePct - r.previousAcceptancePct)} text={f.points(r.acceptancePct - r.previousAcceptancePct)} />
                      ) : (
                        f.dash
                      )}
                    </Td>
                    <Td right>{f.eur(r.open)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Metric>
      </Card>

      <Card title={t('data.plans.openList')}>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t('data.col.planId')}</Th>
              <Th>{t('data.col.patient')}</Th>
              <Th>{t('data.col.dentist')}</Th>
              <Th>{t('data.col.treatment')}</Th>
              <Th right>{t('data.col.value')}</Th>
              <Th right>{t('data.col.created')}</Th>
              <Th right>{t('data.col.daysOpen')}</Th>
              <Th>{t('data.col.instalments')}</Th>
            </tr>
          </thead>
          <tbody>
            {openList.map((p) => (
              <tr key={p.id}>
                <Td>{p.id}</Td>
                <Td>{p.patientId}</Td>
                <Td>{names.staff(p.dentistId)}</Td>
                <Td>{names.treatment(p.treatment)}</Td>
                <Td right strong>{f.eur(p.value)}</Td>
                <Td right>{f.date(p.created)}</Td>
                <Td right>{f.num(daysBetween(p.created, cur.to))}</Td>
                <Td>{p.instalmentsOffered === 'yes' ? t('common.yes') : p.instalmentsOffered === 'no' ? t('common.no') : t('common.notRecorded')}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <p className="mt-2 text-xs text-muted">{t('common.rowsShown', { shown: f.num(openList.length), total: f.num(open.value?.count ?? openList.length) })}</p>
      </Card>
    </div>
  );
}
