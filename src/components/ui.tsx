import { HelpCircle, PlugZap, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { SourceKey } from '../data/types';
import { useT } from '../i18n';
import type { MetricResult } from '../metrics/core';
import { useStore, type PageKey, type Selection } from '../state/store';

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

// ---------- cards & headings ----------
export function Card({ children, className, title, help, action }: { children: ReactNode; className?: string; title?: ReactNode; help?: string; action?: ReactNode }) {
  return (
    <section className={cx('card p-4 sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-1.5 text-base font-semibold leading-snug text-ink">
              {title}
              {help && <InfoTip text={help} label={typeof title === 'string' ? title : ''} />}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** The one-sentence answer every Insights page starts with. */
export function Answer({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card border-l-4 border-l-accent p-4 sm:p-5">
      <p className="font-display text-lg font-semibold leading-snug text-ink sm:text-xl">{children}</p>
      {sub && <p className="mt-2 text-sm leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'check' }) {
  const { t } = useT();
  return (
    <p className={cx('mt-3 rounded-lg px-3 py-2 text-sm leading-relaxed', tone === 'check' ? 'bg-[#FBF3EA] text-[#6B3410]' : 'bg-bg text-muted')}>
      {tone === 'check' && <strong className="font-semibold">{t('common.worthChecking')}: </strong>}
      {children}
    </p>
  );
}

// ---------- tooltip ----------
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const { t } = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={t('common.help', { label: label ?? '' })}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="-m-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-accent"
      >
        <HelpCircle size={15} aria-hidden="true" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 w-64 -translate-x-1/2 rounded-lg bg-side px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** A glossary term with its explanation (HKP, Recall, PZR, GKV/PKV, Eigenlabor). */
export function Term({ k }: { k: 'hkp' | 'recall' | 'pzr' | 'gkv' | 'lab' }) {
  const { t } = useT();
  const term = t(`glossary:${k}.term`);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="underline decoration-dotted underline-offset-2">{term}</span>
      <InfoTip text={t(`glossary:${k}.text`)} label={term} />
    </span>
  );
}

// ---------- change indicator: sign + arrow + colour (never colour alone) ----------
export function Delta({ value, text, goodWhen = 'up', className }: { value: number | null | undefined; text: string; goodWhen?: 'up' | 'down' | 'neutral'; className?: string }) {
  if (value == null || !isFinite(value)) return <span className={cx('text-muted', className)}>–</span>;
  const flat = Math.abs(value) < 1e-9;
  const good = goodWhen === 'neutral' || flat ? null : (value > 0) === (goodWhen === 'up');
  return (
    <span className={cx('num inline-flex items-center gap-1 whitespace-nowrap font-medium', good === null ? 'text-muted' : good ? 'text-gain' : 'text-loss', className)}>
      <span aria-hidden="true" className="text-[0.7em]">
        {flat ? '●' : value > 0 ? '▲' : '▼'}
      </span>
      {text}
    </span>
  );
}

// ---------- tiles ----------
export interface TileProps {
  label: string;
  value: ReactNode;
  help?: string;
  delta?: ReactNode;
  sub?: ReactNode;
  small?: boolean;
  onClick?: () => void;
  tone?: 'plain' | 'loss' | 'gain' | 'opp';
}

export function Tile({ label, value, help, delta, sub, small, onClick, tone = 'plain' }: TileProps) {
  const { t } = useT();
  const body = (
    <>
      <div className="flex items-center gap-1 text-[13px] font-medium text-muted">
        <span>{label}</span>
        {help && <InfoTip text={help} label={label} />}
      </div>
      <div className={cx('big-num mt-1 text-2xl font-semibold', tone === 'loss' && 'text-loss', tone === 'gain' && 'text-gain', tone === 'opp' && 'text-opp')}>{value}</div>
      {delta && <div className="mt-1 text-[13px]">{delta}</div>}
      {sub && <div className="mt-1 text-[13px] leading-snug text-muted">{sub}</div>}
      {small && <div className="mt-1 text-xs text-opp">{t('common.fewCases')}</div>}
    </>
  );
  if (onClick) {
    return (
      <div className="card p-4 transition-colors hover:border-accent">
        <button type="button" onClick={onClick} className="block w-full text-left">
          {body}
        </button>
      </div>
    );
  }
  return <div className="card p-4">{body}</div>;
}

export function TileGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const map = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 xl:grid-cols-4', 5: 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5' };
  return <div className={cx('grid grid-cols-1 gap-3', map[cols])}>{children}</div>;
}

// ---------- missing data ----------
export function NotEnough({ source, reason, compact }: { source?: SourceKey; reason?: 'missing_source' | 'too_few_records'; compact?: boolean }) {
  const { t, names } = useT();
  const go = useStore((s) => s.go);
  const missing = reason === 'missing_source' && source;
  return (
    <div className={cx('rounded-lg border border-dashed border-line bg-bg text-sm text-muted', compact ? 'px-3 py-2' : 'px-4 py-5')}>
      <p className="flex items-center gap-2 font-medium text-ink">
        <PlugZap size={16} aria-hidden="true" />
        {missing ? t('common.connect', { source: names.source(source) }) : t('common.notEnough')}
      </p>
      <p className="mt-1">{missing ? t('common.connectHint', { source: names.source(source) }) : t('common.tooFew')}</p>
      {missing && (
        <button type="button" className="btn mt-3" onClick={() => go('sources')}>
          {t('nav.sources.name')}
        </button>
      )}
    </div>
  );
}

/** Renders children with the metric value, or the "not enough data" box. */
export function Metric<T>({ result, children, compact }: { result: MetricResult<T>; children: (value: T, result: MetricResult<T>) => ReactNode; compact?: boolean }) {
  if (result.value === null) return <NotEnough source={result.missing} reason={result.reason} compact={compact} />;
  return <>{children(result.value, result)}</>;
}

// ---------- bars ----------
export interface BarDatum {
  key: string;
  label: string;
  value: number | null;
  title?: string;
}

/** Simple vertical bars, one per month; clicking a bar selects it. */
export function MonthBars({ data, selected, onSelect, format, height = 150 }: { data: BarDatum[]; selected?: string; onSelect?: (key: string) => void; format: (v: number) => string; height?: number }) {
  const { t } = useT();
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  return (
    <div>
      <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: height + 44 }}>
        {data.map((d) => {
          const h = d.value == null ? 0 : Math.max(3, Math.round((d.value / max) * height));
          const isSel = d.key === selected;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => onSelect?.(d.key)}
              disabled={!onSelect}
              aria-pressed={isSel}
              aria-label={`${d.title ?? d.label}: ${d.value == null ? '–' : format(d.value)}${isSel ? ` (${t('common.selected')})` : ''}`}
              title={`${d.title ?? d.label}: ${d.value == null ? '–' : format(d.value)}`}
              className="group flex min-w-[44px] flex-1 flex-col items-center justify-end gap-1 rounded-md pt-1"
              style={{ height: height + 40 }}
            >
              <span className={cx('num text-[11px] leading-none', isSel ? 'font-semibold text-ink' : 'text-muted')}>{d.value == null ? '' : format(d.value)}</span>
              <span className={cx('w-full max-w-[46px] rounded-t-md transition-colors', isSel ? 'bg-accent' : 'bg-[#C9D8D6] group-hover:bg-[#9DBDB9]')} style={{ height: h }} />
              <span className={cx('whitespace-nowrap text-[11px] leading-none', isSel ? 'font-semibold text-ink underline underline-offset-2' : 'text-muted')}>{d.label}</span>
            </button>
          );
        })}
      </div>
      {onSelect && <p className="mt-1 text-xs text-muted">{t('common.clickBar')}</p>}
    </div>
  );
}

