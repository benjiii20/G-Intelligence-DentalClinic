import { useMemo, useState } from 'react';
import { Card, Delta, Metric, NotEnough, ShareBar, TableWrap, Td, Th, TileGrid, cx } from '../components/ui';
import { useT } from '../i18n';
import { missedAppointments, treatmentTimeUsed, weekdayUtilisation } from '../metrics/capacity';
import { instagramFunnel } from '../metrics/instagram';
import { adsReturn, channelTable, districtTable, reviewSummary } from '../metrics/marketing';
import { nextBookedRate, overduePatients, patientList } from '../metrics/recall';
import { onlineRequests, responseSpeed } from '../metrics/requests';
import { appointmentCount, existingPatientsShare, newPatients, patientsSeen, revenueByStaff } from '../metrics/revenue';
import { monthlySeries, perMonth } from '../metrics/series';
import { MonthCell } from './DataPages1';
import { MetricTile, SeriesBars, rowClass, useMonth } from './shared';

// ---------------- Marketing ----------------
export function MarketingData() {
  const { t, f, names } = useT();
  const { data, cur, prev, month, half } = useMonth();
  const series = useMemo(() => monthlySeries(data, 'online_requests'), [data]);
  const monthly = useMemo(
    () =>
      perMonth(data, (flt) => ({
        requests: onlineRequests(data, flt).value,
        speed: responseSpeed(data, flt).value,
        channels: channelTable(data, flt).value,
        ig: instagramFunnel(data, flt).value,
      })),
    [data],
  );
  const channels = channelTable(data, cur);
  const districts = districtTable(data, cur);
  const igHalf = instagramFunnel(data, half);
  const ig = instagramFunnel(data, cur);
  const reviews = reviewSummary(data, cur);
  const via = (rows: { channel: string; newPatients: number }[] | undefined, c: string) => rows?.find((r) => r.channel === c)?.newPatients;
  return (
    <div className="space-y-4">
      <TileGrid cols={5}>
        <MetricTile label={t('m.onlineRequests.label')} help={t('m.onlineRequests.help')} result={onlineRequests(data, cur)} prev={onlineRequests(data, prev)} kind="num" />
        <MetricTile label={t('m.fast2h.label')} help={t('m.fast2h.help')} result={responseSpeed(data, cur)} prev={responseSpeed(data, prev)} pick={(v) => v.fastPct} kind="pct" />
        <MetricTile label={t('m.newPatients.label')} help={t('m.newPatients.help')} result={newPatients(data, cur)} prev={newPatients(data, prev)} kind="num" />
        <MetricTile label={t('m.igReach.label')} help={t('m.igReach.help')} result={ig} prev={instagramFunnel(data, prev)} pick={(v) => v.reach} kind="num" />
        <MetricTile label={t('m.costPerNew.label')} help={t('m.costPerNew.help')} result={adsReturn(data, cur)} prev={adsReturn(data, prev)} pick={(v) => v.costPerNewPatient} kind="eur2" goodWhen="down" />
      </TileGrid>

      <Card title={t('data.marketing.requestsPerMonth')} help={t('m.onlineRequests.help')}>
        <Metric result={onlineRequests(data, cur)}>{() => <SeriesBars points={series} kind="num" />}</Metric>
      </Card>

      <Card title={t('data.marketing.channels', { month: f.month(month) })}>
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
        {reviews.value && (
          <p className="mt-3 text-sm text-muted">
            {t('m.reviews.label')}: <span className="num font-semibold text-ink">{f.num(reviews.value.count)}</span>
            {reviews.value.average !== null && <> · Ø {f.num(reviews.value.average, 1)} / 5</>}
          </p>
        )}
      </Card>

      <Card title={t('data.marketing.monthly')}>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t('common.month')}</Th>
              <Th right help={t('m.onlineRequests.help')}>{t('m.onlineRequests.label')}</Th>
              <Th right help={t('m.fast2h.help')}>{t('data.col.fast')}</Th>
              <Th right>{t('data.col.newPatients')}</Th>
              <Th right>{t('data.col.viaWebsite')}</Th>
              <Th right>{t('data.col.viaGoogle')}</Th>
              <Th right>{t('data.col.viaInstagram')}</Th>
              <Th right>{t('data.col.noSource')}</Th>
            </tr>
          </thead>
          <tbody>
            {monthly.map(({ month: m, value }) => (
              <tr key={m} className={rowClass(m === month)}>
                <MonthCell month={m} />
                <Td right>{f.num(value.requests)}</Td>
                <Td right>{f.pct(value.speed?.fastPct)}</Td>
                <Td right strong>{f.num(value.channels?.newPatients)}</Td>
                <Td right>{f.num(via(value.channels?.rows, 'website'))}</Td>
                <Td right>{f.num(via(value.channels?.rows, 'google'))}</Td>
                <Td right>{f.num(via(value.channels?.rows, 'instagram'))}</Td>
                <Td right>{f.num(value.channels?.noSource)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('data.marketing.districts', { month: f.month(month) })}>
          <Metric result={districts}>
            {(rows) => (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>{t('data.col.district')}</Th>
                    <Th right>{t('data.col.newPatients')}</Th>
                    <Th right help={t('m.value6mShort.help')}>{t('m.value6mShort.label')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.district}>
                      <Td>{names.district(r.district)}</Td>
                      <Td right strong>{f.num(r.newPatients)}</Td>
                      <Td right>{f.eur(r.value6m)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Metric>
        </Card>

        <Card title={t('data.marketing.igTypes', { month: f.month(month) })}>
          <Metric result={igHalf}>
            {(v) => (
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
                  {v.byPostType.map((r) => (
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
            )}
          </Metric>
        </Card>
      </div>

      <Card title={t('data.marketing.igMonthly')}>
        <Metric result={ig}>
          {() => (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('common.month')}</Th>
                  <Th right help={t('m.igPosts.help')}>{t('data.col.posts')}</Th>
                  <Th right help={t('m.igReach.help')}>{t('data.col.reach')}</Th>
                  <Th right help={t('m.igProfileVisits.help')}>{t('data.col.profileVisits')}</Th>
                  <Th right help={t('m.igLinkClicks.help')}>{t('data.col.linkClicks')}</Th>
                  <Th right help={t('m.igMessages.help')}>{t('data.col.messages')}</Th>
                  <Th right help={t('m.igRequests.help')}>{t('data.col.requests')}</Th>
                  <Th right help={t('m.igNewPatients.help')}>{t('data.col.newPatients')}</Th>
                </tr>
              </thead>
              <tbody>
                {monthly.map(({ month: m, value }) => (
                  <tr key={m} className={rowClass(m === month)}>
                    <MonthCell month={m} />
                    <Td right>{f.num(value.ig?.posts)}</Td>
                    <Td right>{f.num(value.ig?.reach)}</Td>
                    <Td right>{f.num(value.ig?.profileVisits)}</Td>
                    <Td right>{f.num(value.ig?.linkClicks)}</Td>
                    <Td right>{f.num(value.ig?.messages)}</Td>
                    <Td right>{f.num(value.ig?.requests)}</Td>
                    <Td right strong>{f.num(value.ig?.newPatients)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Metric>
      </Card>
    </div>
  );
}

// ---------------- Patients & prevention ----------------
type SortKey = 'lastVisit' | 'totalBilled' | 'visits';

export function PatientsData() {
  const { t, f, names } = useT();
  const { data, cur, prev, month } = useMonth();
  const [sort, setSort] = useState<SortKey>('lastVisit');
  const [limit, setLimit] = useState(25);
  const series = useMemo(() => monthlySeries(data, 'patients_seen'), [data]);
  const monthly = useMemo(
    () =>
      perMonth(data, (flt) => ({
        seen: patientsSeen(data, flt).value,
        fresh: newPatients(data, flt).value,
        share: existingPatientsShare(data, flt).value,
        overdue: overduePatients(data, flt).value?.length ?? null,
        next: nextBookedRate(data, flt).value,
      })),
    [data],
  );
  const list = patientList(data, cur);
  const sorted = useMemo(() => {
    const rows = [...(list.value ?? [])];
    rows.sort((a, b) => (sort === 'lastVisit' ? (a.lastVisit < b.lastVisit ? 1 : a.lastVisit > b.lastVisit ? -1 : 0) : sort === 'totalBilled' ? b.totalBilled - a.totalBilled : b.visits - a.visits));
    return rows;
  }, [list.value, sort]);
  const share = existingPatientsShare(data, cur);
  const overdue = overduePatients(data, cur);
  return (
    <div className="space-y-4">
      <TileGrid cols={5}>
        <MetricTile label={t('m.patientsSeen.label')} help={t('m.patientsSeen.help')} result={patientsSeen(data, cur)} prev={patientsSeen(data, prev)} kind="num" />
        <MetricTile label={t('m.newPatients.label')} help={t('m.newPatients.help')} result={newPatients(data, cur)} prev={newPatients(data, prev)} kind="num" />
        <MetricTile label={t('m.existingShare.label')} help={t('m.existingShare.help')} result={share} prev={existingPatientsShare(data, prev)} pick={(v) => v.patientsPct} kind="pct" goodWhen="neutral" />
        <MetricTile label={t('m.overdue.label')} help={t('m.overdue.help')} result={overdue} prev={overduePatients(data, prev)} pick={(v) => v.length} kind="num" goodWhen="down" />
        <MetricTile label={t('m.nextBooked.label')} help={t('m.nextBooked.help')} result={nextBookedRate(data, cur)} prev={nextBookedRate(data, prev)} kind="pct" />
      </TileGrid>

      <Card title={t('data.patients.perMonth')} help={t('m.patientsSeen.help')}>
        <SeriesBars points={series} kind="num" />
      </Card>

      <Card title={t('data.patients.monthly')}>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t('common.month')}</Th>
              <Th right help={t('m.patientsSeen.help')}>{t('data.col.seen')}</Th>
              <Th right help={t('m.newPatients.help')}>{t('data.col.newPatients')}</Th>
              <Th right>{t('data.col.existing')}</Th>
              <Th right help={t('m.existingRevenueShare.help')}>{t('m.existingRevenueShare.label')}</Th>
              <Th right help={t('m.nextBooked.help')}>{t('data.col.nextBooked')}</Th>
              <Th right help={t('m.overdue.help')}>{t('data.col.overdue')}</Th>
            </tr>
          </thead>
          <tbody>
            {monthly.map(({ month: m, value }) => (
              <tr key={m} className={rowClass(m === month)}>
                <MonthCell month={m} />
                <Td right strong>{f.num(value.seen)}</Td>
                <Td right>{f.num(value.fresh)}</Td>
                <Td right>{f.num(value.share?.existing)}</Td>
                <Td right>{f.pct(value.share?.revenuePct)}</Td>
                <Td right>{f.pct(value.next)}</Td>
                <Td right>{f.num(value.overdue)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card
        title={t('data.patients.list')}
        action={
          <div role="group" aria-label={t('common.sortBy')} className="flex flex-wrap items-center gap-1 text-sm">
            <span className="mr-1 text-muted">{t('common.sortBy')}:</span>
            {(['lastVisit', 'totalBilled', 'visits'] as SortKey[]).map((k) => (
              <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)} className={cx('min-h-[40px] rounded-lg border px-3 font-medium', sort === k ? 'border-accent bg-accent text-white' : 'border-line bg-white text-ink hover:bg-bg')}>
                {t(`data.patients.sort.${k}`)}
              </button>
            ))}
          </div>
        }
      >
        <Metric result={list}>
          {() => (
            <>
              <TableWrap>
                <thead>
                  <tr>
                    <Th>{t('data.col.patient')}</Th>
                    <Th right>{t('data.col.lastVisit')}</Th>
                    <Th>{t('data.col.lastSeenBy')}</Th>
                    <Th right>{t('data.col.visits')}</Th>
                    <Th right>{t('data.col.totalBilled')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, limit).map((r) => (
                    <tr key={r.patientId}>
                      <Td>{r.patientId}</Td>
                      <Td right>{f.date(r.lastVisit)}</Td>
                      <Td>{names.staff(r.lastSeenBy)}</Td>
                      <Td right>{f.num(r.visits)}</Td>
                      <Td right strong>{f.eur(r.totalBilled)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">{t('common.rowsShown', { shown: f.num(Math.min(limit, sorted.length)), total: f.num(sorted.length) })}</p>
                {limit < sorted.length ? (
                  <button type="button" className="btn" onClick={() => setLimit((l) => l + 50)}>
                    {t('common.showMore')}
                  </button>
                ) : limit > 25 ? (
                  <button type="button" className="btn" onClick={() => setLimit(25)}>
                    {t('common.showLess')}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </Metric>
      </Card>
    </div>
  );
}

// ---------------- Treatment time & team ----------------
export function ChairsData() {
  const { t, f, names } = useT();
  const { data, cur, prev, month } = useMonth();
  const series = useMemo(() => monthlySeries(data, 'appointments'), [data]);
  const monthly = useMemo(() => perMonth(data, (flt) => treatmentTimeUsed(data, flt).value), [data]);
  const time = treatmentTimeUsed(data, cur);
  const timePrev = treatmentTimeUsed(data, prev);
  const missed = missedAppointments(data, cur);
  const missedPrev = missedAppointments(data, prev);
  const team = revenueByStaff(data, cur);
  const teamPrev = revenueByStaff(data, prev);
  const weekdays = weekdayUtilisation(data, cur);
  return (
    <div className="space-y-4">
      <TileGrid cols={5}>
        <MetricTile label={t('m.timeUsed.label')} help={t('m.timeUsed.help')} result={time} prev={timePrev} pick={(v) => v.usedPct} kind="pct" />
        <MetricTile label={t('m.appointments.label')} help={t('m.appointments.help')} result={appointmentCount(data, cur)} prev={appointmentCount(data, prev)} kind="num" />
        <MetricTile label={t('m.cancelled.label')} help={t('m.cancelled.help')} result={missed} prev={missedPrev} pick={(v) => v.cancelled} kind="num" goodWhen="down" />
        <MetricTile label={t('m.noShow.label')} help={t('m.noShow.help')} result={missed} prev={missedPrev} pick={(v) => v.noShow} kind="num" goodWhen="down" />
        <MetricTile label={t('m.neverBooked.label')} help={t('m.neverBooked.help')} result={time} prev={timePrev} pick={(v) => v.neverBooked} kind="num" goodWhen="down" />
      </TileGrid>

      <Card title={t('data.chairs.perMonth')} help={t('m.appointments.help')}>
        <SeriesBars points={series} kind="num" />
      </Card>

      <Card title={t('data.chairs.monthly')}>
        {monthly.every((m) => m.value === null) ? (
          <NotEnough reason={time.reason} source={time.missing} />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('common.month')}</Th>
                <Th right help={t('m.slots.help')}>{t('data.col.slots')}</Th>
                <Th right>{t('data.col.completed')}</Th>
                <Th right help={t('m.cancelled.help')}>{t('data.col.cancelled')}</Th>
                <Th right help={t('m.noShow.help')}>{t('data.col.noShow')}</Th>
                <Th right help={t('m.neverBooked.help')}>{t('data.col.neverBooked')}</Th>
                <Th right help={t('m.timeUsed.help')}>{t('data.col.used')}</Th>
              </tr>
            </thead>
            <tbody>
              {monthly.map(({ month: m, value }) => (
                <tr key={m} className={rowClass(m === month)}>
                  <MonthCell month={m} />
                  <Td right>{f.num(value?.slots)}</Td>
                  <Td right>{f.num(value?.completed)}</Td>
                  <Td right>{f.num(value?.cancelled)}</Td>
                  <Td right>{f.num(value?.noShow)}</Td>
                  <Td right>{f.num(value?.neverBooked)}</Td>
                  <Td right strong>{f.pct(value?.usedPct)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('data.chairs.team', { month: f.month(month) })}>
          <Metric result={team}>
            {(rows) => (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>{t('data.col.member')}</Th>
                    <Th right>{t('data.col.appointments')}</Th>
                    <Th right>{t('common.change')}</Th>
                    <Th right>{t('data.col.revenue')}</Th>
                    <Th right help={t('m.nextBooked.help')}>{t('data.col.nextBooked')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const before = teamPrev.value?.find((x) => x.staffId === r.staffId);
                    return (
                      <tr key={r.staffId}>
                        <Td>{names.staff(r.staffId)}</Td>
                        <Td right strong>{f.num(r.appointments)}</Td>
                        <Td right>{before ? <Delta value={r.appointments - before.appointments} text={f.numSigned(r.appointments - before.appointments)} /> : f.dash}</Td>
                        <Td right>{f.eur(r.revenue)}</Td>
                        <Td right>{f.pct(r.nextBookedPct)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </Metric>
        </Card>

        <Card title={t('data.chairs.weekdays', { month: f.month(month) })}>
          <Metric result={weekdays}>
            {(rows) => (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>{t('data.col.weekday')}</Th>
                    <Th right>{t('data.col.appointments')}</Th>
                    <Th right help={t('m.slots.help')}>{t('data.col.slots')}</Th>
                    <Th help={t('m.timeUsed.help')}>{t('data.col.used')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.weekday}>
                      <Td>{f.weekday(r.weekday)}</Td>
                      <Td right strong>{f.num(r.appointments)}</Td>
                      <Td right>{f.num(r.slots)}</Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <ShareBar pct={r.usedPct} />
                          <span className="num w-12 text-right">{f.pct(r.usedPct)}</span>
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Metric>
        </Card>
      </div>
    </div>
  );
}
