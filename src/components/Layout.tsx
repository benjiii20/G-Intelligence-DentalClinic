import {
  Armchair,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  LayoutDashboard,
  Megaphone,
  Menu,
  MessageCircleQuestion,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { addMonths, monthsBetween } from '../data/dates';
import { useT } from '../i18n';
import { PAGES, useStore, type PageKey } from '../state/store';
import { cx } from './ui';

const ICONS: Record<PageKey, LucideIcon> = {
  overview: LayoutDashboard,
  revenue: TrendingUp,
  plans: ClipboardList,
  marketing: Megaphone,
  patients: Users,
  chairs: Armchair,
  ask: MessageCircleQuestion,
  sources: Database,
};

export function Banner() {
  const { t } = useT();
  const mode = useStore((s) => s.base.mode);
  const clearData = useStore((s) => s.clearData);
  // only the practice-check banner is shown: it holds the "delete data" button
  if (mode !== 'real') return null;
  return (
    <div role="status" className="no-print flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-[#DDEFE6] px-4 py-2 text-center text-[13px] leading-snug text-[#124A33]">
      <span>{t('banner.real')}</span>
      <button
        type="button"
        className="btn min-h-[36px] border-[#124A33]/30 bg-white/70 py-1"
        onClick={() => {
          if (window.confirm(t('banner.clearConfirm'))) clearData();
        }}
      >
        {t('banner.clear')}
      </button>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('min-h-[40px] min-w-[44px] rounded-md px-3 text-sm font-semibold transition-colors', o.value === value ? 'bg-accent text-white' : 'text-muted hover:bg-bg hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MonthPicker() {
  const { t, f } = useT();
  const month = useStore((s) => s.month);
  const first = useStore((s) => s.base.firstMonth);
  const last = useStore((s) => s.base.lastMonth);
  const setMonth = useStore((s) => s.setMonth);
  const stepMonth = useStore((s) => s.stepMonth);
  return (
    <div role="group" aria-label={t('header.month.label')} className="inline-flex items-center rounded-lg border border-line bg-white">
      <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-l-lg text-ink hover:bg-bg disabled:opacity-35" aria-label={t('header.month.prev')} disabled={addMonths(month, -1) < first} onClick={() => stepMonth(-1)}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <select aria-label={t('header.month.label')} value={month} onChange={(e) => setMonth(e.target.value)} className="h-11 min-w-[9.5rem] cursor-pointer border-x border-line bg-white px-2 text-center text-sm font-semibold text-ink">
        {monthsBetween(first, last).map((m) => (
          <option key={m} value={m}>
            {f.month(m)}
          </option>
        ))}
      </select>
      <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-r-lg text-ink hover:bg-bg disabled:opacity-35" aria-label={t('header.month.next')} disabled={addMonths(month, 1) > last} onClick={() => stepMonth(1)}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useT();
  const page = useStore((s) => s.page);
  const go = useStore((s) => s.go);
  return (
    <nav aria-label={t('nav.label')}>
      <ul className="space-y-1">
        {PAGES.map((p) => {
          const Icon = ICONS[p];
          const active = p === page;
          return (
            <li key={p}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  go(p);
                  onNavigate?.();
                }}
                className={cx('flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors', active ? 'bg-white/10 text-white' : 'text-[#C5C9D1] hover:bg-white/5 hover:text-white')}
              >
                <Icon size={18} aria-hidden="true" className={cx('shrink-0', active ? 'text-[#7FD6D0]' : '')} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{t(`nav.${p}.name`)}</span>
                  <span className="block truncate text-xs leading-tight text-[#A3A8B3]">{t(`nav.${p}.sub`)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Brand() {
  const { t } = useT();
  return (
    <div>
      <div className="font-display text-lg font-bold tracking-tight text-white">{t('app.name')}</div>
      <div className="text-xs text-[#A3A8B3]">{t('app.practice')}</div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t, f } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const page = useStore((s) => s.page);
  const view = useStore((s) => s.view);
  const lang = useStore((s) => s.lang);
  const month = useStore((s) => s.month);
  const setView = useStore((s) => s.setView);
  const setLang = useStore((s) => s.setLang);
  const setWeeklyOpen = useStore((s) => s.setWeeklyOpen);

  const sameInBoth = page === 'ask' || page === 'sources';
  const heading = view === 'insights' || sameInBoth ? t(`question.${page}`, { month: f.monthName(month) }) : t('header.dataSuffix', { page: t(`nav.${page}.name`) });

  return (
    <div className="min-h-screen">
      <Banner />
      <div className="lg:flex">
        {/* sidebar (desktop) */}
        <aside className="dark-surface no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-side p-4 lg:flex">
          <Brand />
          <Nav />
          <p className="mt-auto text-xs leading-relaxed text-[#A3A8B3]">{t('app.promise')}</p>
        </aside>

        {/* top menu (tablet / phone) */}
        <div className="dark-surface no-print sticky top-0 z-40 bg-side lg:hidden">
          <div className="flex items-center justify-between px-4 py-2">
            <Brand />
            <button type="button" aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => setMenuOpen((o) => !o)} className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white hover:bg-white/10">
              {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
              {menuOpen ? t('app.closeMenu') : t('app.menu')}
            </button>
          </div>
          {menuOpen && (
            <div id="mobile-nav" className="max-h-[70vh] overflow-y-auto px-3 pb-3">
              <Nav onNavigate={() => setMenuOpen(false)} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <header className="no-print border-b border-line bg-bg px-4 pb-3 pt-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <h1 className="min-w-0 max-w-3xl text-xl font-bold leading-tight tracking-tight text-ink sm:text-2xl">{heading}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  label={t('header.view.label')}
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'data', label: t('header.view.data') },
                    { value: 'insights', label: t('header.view.insights') },
                  ]}
                />
                <MonthPicker />
                <button type="button" className="btn" onClick={() => setWeeklyOpen(true)}>
                  <FileText size={16} aria-hidden="true" />
                  {t('header.weekly')}
                </button>
                <Segmented
                  label={t('header.lang.label')}
                  value={lang}
                  onChange={setLang}
                  options={[
                    { value: 'de', label: 'DE' },
                    { value: 'en', label: 'EN' },
                  ]}
                />
              </div>
            </div>
          </header>
          <main className="px-4 py-5 sm:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
