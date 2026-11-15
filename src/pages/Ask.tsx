import { Bot, Send, Square, Trash2, User } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { answerQuestion, fallbackAnswer, type Answer } from '../ai/answerQuestion';
import { toolDef, type ToolName } from '../ai/toolDefs';
import { Card, cx } from '../components/ui';
import { useT } from '../i18n';
import { currentData, useData, useStore } from '../state/store';

interface Entry {
  id: number;
  question: string;
  status: 'working' | 'done' | 'stopped';
  tools: ToolName[];
  /** partial text while the answer is being written */
  partial: string;
  answer?: Answer;
}

interface ChatState {
  entries: Entry[];
  /** null = not checked yet */
  aiAvailable: boolean | null;
  add: (e: Entry) => void;
  patch: (id: number, p: Partial<Entry>) => void;
  clear: () => void;
  setAi: (ok: boolean) => void;
}

export const useChat = create<ChatState>((set) => ({
  entries: [],
  aiAvailable: null,
  add: (e) => set((s) => ({ entries: [...s.entries, e] })),
  patch: (id, p) => set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...p } : e)) })),
  clear: () => set({ entries: [] }),
  setAi: (aiAvailable) => set({ aiAvailable }),
}));

// answers belong to the data they were given for: a new dataset starts a new chat
useStore.subscribe((s, prev) => {
  if (s.base !== prev.base) useChat.getState().clear();
});

let nextId = 1;
let controller: AbortController | null = null;

