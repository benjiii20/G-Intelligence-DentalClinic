import { CheckCircle2, FileUp, ShieldAlert, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Card, PageLink, cx } from '../components/ui';
import { useT } from '../i18n';
import { buildDataset, processFile, type ProcessedFile } from '../import/build';
import { autoMap, detectType, readFile, refusedColumns, type Mapping, type Table } from '../import/mapping';
import { FIELDS, IMPORT_TYPES, type ImportType } from '../import/schema';
import { useStore } from '../state/store';

interface Staged {
  id: number;
  fileName: string;
  table: Table;
  type: ImportType;
  mapping: Mapping;
}

const DIFFICULTY: Record<ImportType, 'easy' | 'medium' | 'hard'> = {
  appointments: 'easy',
  plans: 'easy',
  patients: 'easy',
  recall: 'easy',
  requests: 'medium',
  instagram: 'easy',
  google_ads: 'easy',
};
const SAMPLES: Record<ImportType, string> = {
  appointments: 'termine.csv',
  plans: 'behandlungsplaene.csv',
  patients: 'patienten.csv',
  recall: 'recall.csv',
  requests: 'anfragen.csv',
  instagram: 'instagram.csv',
  google_ads: 'google-ads.csv',
};

let nextId = 1;

/** Blanks columns that must never be kept (names, contact, notes), right after reading. */
function scrub(table: Table): Table {
  const refused = refusedColumns(table).map((r) => r.index);
  if (!refused.length) return table;
  return { headers: table.headers, rows: table.rows.map((r) => r.map((c, i) => (refused.includes(i) ? null : c))) };
}

