// The tool loop. The data stays in the browser: the proxy returns the model's tool requests,
// the browser runs the metric functions locally and sends back only the small JSON results.
import type { Dataset } from '../data/types';
import { makeNames, translator } from '../i18n';
import { runTool, type ToolContext } from '../metrics/registry';
import type { Lang } from '../state/store';
import { isToolName, type ToolName } from './toolDefs';
import { collectNumbers } from './verifyAnswer';

export type AiErrorCode = 'missing_key' | 'rate_limit' | 'timeout' | 'bad_request' | 'refusal' | 'upstream' | 'too_large' | 'forbidden' | 'network' | 'aborted' | 'too_many_rounds';

export class AiError extends Error {
  constructor(public code: AiErrorCode) {
    super(code);
  }
}

export interface Turn {
  question: string;
  answer: string;
}

export interface LoopOptions {
  data: Dataset;
  lang: Lang;
  month: string;
  /** earlier turns of this chat (text only); the last 6 are sent as context */
  history?: Turn[];
  signal?: AbortSignal;
  /** called when the model asks for a tool, before it runs */
  onTool?: (name: ToolName) => void;
  /** called with the answer text as it becomes available */
  onText?: (text: string) => void;
  /** proxy address; default is the app's own origin */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  session?: string;
}

export interface LoopResult {
  text: string;
  metricCalls: ToolName[];
  /** every number returned by a tool in this question */
  toolNumbers: number[];
}

export const MAX_ROUNDS = 6;
export const HISTORY_TURNS = 6;
const CLIENT_TIMEOUT_MS = 60_000;

interface Block {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}
interface Message {
  role: 'user' | 'assistant';
  content: string | unknown[];
}

let sessionId: string | null = null;
function getSession(): string {
  if (sessionId) return sessionId;
  const fresh = `s-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    sessionId = sessionStorage.getItem('gi.session') ?? fresh;
    sessionStorage.setItem('gi.session', sessionId);
  } catch {
    sessionId = fresh;
  }
  return sessionId;
}

export function toolContext(data: Dataset, month: string): ToolContext {
  // tool results are for the model, so labels are always English
  const names = makeNames(translator('en'), data.staff);
  return { month, staffName: names.staff, eventText: names.event };
}

export async function runAiLoop(question: string, opts: LoopOptions): Promise<LoopResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const ctx = toolContext(opts.data, opts.month);
  const messages: Message[] = [];
  for (const turn of (opts.history ?? []).slice(-HISTORY_TURNS)) {
    messages.push({ role: 'user', content: turn.question });
    messages.push({ role: 'assistant', content: turn.answer });
  }
  messages.push({ role: 'user', content: question });

  const metricCalls: ToolName[] = [];
  const toolNumbers: number[] = [];
  const context = { lang: opts.lang, month: opts.month, firstMonth: opts.data.firstMonth, lastMonth: opts.data.lastMonth, demo: opts.data.mode === 'demo' };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (opts.signal?.aborted) throw new AiError('aborted');
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), CLIENT_TIMEOUT_MS);
    const onAbort = () => timeout.abort();
    opts.signal?.addEventListener('abort', onAbort);
    let reply: { content?: Block[]; stop_reason?: string | null; error?: AiErrorCode };
    try {
      const res = await doFetch(`${opts.baseUrl ?? ''}/api/ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-gi-session': opts.session ?? getSession() },
        body: JSON.stringify({ messages, context, newQuestion: round === 0 }),
        signal: timeout.signal,
      });
      try {
        reply = (await res.json()) as typeof reply;
      } catch {
        // no JSON: usually the proxy is not running
        throw new AiError(res.status === 504 ? 'timeout' : res.status >= 500 ? 'network' : 'upstream');
      }
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (opts.signal?.aborted) throw new AiError('aborted');
      throw new AiError(timeout.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
    if (reply.error) throw new AiError(reply.error);
    const content = Array.isArray(reply.content) ? reply.content : [];
    const toolUses = content.filter((b) => b.type === 'tool_use');

    if (reply.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const text = content
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (!text) throw new AiError('upstream');
      opts.onText?.(text);
      return { text, metricCalls, toolNumbers };
    }

    // the assistant turn goes back unchanged (it may contain thinking blocks that must not be edited)
    messages.push({ role: 'assistant', content });
    const results: unknown[] = [];
    for (const use of toolUses) {
      let output: Record<string, unknown>;
      if (!isToolName(use.name)) output = { error: 'Unknown tool.' };
      else {
        opts.onTool?.(use.name);
        metricCalls.push(use.name);
        output = runTool(opts.data, use.name, use.input, ctx);
        collectNumbers(output, toolNumbers);
      }
      results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(output), ...(output.error ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results });
  }
  throw new AiError('too_many_rounds');
}
