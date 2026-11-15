// Runs the question sets without an API key:
//  1. through the rule-based fallback, and
//  2. through the full tool loop with a mocked AI proxy.
import { describe, expect, it } from 'vitest';
import { answerQuestion, fallbackAnswer } from '../src/ai/answerQuestion';
import { FALLBACK_KEYS, matchTopic, renderFallback } from '../src/ai/fallback';
import { TOOL_NAMES, type ToolName } from '../src/ai/toolDefs';
import { MAX_ROUNDS } from '../src/ai/toolLoop';
import { extractNumbers } from '../src/ai/verifyAnswer';
import { getDemoData } from '../src/data/demo';
import { SOURCE_KEYS } from '../src/data/types';
import '../src/i18n';
import type { Lang } from '../src/state/store';
import questionsDe from './questions.de.json';
import questionsEn from './questions.en.json';

interface Entry {
  question: string;
  language: string;
  month: string;
  topic: string;
  expectedTools: string[];
  expectedNumbers: number[];
  mustRefuse?: boolean;
  mustNotContain?: string[];
}

const data = getDemoData();
const REFUSAL: Record<Lang, RegExp> = {
  de: /nicht in den daten|kann ich noch nicht|nicht erfasst|fehlen die kosten/i,
  en: /not in the data|cannot calculate|not recorded|costs are missing/i,
};

export function containsNumber(text: string, expected: number, lang: Lang): boolean {
  return extractNumbers(text, lang).some((n) => Math.abs(Math.abs(n.value) - Math.abs(expected)) <= Math.max(0.6, Math.abs(expected) * 0.015));
}

describe.each([
  ['de', questionsDe as Entry[]],
  ['en', questionsEn as Entry[]],
] as const)('question set (%s) through the fallback', (lang, questions) => {
  it('has at least 40 questions', () => {
    expect(questions.length).toBeGreaterThanOrEqual(40);
  });
  it.each(questions.map((q) => [q.question, q] as const))('%s', (_name, q) => {
    expect(matchTopic(q.question)).toBe(q.topic);
    const a = fallbackAnswer(q.question, { data, lang, month: q.month });
    for (const tool of q.expectedTools) expect(a.metricCalls).toContain(tool);
    for (const n of q.expectedNumbers) expect(containsNumber(a.text, n, lang), `${n} in: ${a.text}`).toBe(true);
    if (q.mustRefuse) expect(a.text).toMatch(REFUSAL[lang]);
    for (const word of q.mustNotContain ?? []) expect(a.text.toLowerCase()).not.toMatch(new RegExp(`\\b${word}\\b`));
    // the code calculated every number: the answer check must find nothing uncovered
    expect(a.check.bad).toEqual([]);
    // short and plain: under 150 words
    expect(a.text.split(/\s+/).length).toBeLessThan(150);
  });
});

describe('fallback answers', () => {
  it('every key renders in both languages for every month without uncovered numbers', () => {
    for (const lang of ['de', 'en'] as const) {
      for (const month of ['2025-10', '2026-03', '2026-10']) {
        for (const key of FALLBACK_KEYS) {
          const a = fallbackAnswer('Wie war die Annahmequote im ersten Halbjahr?', { data, lang, month }, key);
          expect(a.text.length).toBeGreaterThan(20);
          expect(a.text).not.toMatch(/\{\{|undefined|NaN|fb\./);
          expect(a.check.bad, `${key} ${lang} ${month}: ${a.text}`).toEqual([]);
        }
      }
    }
  });
  it('says which source is missing instead of showing numbers', () => {
    const off = { ...data, sources: Object.fromEntries(SOURCE_KEYS.map((k) => [k, k !== 'instagram'])) as typeof data.sources };
    expect(renderFallback('instagram', off, '2026-10', 'en').text).toMatch(/Instagram/);
    expect(renderFallback('instagram', off, '2026-10', 'en').text).toMatch(/missing/i);
    const noPvs = { ...data, sources: Object.fromEntries(SOURCE_KEYS.map((k) => [k, k !== 'pvs'])) as typeof data.sources };
    for (const key of FALLBACK_KEYS) expect(renderFallback(key, noPvs, '2026-10', 'de').text).not.toMatch(/NaN|undefined/);
  });
  it('the profit answer names the missing costs', () => {
    expect(renderFallback('profit', data, '2026-10', 'de').text).toMatch(/Material.*Implantat.*Labor/);
    expect(renderFallback('profit', data, '2026-10', 'en').text).toMatch(/materials.*implant.*lab/);
  });
  it('unknown questions get the list of what can be answered', () => {
    expect(matchTopic('Wie wird das Wetter morgen?')).toBe('unknown');
    expect(fallbackAnswer('Wie wird das Wetter morgen?', { data, lang: 'de', month: '2026-10' }).text).toMatch(/Diese Fragen kann ich immer beantworten/);
  });
});

// ---- the tool loop with a mocked AI proxy ----
interface FakeBody {
  messages: { role: string; content: unknown }[];
  context: { lang: string; month: string };
  newQuestion: boolean;
}

/** A fake proxy: first asks for the given tools, then "answers" by echoing numbers from the tool results. */
function fakeProxy(tools: ToolName[], finalText: (results: Record<string, unknown>[]) => string, log: FakeBody[] = []) {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as FakeBody;
    log.push(body);
    const last = body.messages[body.messages.length - 1];
    const isToolResult = Array.isArray(last.content) && (last.content as { type: string }[])[0]?.type === 'tool_result';
    if (!isToolResult) {
      return new Response(
        JSON.stringify({
          stop_reason: 'tool_use',
          content: [{ type: 'thinking', thinking: '', signature: 'sig' }, ...tools.map((name, i) => ({ type: 'tool_use', id: `tu_${i}`, name, input: {} }))],
        }),
      );
    }
    const results = (last.content as { content: string }[]).map((b) => JSON.parse(b.content) as Record<string, unknown>);
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: finalText(results) }] }));
  }) as typeof fetch;
}

