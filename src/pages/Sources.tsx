import { CheckCircle2, CircleOff, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card, cx } from '../components/ui';
import { SOURCE_KEYS, type EventType, type PracticeEvent, type SourceKey } from '../data/types';
import { useT } from '../i18n';
import { useData, useStore } from '../state/store';

const EVENT_TYPES: EventType[] = ['holiday', 'staff_change', 'campaign', 'price_change', 'closure', 'other'];

function SourceCard({ k }: { k: SourceKey }) {
  const { t, f, names } = useT();
  const data = useData();
  const real = data.mode === 'real';
  const on = data.sources[k];
  const lastSync = useStore((s) => s.lastSync[k]);
  const setConnected = useStore((s) => s.setConnected);
  const syncSource = useStore((s) => s.syncSource);
  const status = real ? t(on ? 'src.status.imported' : 'src.status.notImported') : t(on ? 'src.status.on' : 'src.status.off');
  return (
    <section className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug">{names.source(k)}</h3>
        <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold', on ? 'bg-[#DDEFE6] text-[#124A33]' : 'bg-bg text-muted')}>
          {on ? <CheckCircle2 size={14} aria-hidden="true" /> : <CircleOff size={14} aria-hidden="true" />}
          {status}
        </span>
      </div>
      <dl className="mt-3 space-y-2 text-sm leading-relaxed">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t('src.unlocks')}</dt>
          <dd>{t(`src.card.${k}.unlocks`)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t('src.access')}</dt>
          <dd className="text-muted">{t(`src.card.${k}.access`)}</dd>
        </div>
      </dl>
      {!real && (
        <div className="mt-auto pt-4">
          {on && <p className="mb-2 text-xs text-muted">{t('src.synced', { when: f.dateTime(lastSync) })}</p>}
          <div className="flex flex-wrap gap-2">
            {on ? (
              <>
                <button type="button" className="btn" onClick={() => syncSource(k)}>
                  <RefreshCw size={15} aria-hidden="true" />
                  {t('src.sync')}
                </button>
                <button type="button" className="btn" onClick={() => setConnected(k, false)}>
                  {t('src.disconnect')}
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary" onClick={() => setConnected(k, true)}>
                {t('src.connect')}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// Very small guard: an event description should not look like "Dr. Surname" or "Frau/Herr Surname".
const NAME_LIKE = /\b(dr\.?|frau|herr|mr\.?|mrs\.?|ms\.?)\s+[A-ZÄÖÜ][a-zäöüß]+/i;

function Label({ children, text }: { children: ReactNode; text: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{text}</span>
      {children}
    </label>
  );
}

function Events() {
  const { t, f, names } = useT();
  const data = useData();
  const userEvents = useStore((s) => s.userEvents);
  const addEvent = useStore((s) => s.addEvent);
  const removeEvent = useStore((s) => s.removeEvent);
  const month = useStore((s) => s.month);
  const [from, setFrom] = useState(`${month}-01`);
  const [to, setTo] = useState(`${month}-01`);
  const [type, setType] = useState<EventType>('holiday');
  const [description, setDescription] = useState('');
  const [staffId, setStaffId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const userIds = new Set(userEvents.map((e) => e.id));
  const list = data.events
    .filter((e) => !(e.type === 'closure' && e.from === e.to && !userIds.has(e.id)))
    .slice()
    .sort((a, b) => (a.from < b.from ? 1 : -1));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!from || !to || to < from || !description.trim()) return setError(t('src.events.invalid'));
    if (NAME_LIKE.test(description)) return setError(t('src.events.noNames'));
    const event: PracticeEvent = { id: `user-${Date.now()}`, from, to, type, description: description.trim().slice(0, 120), staffId: staffId || undefined };
    addEvent(event);
    setDescription('');
    setError(null);
  };
  const field = 'h-11 w-full rounded-lg border border-line bg-white px-3 text-sm';
  return (
    <Card title={t('src.events.title')}>
      <p className="mb-4 text-sm leading-relaxed text-muted">{t('src.events.intro')}</p>
      <form onSubmit={submit} className="grid gap-3 rounded-lg bg-bg p-3 sm:grid-cols-2 lg:grid-cols-[9.5rem_9.5rem_11rem_minmax(0,1fr)_11rem_auto] lg:items-end">
        <Label text={t('src.events.from')}>
          <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Label>
        <Label text={t('src.events.to')}>
          <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} required />
        </Label>
        <Label text={t('src.events.type')}>
          <select className={field} value={type} onChange={(e) => setType(e.target.value as EventType)}>
            {EVENT_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`eventType.${x}`)}
              </option>
            ))}
          </select>
        </Label>
        <Label text={t('src.events.description')}>
          <input type="text" className={field} value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} required />
        </Label>
        <Label text={t('src.events.staff')}>
          <select className={field} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">{t('src.events.staffNone')}</option>
            {data.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {names.staff(s.id)}
              </option>
            ))}
          </select>
        </Label>
        <button type="submit" className="btn-primary">
          {t('src.events.add')}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-loss">
          {error}
        </p>
      )}
      <ul className="mt-4 divide-y divide-line/70">
        {list.map((e) => {
          const own = userIds.has(e.id);
          return (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-ink">{names.event(e)}</p>
                <p className="text-[13px] text-muted">
                  {t(`eventType.${e.type}`)} · {e.from === e.to ? f.date(e.from) : `${f.date(e.from)} – ${f.date(e.to)}`}
                  {e.staffId && <> · {names.staff(e.staffId)}</>} · {t(own ? 'src.events.own' : 'src.events.sample')}
                </p>
              </div>
              {own && (
                <button type="button" className="btn" aria-label={t('src.events.removeLabel', { name: names.event(e) })} onClick={() => removeEvent(e.id)}>
                  <Trash2 size={15} aria-hidden="true" />
                  {t('src.events.remove')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function SourcesPage({ upload }: { upload?: ReactNode }) {
  const { t } = useT();
  const mode = useStore((s) => s.base.mode);
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm leading-relaxed text-muted">
        {t('src.intro')} {mode === 'demo' && t('src.demoNote')}
      </p>
      {upload}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {SOURCE_KEYS.map((k) => (
          <SourceCard key={k} k={k} />
        ))}
      </div>
      <Events />
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck size={18} aria-hidden="true" className="text-accent" />
            {t('src.gdpr.title')}
          </span>
        }
      >
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
          <li>{t('src.gdpr.text1')}</li>
          <li>{t('src.gdpr.text2')}</li>
          <li>{t('src.gdpr.text3')}</li>
        </ul>
      </Card>
    </div>
  );
}
