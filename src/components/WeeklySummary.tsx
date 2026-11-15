import { Mail, Printer, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { buildMoneyCards, buildStory } from '../insights/story';
import { useData, useStore } from '../state/store';

export function WeeklySummary() {
  const tools = useT();
  const { t, f } = tools;
  const open = useStore((s) => s.weeklyOpen);
  const setOpen = useStore((s) => s.setWeeklyOpen);
  const go = useStore((s) => s.go);
  const month = useStore((s) => s.month);
  const data = useData();
  const [emailed, setEmailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const story = useMemo(() => (open ? buildStory(data, month, tools) : null), [open, data, month, tools.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = useMemo(() => (open ? buildMoneyCards(data, month, tools) : null), [open, data, month, tools.lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setEmailed(false);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open || !story || !money) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="weekly-title" className="print-area w-full max-w-2xl rounded-card bg-white p-5 shadow-xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="weekly-title" className="text-xl font-bold tracking-tight">
              {t('weekly.title')}
            </h2>
            <p className="text-sm text-muted">{t('weekly.sub', { month: f.month(month) })}</p>
          </div>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={t('common.close')} className="no-print -m-2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-bg">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-5 font-display text-lg font-semibold leading-snug text-ink">{story.headline}</p>
        <div className="mt-2 space-y-1 text-sm leading-relaxed text-ink">
          {story.sentences.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>

        <h3 className="mb-2 mt-6 text-base font-semibold">{t('weekly.money')}</h3>
        <ul className="divide-y divide-line border-y border-line">
          {money.cards.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  go(c.page);
                }}
                className="grid w-full gap-x-4 gap-y-0.5 py-3 text-left hover:bg-bg sm:grid-cols-[7rem_minmax(0,1fr)]"
              >
                <span className="big-num text-lg font-semibold text-opp">{c.value === null ? f.dash : f.eur(Math.round(c.value / 100) * 100)}</span>
                <span>
                  <span className="block text-sm font-semibold text-ink">
                    {c.title} <span aria-hidden="true" className="no-print text-accent">→</span>
                  </span>
                  <span className="block text-[13px] leading-relaxed text-muted">{c.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-base font-semibold">{t('money.total', { total: f.eur(money.total) })}</p>

        <p className="mt-5 text-xs leading-relaxed text-muted">
          {t('weekly.footer')} {data.mode === 'demo' && t('weekly.demo')}
        </p>

        <div className="no-print mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" />
            {t('weekly.print')}
          </button>
          <button type="button" className="btn" onClick={() => setEmailed(true)}>
            <Mail size={16} aria-hidden="true" />
            {t('weekly.email')}
          </button>
        </div>
        {emailed && (
          <p role="status" className="no-print mt-3 rounded-lg bg-[#DDEFE6] px-3 py-2 text-sm text-[#124A33]">
            {t('weekly.emailDone')}
          </p>
        )}
      </div>
    </div>
  );
}