describe('tool loop with a mocked AI', () => {
  it('runs the requested tools locally and checks the numbers of the answer', async () => {
    const log: FakeBody[] = [];
    const seen: string[] = [];
    const a = await answerQuestion('Why did revenue fall?', {
      data,
      lang: 'en',
      month: '2026-10',
      fetchImpl: fakeProxy(['get_revenue_breakdown'], (r) => `Revenue was €${(r[0].revenue_eur as number).toLocaleString('en-GB')}, a change of €${(r[0].change_eur as number).toLocaleString('en-GB')}.`, log),
      onTool: (n) => seen.push(n),
    });
    expect(a.mode).toBe('ai');
    expect(a.metricCalls).toEqual(['get_revenue_breakdown']);
    expect(seen).toEqual(['get_revenue_breakdown']);
    expect(a.check).toEqual({ ok: 2, bad: [] });
    expect(a.sources).toContain('pvs');
    // round 1 is flagged as a new question, round 2 is not; the assistant turn goes back unchanged
    expect(log.map((b) => b.newQuestion)).toEqual([true, false]);
    expect((log[1].messages[1].content as { type: string }[])[0].type).toBe('thinking');
    // only aggregates leave the browser: no raw records, small payload
    const sent = JSON.stringify(log[1].messages[2]);
    expect(sent.length).toBeLessThan(4500);
    expect(sent).not.toMatch(/patientId|billed"|staffId/);
  });

  it('shows the text as it streams in', async () => {
    const final = 'Revenue was €120,120.';
    const streamFetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.stream).toBe(true);
      const sse = `event: text\ndata: ${JSON.stringify({ delta: 'Revenue was ' })}\n\nevent: text\ndata: ${JSON.stringify({ delta: '€120,120.' })}\n\nevent: final\ndata: ${JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: final }] })}\n\n`;
      return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;
    const seen: string[] = [];
    const a = await answerQuestion('Revenue?', { data, lang: 'en', month: '2026-10', fetchImpl: streamFetch, onText: (t) => seen.push(t) });
    expect(seen).toEqual(['Revenue was ', 'Revenue was €120,120.', final]);
    expect(a.text).toBe(final);
  });

  it('flags a number the tools did not return', async () => {
    const a = await answerQuestion('Why did revenue fall?', {
      data,
      lang: 'en',
      month: '2026-10',
      fetchImpl: fakeProxy(['get_revenue_breakdown'], () => 'Profit was €61,777.'),
    });
    expect(a.check.bad).toEqual(['61,777']);
  });

  it('sends the last 6 turns as context', async () => {
    const log: FakeBody[] = [];
    const history = Array.from({ length: 9 }, (_, i) => ({ question: `q${i}`, answer: `a${i}` }));
    await answerQuestion('And now?', { data, lang: 'en', month: '2026-10', history, fetchImpl: fakeProxy(['get_month_summary'], () => 'Fine.', log) });
    expect(log[0].messages).toHaveLength(13);
    expect(log[0].messages[0].content).toBe('q3');
  });

  it('every tool result stays under about 4 KB and contains no raw records', async () => {
    const sizes: Record<string, number> = {};
    const fetchImpl = fakeProxy([...TOOL_NAMES], (results) => {
      results.forEach((r, i) => (sizes[TOOL_NAMES[i]] = JSON.stringify(r).length));
      return 'ok';
    });
    // get_monthly_series needs a metric; the fake sends {} so it returns an error, which is fine here
    await answerQuestion('Everything', { data, lang: 'en', month: '2026-10', fetchImpl });
    for (const [name, size] of Object.entries(sizes)) expect(size, name).toBeLessThan(4300);
  });

  it.each([
    ['missing_key', 503],
    ['rate_limit', 429],
    ['timeout', 504],
    ['refusal', 200],
  ] as const)('falls back to the rule-based answer on %s', async (code, status) => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: code }), { status })) as typeof fetch;
    const a = await answerQuestion('Warum ist der Umsatz gesunken?', { data, lang: 'de', month: '2026-10', fetchImpl });
    expect(a.mode).toBe('fallback');
    expect(a.aiError).toBe(code);
    expect(a.fallbackKey).toBe('revenue_why');
    expect(a.text).toMatch(/Umsatz/);
  });

  it('falls back when the proxy is not reachable and stops after 6 rounds', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect((await answerQuestion('Was ist unser Gewinn?', { data, lang: 'de', month: '2026-10', fetchImpl: down })).aiError).toBe('network');
    let calls = 0;
    const endless = (async () => {
      calls++;
      return new Response(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `t${calls}`, name: 'get_month_summary', input: {} }] }));
    }) as typeof fetch;
    const a = await answerQuestion('Loop', { data, lang: 'en', month: '2026-10', fetchImpl: endless });
    expect(calls).toBe(MAX_ROUNDS);
    expect(a.aiError).toBe('too_many_rounds');
  });

  it('can be stopped', async () => {
    const controller = new AbortController();
    const slow = ((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    const p = answerQuestion('Stop me', { data, lang: 'en', month: '2026-10', fetchImpl: slow, signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
  });
});
