// The AI proxy: the only server part of the app, and its only external call.
// It is stateless. It never receives uploaded files or raw records: the browser runs the
// tools and sends back aggregates only. It logs timing, token counts and tool names,
// never question text or tool results.
import Anthropic from '@anthropic-ai/sdk';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { TOOL_DEFS, isToolName } from '../src/ai/toolDefs';
import { buildSystemPrompt, type PromptContext } from './prompt';

export type ProxyErrorCode = 'missing_key' | 'rate_limit' | 'timeout' | 'bad_request' | 'refusal' | 'upstream' | 'too_large' | 'forbidden';

export interface ProxyReply {
  content: unknown[];
  stop_reason: string | null;
}

/** The slice of the Anthropic client the proxy uses (lets tests inject a fake). */
export interface ModelClient {
  create(params: Record<string, unknown>, options: { signal: AbortSignal }): Promise<{ content: unknown[]; stop_reason: string | null; usage?: { input_tokens?: number; output_tokens?: number } }>;
}

export interface AppOptions {
  /** defaults to a client built from ANTHROPIC_API_KEY; null = no key */
  client?: ModelClient | null;
  model?: string;
  maxTokens?: number;
  /** questions per window and browser session */
  rateLimit?: number;
  rateWindowMs?: number;
  upstreamTimeoutMs?: number;
  /** extra time before the proxy gives up on the whole request */
  graceMs?: number;
  log?: (line: string) => void;
}