/** Minimal markdown: **bold** and "- " bullets. Everything else is plain text. */
export function SimpleMarkdown({ text }: { text: string }) {
  const bold = (line: string): ReactNode[] =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`u${blocks.length}`} className="my-1.5 list-disc space-y-1 pl-5">
        {bullets.map((b, i) => (
          <li key={i}>{bold(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const m = line.match(/^[-•*]\s+(.*)$/);
    if (m) bullets.push(m[1]);
    else {
      flush();
      blocks.push(
        <p key={`p${blocks.length}`} className="my-1.5">
          {bold(line.replace(/^#+\s*/, ''))}
        </p>,
      );
    }
  }
  flush();
  return <div className="text-[15px] leading-relaxed text-ink">{blocks}</div>;
}

function ToolChips({ tools }: { tools: ToolName[] }) {
  const { t, lang } = useT();
  const unique = [...new Set(tools)];
  if (!unique.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-semibold text-muted">{t('ask.queries')}:</span>
      {unique.map((name) => (
        <span key={name} className="rounded-full border border-line bg-bg px-2 py-0.5 text-ink">
          {toolDef(name).label[lang]}
        </span>
      ))}
    </div>
  );
}

function AnswerView({ entry }: { entry: Entry }) {
  const { t, lang, names } = useT();
  const data = useData();
  const month = useStore((s) => s.month);
  if (entry.status === 'working') {
    return (
      <div aria-live="polite">
        {entry.partial ? <SimpleMarkdown text={entry.partial} /> : <p className="text-sm text-muted">{t('ask.working')}</p>}
        <ToolChips tools={entry.tools} />
      </div>
    );
  }
  if (entry.status === 'stopped' || !entry.answer) return <p className="text-sm text-muted">{t('ask.stopped')}</p>;
  // rule-based answers are stored by key and re-rendered in the current language and month
  const a = entry.answer.mode === 'fallback' ? fallbackAnswer(entry.question, { data, lang, month }, entry.answer.fallbackKey, entry.answer.aiError) : entry.answer;
  const errorKey = a.aiError && ['missing_key', 'rate_limit', 'timeout', 'refusal', 'network'].includes(a.aiError) ? a.aiError : 'other';
  return (
    <div>
      {a.mode === 'fallback' && a.aiError && <p className="mb-2 rounded-lg bg-[#FBF3EA] px-3 py-2 text-sm text-[#6B3410]">{t(`ask.error.${errorKey}`)}</p>}
      <SimpleMarkdown text={a.text} />
      <ToolChips tools={a.metricCalls} />
      {a.metricCalls.length > 0 && (
        <p className={cx('mt-2 text-xs font-medium', a.check.bad.length ? 'text-loss' : 'text-gain')}>
          {a.check.bad.length ? t('ask.checkBad', { list: a.check.bad.join(', ') }) : a.check.ok > 0 ? t('ask.checkOk', { count: a.check.ok }) : <span className="text-muted">{t('ask.checkNone')}</span>}
        </p>
      )}
      {a.sources.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          {t('common.sources')}: {a.sources.map((s) => names.source(s)).join(', ')}
        </p>
      )}
    </div>
  );
}

const CHIPS = ['chips.q1', 'chips.q2', 'chips.q3', 'chips.q4', 'chips.q5', 'chips.q6', 'chips.q7', 'chips.q8', 'chips.q9', 'chips.q10'];

export function AskPage() {
  const { t, lang } = useT();
  const entries = useChat((s) => s.entries);
  const aiAvailable = useChat((s) => s.aiAvailable);
  const askDraft = useStore((s) => s.askDraft);
  const clearAskDraft = useStore((s) => s.clearAskDraft);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const busy = entries.some((e) => e.status === 'working');

  useEffect(() => {
    if (useChat.getState().aiAvailable !== null) return;
    fetch('/api/health')
      .then((r) => r.json())
      .then((j: { ai?: boolean }) => useChat.getState().setAi(j.ai === true))
      .catch(() => useChat.getState().setAi(false));
  }, []);

  const ask = async (question: string) => {
    const q = question.trim().slice(0, 500);
    if (!q || useChat.getState().entries.some((e) => e.status === 'working')) return;
    const id = nextId++;
    const chat = useChat.getState();
    const history = chat.entries.filter((e) => e.status === 'done' && e.answer).map((e) => ({ question: e.question, answer: e.answer!.text }));
    chat.add({ id, question: q, status: 'working', tools: [], partial: '' });
    setInput('');
    controller = new AbortController();
    const { month, lang: language } = useStore.getState();
    try {
      const answer = await answerQuestion(q, {
        data: currentData(),
        lang: language,
        month,
        history,
        signal: controller.signal,
        forceFallback: useChat.getState().aiAvailable === false,
        onTool: (name) => {
          const cur = useChat.getState().entries.find((e) => e.id === id);
          if (cur) useChat.getState().patch(id, { tools: [...cur.tools, name] });
        },
        onText: (text) => useChat.getState().patch(id, { partial: text }),
      });
      if (answer.aiError === 'missing_key') useChat.getState().setAi(false);
      useChat.getState().patch(id, { status: 'done', answer });
    } catch {
      // only a user stop ends up here: every other failure is answered by the fallback
      useChat.getState().patch(id, { status: 'stopped' });
    } finally {
      controller = null;
    }
  };

  useEffect(() => {
    if (!askDraft) return;
    clearAskDraft();
    void ask(askDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askDraft]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [entries]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="rounded-lg border border-line bg-white px-4 py-3 text-sm leading-relaxed text-muted">{t(aiAvailable === false ? 'ask.infoFallback' : 'ask.info')}</p>

      <Card>
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('ask.empty')}</p>
        ) : (
          <ol className="space-y-5">
            {entries.map((e) => (
              <li key={e.id} className="space-y-3">
                <div className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg text-muted" aria-hidden="true">
                    <User size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted">{t('ask.you')}</p>
                    <p className="text-[15px] font-medium text-ink">{e.question}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white" aria-hidden="true">
                    <Bot size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-muted">{e.answer?.mode === 'fallback' ? t('ask.rules') : t('ask.analyst')}</p>
                    <AnswerView entry={e} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />

        <form
          className="mt-5 flex flex-wrap items-end gap-2 border-t border-line pt-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            void ask(input);
          }}
        >
          <label className="min-w-0 flex-1 basis-64">
            <span className="sr-only">{t('ask.inputLabel')}</span>
            <input
              type="text"
              value={input}
              maxLength={500}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('ask.placeholder')}
              className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px]"
              lang={lang}
            />
          </label>
          {busy ? (
            <button type="button" className="btn" onClick={() => controller?.abort()}>
              <Square size={15} aria-hidden="true" />
              {t('ask.stop')}
            </button>
          ) : (
            <button type="submit" className="btn-primary" disabled={!input.trim()}>
              <Send size={15} aria-hidden="true" />
              {t('ask.send')}
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={entries.length === 0}
            onClick={() => {
              controller?.abort();
              useChat.getState().clear();
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
            {t('ask.clear')}
          </button>
        </form>
      </Card>

      <Card title={t('ask.suggested')}>
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((k) => (
            <button key={k} type="button" disabled={busy} onClick={() => void ask(t(k))} className="min-h-[44px] rounded-full border border-line bg-white px-4 text-left text-sm font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50">
              {t(k)}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
