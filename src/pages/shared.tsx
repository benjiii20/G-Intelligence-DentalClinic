import { useMemo, type ReactNode } from 'react';
import { Delta, MonthBars, Tile, type TileProps } from '../components/ui';
import { addMonths, monthsBetween } from '../data/dates';
import type { Dataset } from '../data/types';
import { useT } from '../i18n';
import { monthFilter, type Filter, type MetricResult } from '../metrics/core';
import { useData, useStore } from '../state/store';

export interface MonthCtx {
  data: Dataset;
  month: string;
  prevMonth: string;
  hasPrev: boolean;
  cur: Filter;
  prev: Filter;
  months: string[];
  /** the 6 months up to the selected month (clamped to the data range) */
  half: Filter;
  /** all data up to the selected month */
  toDate: Filter;
}

export function useMonth(): MonthCtx {
  const data = useData();
  const month = useStore((s) => s.month);
  return useMemo(() => {
    const prevMonth = addMonths(month, -1);
    const cur = monthFilter(month);
    const halfStart = addMonths(month, -5) < data.firstMonth ? data.firstMonth : addMonths(month, -5);
    return {
      data,
      month,
      prevMonth,
      hasPrev: prevMonth >= data.firstMonth,
      cur,
      prev: monthFilter(prevMonth),
      months: monthsBetween(data.firstMonth, data.lastMonth),
      half: { from: `${halfStart}-01`, to: cur.to },
      toDate: { from: `${data.firstMonth}-01`, to: cur.to },
    };
  }, [data, month]);
}

type Kind = 'eur' | 'num' | 'pct' | 'eur2';

/** "▲ +12.300 € (+10 %) ggü. September" */
export function Change({ cur, prev, kind, goodWhen = 'up', label }: { cur: number | null | undefined; prev: number | null | undefined; kind: Kind; goodWhen?: 'up' | 'down' | 'neutral'; label?: boolean }) {
  const { t, f } = useT();
  const prevMonth = addMonths(useStore((s) => s.month), -1);
  if (cur == null || prev == null) return null;
  const diff = cur - prev;
  let text: string;
  if (kind === 'pct') {
    const r = Math.round(diff);
    const key = r < 0 ? 'common.downFrom' : r > 0 ? 'common.upFrom' : 'common.sameAs';
    return <Delta value={r} text={t(key, { value: f.pct(prev), month: f.monthName(prevMonth) })} goodWhen={goodWhen} />;
  }
  if (kind === 'eur' || kind === 'eur2') {
    text = f.eurSigned(diff);
    if (prev !== 0 && kind === 'eur') text += ` (${f.pctSigned((diff / prev) * 100)})`;
  } else {
    text = f.numSigned(diff);
    if (prev !== 0) text += ` (${f.pctSigned((diff / prev) * 100)})`;
  }
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <Delta value={diff} text={text} goodWhen={goodWhen} />
      {label !== false && <span className="text-muted">{t('common.vsPrev', { month: f.monthName(prevMonth) })}</span>}
    </span>
  );
}

/** A tile for a metric result with automatic "not enough data" handling. */
export function MetricTile<T>({
  label,
  help,
  result,
  prev,
  pick,
  kind,
  goodWhen,
  onClick,
  sub,
}: {
  label: string;
  help?: string;
  result: MetricResult<T>;
  prev?: MetricResult<T> | null;
  pick?: (v: T) => number | null;
  kind: Kind;
  goodWhen?: 'up' | 'down' | 'neutral';
  onClick?: TileProps['onClick'];
  sub?: ReactNode;
}) {
  const { t, f, names } = useT();
  const get = (r: MetricResult<T> | null | undefined): number | null => {
    if (!r || r.value === null) return null;
    return pick ? pick(r.value) : (r.value as unknown as number);
  };
  const v = get(result);
  if (v === null) {
    return (
      <Tile
        label={label}
        help={help}
        value={<span className="text-base font-medium text-muted">{t('common.notEnough')}</span>}
        sub={result.missing ? t('common.notEnoughSource', { source: names.source(result.missing) }) : t('common.tooFew')}
      />
    );
  }
  const text = kind === 'eur' ? f.eur(v) : kind === 'eur2' ? f.eur(v, 0) : kind === 'pct' ? f.pct(v) : f.num(v, Number.isInteger(v) ? 0 : 1);
  return <Tile label={label} help={help} value={text} delta={<Change cur={v} prev={get(prev)} kind={kind} goodWhen={goodWhen} />} small={result.small} onClick={onClick} sub={sub} />;
}

/** Month bars bound to the month selector. */
export function SeriesBars({ points, kind }: { points: { month: string; value: number | null }[]; kind: 'eur' | 'num' | 'pct' }) {
  const { t, f } = useT();
  const month = useStore((s) => s.month);
  const setMonth = useStore((s) => s.setMonth);
  const format = (v: number) => (kind === 'eur' ? t('common.kShort', { n: f.num(v / 1000, 0) }) : kind === 'pct' ? f.pct(v) : f.num(v));
  return <MonthBars data={points.map((p) => ({ key: p.month, label: f.monthShort(p.month), title: f.month(p.month), value: p.value }))} selected={month} onSelect={setMonth} format={format} />;
}

/** Table row highlighting for the selected month. */
export const rowClass = (isSelected: boolean): string => (isSelected ? 'bg-[#EEF5F4] font-semibold' : '');