function FileCard({ staged, processed, onChange, onRemove }: { staged: Staged; processed: ProcessedFile; onChange: (s: Staged) => void; onRemove: () => void }) {
  const { t, f } = useT();
  const r = processed.report;
  const field = 'h-10 w-full min-w-[10rem] rounded-lg border border-line bg-white px-2 text-sm';
  return (
    <section className="rounded-lg border border-line bg-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{staged.fileName}</p>
          <p className="text-xs text-muted">{t('import.rows', { n: f.num(staged.table.rows.length) })}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('import.fileType')}</span>
            <select
              className={field}
              value={staged.type}
              onChange={(e) => {
                const type = e.target.value as ImportType;
                onChange({ ...staged, type, mapping: autoMap(type, staged.table.headers, refusedColumns(staged.table).map((x) => x.index)) });
              }}
            >
              {IMPORT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`import.type.${type}`)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={onRemove} aria-label={t('import.removeLabel', { file: staged.fileName })}>
            <Trash2 size={15} aria-hidden="true" />
            {t('import.remove')}
          </button>
        </div>
      </div>

      {r.refused.length > 0 && (
        <div className="mt-3 rounded-lg border border-[#E9C7A8] bg-[#FBF3EA] p-3 text-sm text-[#6B3410]">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldAlert size={16} aria-hidden="true" />
            {t('import.refusedTitle')}
          </p>
          <ul className="mt-1 space-y-0.5">
            {r.refused.map((c) => (
              <li key={c.index}>
                <span className="font-medium">„{c.header}“</span>: {t(`import.refused.${c.reason}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-3" open={r.missingRequired.length > 0}>
        <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold text-accent">{t('import.mapping')}</summary>
        <p className="mb-2 text-xs text-muted">{t('import.mappingHint')}</p>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {FIELDS[staged.type].map((fd) => (
            <label key={fd.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-2 text-sm">
              <span className="text-ink">
                {t(`import.field.${fd.key}`)}
                {fd.required && <span className="ml-1 text-xs text-loss">({t('import.required')})</span>}
              </span>
              <select
                className={field}
                value={staged.mapping[fd.key] ?? ''}
                onChange={(e) => onChange({ ...staged, mapping: { ...staged.mapping, [fd.key]: e.target.value === '' ? null : Number(e.target.value) } })}
              >
                <option value="">{t('import.noColumn')}</option>
                {staged.table.headers.map((h, i) => (
                  <option key={i} value={i} disabled={r.refused.some((c) => c.index === i)}>
                    {h || `#${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>

      <div className="mt-3 border-t border-line pt-3 text-sm">
        <p className="font-semibold text-ink">{t('import.report')}</p>
        {r.missingRequired.length > 0 ? (
          <p role="alert" className="mt-1 text-loss">
            {t('import.missingRequired', { fields: r.missingRequired.map((k) => t(`import.field.${k}`)).join(', ') })}
          </p>
        ) : (
          <>
            <p className="mt-1 text-ink">{t('import.ready', { ready: f.num(r.rowsReady), total: f.num(r.rowsTotal) })}</p>
            {r.issues.length === 0 ? (
              <p className="text-muted">{t('import.noIssues')}</p>
            ) : (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink">
                {r.issues.map((i) => (
                  <li key={i.key}>
                    {t(`import.issue.${i.key}`, { count: f.num(i.count) })} <span className="text-xs text-muted">{t('import.rowsAt', { rows: i.rows.join(', ') + (i.count > i.rows.length ? ' …' : '') })}</span>
                  </li>
                ))}
              </ul>
            )}
            {r.staffCount > 0 && <p className="mt-1 text-xs text-muted">{t('import.staffNote', { n: f.num(r.staffCount) })}</p>}
          </>
        )}
      </div>
    </section>
  );
}

export function Upload() {
  const { t } = useT();
  const loadRealData = useStore((s) => s.loadRealData);
  const mode = useStore((s) => s.base.mode);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [reading, setReading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const processed = useMemo(() => staged.map((s) => processFile(s.type, s.table, s.mapping, refusedColumns(s.table, s.mapping))), [staged]);
  const usable = processed.some((p) => p.report.rowsReady > 0);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    setNotes(null);
    const errs: string[] = [];
    const added: Staged[] = [];
    for (const file of Array.from(files)) {
      try {
        const table = scrub(await readFile(file));
        if (!table.headers.length) throw new Error('empty');
        const type = detectType(table.headers, file.name);
        added.push({ id: nextId++, fileName: file.name, table, type, mapping: autoMap(type, table.headers, refusedColumns(table).map((x) => x.index)) });
      } catch {
        errs.push(t('import.readError', { file: file.name }));
      }
    }
    setStaged((s) => [...s, ...added]);
    setErrors(errs);
    setReading(false);
    if (input.current) input.current.value = '';
  };

  const doImport = () => {
    const result = buildDataset(processed);
    loadRealData(result.data);
    setNotes(result.notes);
    // the staged copies (with the raw rows) are no longer needed
    setStaged([]);
  };

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <FileUp size={18} aria-hidden="true" className="text-accent" />
          {t('import.title')}
        </span>
      }
    >
      <p className="max-w-3xl text-sm leading-relaxed text-ink">{t('import.intro')}</p>

      <details className="mt-3">
        <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold text-accent">{t('import.which')}</summary>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {IMPORT_TYPES.map((type) => (
            <li key={type} className="rounded-lg bg-bg px-3 py-2">
              <span className="font-semibold">{t(`import.type.${type}`)}</span> <span className="text-xs text-muted">· {t(`import.${DIFFICULTY[type]}`)}</span>
              <span className="block text-[13px] text-muted">{t(`import.typeHint.${type}`)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink">
          {t('import.samples')}{' '}
          {IMPORT_TYPES.map((type, i) => (
            <span key={type}>
              <a className="font-medium text-accent underline underline-offset-2" href={`/samples/${SAMPLES[type]}`} download>
                {SAMPLES[type]}
              </a>
              {i < IMPORT_TYPES.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="btn-primary cursor-pointer focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-accent">
          <FileUp size={16} aria-hidden="true" />
          {t('import.choose')}
          <input ref={input} type="file" multiple accept=".csv,.txt,.xlsx,.xls,.xlsm" className="sr-only" onChange={(e) => void addFiles(e.target.files)} />
        </label>
        {reading && <span className="text-sm text-muted">{t('import.reading')}</span>}
      </div>
      {errors.map((e) => (
        <p key={e} role="alert" className="mt-2 text-sm text-loss">
          {e}
        </p>
      ))}

      {staged.length > 0 && (
        <div className="mt-4 space-y-3">
          {staged.map((s, i) => (
            <FileCard key={s.id} staged={s} processed={processed[i]} onChange={(next) => setStaged((all) => all.map((x) => (x.id === s.id ? next : x)))} onRemove={() => setStaged((all) => all.filter((x) => x.id !== s.id))} />
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" disabled={!usable} onClick={doImport}>
              {t('import.button')}
            </button>
            <span className="text-xs text-muted">{t('import.buttonHint')}</span>
          </div>
        </div>
      )}

      {notes && mode === 'real' && (
        <div role="status" className={cx('mt-4 rounded-lg bg-[#DDEFE6] p-3 text-sm text-[#124A33]')}>
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={16} aria-hidden="true" />
            {t('import.done')}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {notes.map((n) => (
              <li key={n}>{t(n)}</li>
            ))}
          </ul>
          <PageLink page="overview">{t('import.goOverview')}</PageLink>
        </div>
      )}
    </Card>
  );
}
