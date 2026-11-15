import 'dotenv/config';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

// Bound to localhost only: this proxy is not meant to be reachable from the network.
app.listen(port, '127.0.0.1', () => {
  const ai = process.env.ANTHROPIC_API_KEY ? `AI analyst on (${process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5'})` : 'no ANTHROPIC_API_KEY: rule-based answers only';
  console.log(`[api] listening on http://127.0.0.1:${port} · ${ai}`);
});