const MAX_BODY = '200kb';
const MAX_MESSAGES = 60;
const MONTH_RE = /^\d{4}-\d{2}$/;
const ALLOWED_BLOCKS = new Set(['text', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking', 'fallback']);
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function sdkClient(timeoutMs: number): ModelClient | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const sdk = new Anthropic({ timeout: timeoutMs, maxRetries: 1 });
  return {
    // The beta endpoint is used only for the server-side refusal fallback.
    create: (params, options) => sdk.beta.messages.create(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, options) as unknown as ReturnType<ModelClient['create']>,
  };
}

/** Checks the conversation sent by the browser. Returns an error text or null. */
export function validateMessages(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return 'messages must be a non-empty array';
  const toolUseIds = new Set<string>();
  for (const [i, m] of messages.entries()) {
    if (!m || typeof m !== 'object') return 'invalid message';
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') return 'invalid role';
    if (i === 0 && role !== 'user') return 'first message must be from the user';
    if (typeof content === 'string') continue;
    if (!Array.isArray(content)) return 'invalid content';
    for (const block of content) {
      if (!block || typeof block !== 'object') return 'invalid content block';
      const b = block as { type?: unknown; name?: unknown; id?: unknown; tool_use_id?: unknown };
      if (typeof b.type !== 'string' || !ALLOWED_BLOCKS.has(b.type)) return 'content block type not allowed';
      if (b.type === 'tool_use') {
        if (role !== 'assistant' || !isToolName(b.name) || typeof b.id !== 'string') return 'unknown tool';
        toolUseIds.add(b.id);
      }
      if (b.type === 'tool_result') {
        if (role !== 'user' || typeof b.tool_use_id !== 'string' || !toolUseIds.has(b.tool_use_id)) return 'tool result without a matching tool call';
      }
    }
  }
  if ((messages[messages.length - 1] as { role: string }).role !== 'user') return 'last message must be from the user';
  return null;
}

function validateContext(ctx: unknown): PromptContext | null {
  if (!ctx || typeof ctx !== 'object') return null;
  const c = ctx as Record<string, unknown>;
  if (c.lang !== 'de' && c.lang !== 'en') return null;
  for (const k of ['month', 'firstMonth', 'lastMonth']) if (typeof c[k] !== 'string' || !MONTH_RE.test(c[k] as string)) return null;
  return { lang: c.lang, month: c.month as string, firstMonth: c.firstMonth as string, lastMonth: c.lastMonth as string, demo: c.demo === true };
}

export function createApp(options: AppOptions = {}): Express {
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
  const maxTokens = options.maxTokens ?? Number(process.env.AI_MAX_TOKENS ?? 2500);
  const limit = options.rateLimit ?? 20;
  const windowMs = options.rateWindowMs ?? 10 * 60 * 1000;
  const upstreamTimeoutMs = options.upstreamTimeoutMs ?? 45_000;
  const client = options.client === undefined ? sdkClient(upstreamTimeoutMs) : options.client;
  const log = options.log ?? ((line: string) => console.log(line));
  const hits = new Map<string, number[]>();

  const app = express();
  app.disable('x-powered-by');

  // CORS: this proxy is for the local app only.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      if (!LOCAL_ORIGIN.test(origin)) {
        res.status(403).json({ error: 'forbidden' satisfies ProxyErrorCode });
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, x-gi-session');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: MAX_BODY }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ai: client !== null });
  });

  /** Prototype-level limit: 20 questions per 10 minutes per browser session (and 3× that per address). */
  function allow(key: string, max: number, now: number): boolean {
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return true;
  }

  app.post('/api/ai', async (req: Request, res: Response) => {
    const started = Date.now();
    const fail = (status: number, error: ProxyErrorCode) => {
      log(`[ai] ${error} ${Date.now() - started}ms`);
      res.status(status).json({ error });
    };
    if (!client) return fail(503, 'missing_key');

    const body = (req.body ?? {}) as { messages?: unknown; context?: unknown; newQuestion?: unknown };
    const ctx = validateContext(body.context);
    const problem = validateMessages(body.messages);
    if (!ctx || problem) return fail(400, 'bad_request');

    if (body.newQuestion === true) {
      const session = String(req.headers['x-gi-session'] ?? '').slice(0, 64).replace(/[^\w-]/g, '') || 'none';
      const ip = req.ip ?? 'unknown';
      const now = Date.now();
      if (!allow(`s:${session}:${ip}`, limit, now) || !allow(`ip:${ip}`, limit * 3, now)) return fail(429, 'rate_limit');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), upstreamTimeoutMs + (options.graceMs ?? 5_000));
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const reply = await client.create(
        {
          model,
          max_tokens: maxTokens,
          system: buildSystemPrompt(ctx),
          tools: TOOL_DEFS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
          messages: body.messages,
          // Thinking is always on for this model; low effort keeps answers quick and short.
          output_config: { effort: 'low' },
          cache_control: { type: 'ephemeral' },
          // If the model declines for policy reasons, the API retries once on its fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal: controller.signal },
      );
      // Only the eight known tools may be requested.
      const tools: string[] = [];
      for (const block of reply.content as { type?: string; name?: unknown }[]) {
        if (block?.type !== 'tool_use') continue;
        if (!isToolName(block.name)) return fail(502, 'upstream');
        tools.push(block.name);
      }
      log(`[ai] ok ${Date.now() - started}ms in=${reply.usage?.input_tokens ?? '?'} out=${reply.usage?.output_tokens ?? '?'} stop=${reply.stop_reason} tools=${tools.join(',') || '-'}`);
      if (reply.stop_reason === 'refusal') {
        res.status(200).json({ error: 'refusal' satisfies ProxyErrorCode });
        return;
      }
      const out: ProxyReply = { content: reply.content, stop_reason: reply.stop_reason };
      res.json(out);
    } catch (err) {
      if (res.headersSent || res.writableEnded) return;
      if (controller.signal.aborted || err instanceof Anthropic.APIConnectionTimeoutError) return fail(504, 'timeout');
      if (err instanceof Anthropic.RateLimitError) return fail(429, 'rate_limit');
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return fail(503, 'missing_key');
      if (err instanceof Anthropic.APIError) {
        log(`[ai] upstream status=${err.status ?? '?'}`);
        return fail(502, 'upstream');
      }
      return fail(502, 'upstream');
    } finally {
      clearTimeout(timer);
    }
  });

  // body too large / invalid JSON
  app.use((err: { type?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === 'entity.too.large') res.status(413).json({ error: 'too_large' satisfies ProxyErrorCode });
    else res.status(400).json({ error: 'bad_request' satisfies ProxyErrorCode });
  });

  return app;
}