/** Horizontal bar with a centre line: red to the left for losses, green to the right for gains. */
export function DivergingRow({ label, value, max, text, sub, onClick, active }: { label: ReactNode; value: number; max: number; text: string; sub?: ReactNode; onClick?: () => void; active?: boolean }) {
  const w = max > 0 ? Math.min(50, (Math.abs(value) / max) * 50) : 0;
  const neg = value < 0;
  const inner = (
    <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_7.5rem]">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        {sub && <div className="text-[13px] leading-snug text-muted">{sub}</div>}
      </div>
      <div className="relative h-5 rounded bg-bg" aria-hidden="true">
        <span className="absolute inset-y-0 left-1/2 w-px bg-[#B9B9B2]" />
        <span className={cx('absolute inset-y-0.5 rounded-sm', neg ? 'bg-loss' : 'bg-gain')} style={neg ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }} />
      </div>
      <div className="text-right text-sm">
        <Delta value={value} text={text} />
      </div>
    </div>
  );
  if (!onClick) return inner;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cx('row-btn px-2', active && 'bg-bg ring-1 ring-accent')}>
      {inner}
    </button>
  );
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  text: string;
  pattern?: boolean;
}

/** One stacked horizontal bar with a legend that repeats every value as text. */
export function StackedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-lg" role="img" aria-label={segments.map((s) => `${s.label}: ${s.text}`).join(', ')}>
        {segments.map((s) => (
          <span
            key={s.key}
            style={{
              width: `${(Math.max(0, s.value) / total) * 100}%`,
              backgroundColor: s.color,
              backgroundImage: s.pattern ? 'repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 4px, transparent 4px 8px)' : undefined,
            }}
            title={`${s.label}: ${s.text}`}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-x-5 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {segments.map((s) => (
          <li key={s.key} className="flex items-start gap-2">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-sm"
              style={{
                backgroundColor: s.color,
                backgroundImage: s.pattern ? 'repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 2px, transparent 2px 4px)' : undefined,
              }}
              aria-hidden="true"
            />
            <span>
              <span className="text-muted">{s.label}</span>
              <br />
              <span className="num font-semibold text-ink">{s.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Thin horizontal share bar for tables and lists. */
export function ShareBar({ pct, color = '#0E6B6B' }: { pct: number | null; color?: string }) {
  return (
    <span className="block h-2 w-full min-w-[60px] overflow-hidden rounded bg-bg" aria-hidden="true">
      <span className="block h-full rounded" style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%`, backgroundColor: color }} />
    </span>
  );
}

// ---------- tables ----------
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
      <table className="w-full min-w-[520px] border-collapse">{children}</table>
    </div>
  );
}

export const Th = ({ children, right, help }: { children?: ReactNode; right?: boolean; help?: string }) => (
  <th scope="col" className={cx('th', right && 'text-right')}>
    <span className={cx('inline-flex items-center gap-1', right && 'justify-end')}>
      {children}
      {help && <InfoTip text={help} />}
    </span>
  </th>
);
export const Td = ({ children, right, strong, className }: { children?: ReactNode; right?: boolean; strong?: boolean; className?: string }) => (
  <td className={cx('td', right && 'num text-right', strong && 'font-semibold', className)}>{children}</td>
);

// ---------- layout helpers ----------
/** Main column plus a detail panel next to it (below it on small screens). */
export function WithPanel({ children, panel }: { children: ReactNode; panel: ReactNode }) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">{children}</div>
      <aside className="xl:sticky xl:top-4">{panel}</aside>
    </div>
  );
}

export function Panel({ title, onClose, children }: { title: ReactNode; onClose?: () => void; children: ReactNode }) {
  const { t } = useT();
  return (
    <section className="card p-4 sm:p-5" aria-live="polite">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold leading-snug">{title}</h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="-m-2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-bg">
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function PageLink({ page, selection, children }: { page: PageKey; selection?: Selection; children: ReactNode }) {
  const go = useStore((s) => s.go);
  return (
    <button type="button" onClick={() => go(page, selection ?? null)} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-accent underline-offset-2 hover:underline">
      {children} <span aria-hidden="true">→</span>
    </button>
  );
}

export function KeyVal({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2 text-sm last:border-0">
      <span className="text-muted">{k}</span>
      <span className="num text-right font-medium text-ink">{v}</span>
    </div>
  );
}

export function SourcesLine({ sources }: { sources: SourceKey[] }) {
  const { t, names } = useT();
  const unique = [...new Set(sources)];
  if (!unique.length) return null;
  return (
    <p className="mt-3 text-xs text-muted">
      {t('common.sources')}: {unique.map((s) => names.source(s)).join(', ')}
    </p>
  );
}
