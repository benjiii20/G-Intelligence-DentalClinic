// One entry point for the chat: the UI does not care whether the AI or the fallback answered.
import type { Dataset, SourceKey } from '../data/types';
import type { Lang } from '../state/store';
import { matchTopic, renderFallback, type FallbackKey } from './fallback';
import { toolDef, type ToolName } from './toolDefs';
import { AiError, runAiLoop, type AiErrorCode, type Turn } from './toolLoop';
import { verifyAnswer, type Verification } from './verifyAnswer';

export interface AnswerContext {
  data: Dataset;
  lang: Lang;
  month: string;
  history?: Turn[];
  signal?: AbortSignal;
  onTool?: (name: ToolName) => void;
  onText?: (text: string) => void;
  /** skip the AI and answer by rules (tests, or when the proxy reports no key) */
  forceFallback?: boolean;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface Answer {
  mode: 'ai' | 'fallback';
  text: string;
  /** every number returned by the data queries behind this answer */
  numbers: number[];
  metricCalls: ToolName[];
  sources: SourceKey[];
  check: Verification;
  /** fallback answers are stored by key and re-rendered per language and month */
  fallbackKey?: FallbackKey;
  /** why the AI did not answer (shown as a friendly notice) */
  aiError?: AiErrorCode;
}

function yearsOf(data: Dataset): number[] {
  const out: number[] = [];
  for (let y = +data.firstMonth.slice(0, 4) - 1; y <= +data.lastMonth.slice(0, 4) + 1; y++) out.push(y);
  return out;
}

export function sourcesOf(calls: ToolName[], data: Dataset): SourceKey[] {
  const set = new Set<SourceKey>();
  for (const c of calls) for (const s of toolDef(c).sources) if (data.sources[s]) set.add(s);
  return [...set];
}

export function fallbackAnswer(question: string, ctx: Pick<AnswerContext, 'data' | 'lang' | 'month'>, key?: FallbackKey, aiError?: AiErrorCode): Answer {
  const fb = renderFallback(key ?? matchTopic(question), ctx.data, ctx.month, ctx.lang, question);
  return {
    mode: 'fallback',
    text: fb.text,
    numbers: fb.toolNumbers,
    metricCalls: fb.metricCalls,
    sources: sourcesOf(fb.metricCalls, ctx.data),
    check: verifyAnswer(fb.text, fb.toolNumbers, { lang: ctx.lang, question, years: yearsOf(ctx.data) }),
    fallbackKey: fb.key,
    aiError,
  };
}

export async function answerQuestion(question: string, ctx: AnswerContext): Promise<Answer> {
  if (ctx.forceFallback) return fallbackAnswer(question, ctx);
  try {
    const result = await runAiLoop(question, ctx);
    return {
      mode: 'ai',
      text: result.text,
      numbers: result.toolNumbers,
      metricCalls: result.metricCalls,
      sources: sourcesOf(result.metricCalls, ctx.data),
      check: verifyAnswer(result.text, result.toolNumbers, { lang: ctx.lang, question, years: yearsOf(ctx.data) }),
    };
  } catch (err) {
    const code: AiErrorCode = err instanceof AiError ? err.code : 'upstream';
    if (code === 'aborted') throw err;
    return fallbackAnswer(question, ctx, undefined, code);
  }
}
