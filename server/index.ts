// AI proxy placeholder. The real proxy is built in step 6.
import 'dotenv/config';
import express from 'express';

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`[api] listening on http://127.0.0.1:${port}`);
});
