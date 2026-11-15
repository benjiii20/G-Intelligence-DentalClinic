# G-Intelligence for DentalFirst

A web app that explains in plain German or English how a dental practice is doing, using data from the tools the practice already uses. It shows what changed, where, and what it is worth.

- **Demo mode** (default): invented, seeded sample data for Oct 2025 – Oct 2026.
- **Practice check mode**: the practice uploads its own CSV or Excel exports. They are processed **only in the browser**, and nothing is uploaded or stored on a server.
- **AI analyst** (optional): Claude answers questions, but only through the app's tested metric functions. The AI explains; the code calculates. Without an API key, the app answers with fixed rules.

## Run it

Requirements: Node.js 20 or newer. Works on Windows, macOS and Linux.

```bash
npm install
npm run dev
```

This starts the web app at <http://localhost:5173> and the small AI proxy at `http://127.0.0.1:8787` (the web app reaches it through `/api`).

### Turn on the AI analyst

1. Copy `.env.example` to `.env`.
2. Set `ANTHROPIC_API_KEY=` to a key from the Anthropic Console.
3. Restart `npm run dev`.

Optional settings in `.env`:

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Model used by the proxy |
| `AI_MAX_TOKENS` | 1200 on `claude-sonnet-5-5` (thinking is switched off before the answer), otherwise 4000 | Output limit per request |
| `PORT` | 8787 | Proxy port (change `vite.config.ts` too if you change it) |

`.env` is in `.gitignore`. The key stays on the proxy and is never sent to the browser.

### Other commands

| Command | What it does |
|---|---|
| `npm test` | All unit tests. No API key needed: the question sets run through the rule-based fallback and a mocked AI |
| `npm run build` | Type-checks app and server (strict) and builds `dist/` |
| `npm run eval` | Runs the question sets against the real API (needs a key; see below) |

Helper scripts (run with `npx tsx …`):

- `scripts/inspect-demo.ts`: prints the demo figures month by month.
- `scripts/render-text.ts <page> <insights|data> <de|en> <YYYY-MM>`: prints a page's visible text, for proofreading.
- `scripts/print-fallback.ts <de|en> <YYYY-MM>`: prints every rule-based answer.
- `scripts/build-samples.ts`: regenerates `public/samples/` from the demo data.
- `scripts/build-question-sets.ts`: regenerates `tests/questions.*.json`. The expected numbers are read from the tools, so rerun it after changing the demo generator.

## Switch to real data (practice check)

1. Open **Datenquellen / Data sources** and go to **Eigene Daten hochladen / Upload your own data**.
2. Choose one or more files. The app works out the type (appointments, treatment plans, patients, recall list, requests, Instagram, Google Ads) and matches the columns, including German names such as *Datum, Behandler, Leistung, Betrag, Status, HKP-Nr., Patienten-Nr.*
3. Check the column matching and the validation report:
   - Rows that cannot be used (no date, no patient number) are counted as skipped.
   - Doubtful rows are imported **and flagged**: no amount, unknown status, unknown treatment, possible duplicates, no source.
   - Nothing is fixed silently.
4. Click **Daten übernehmen / Use this data**. Every page recalculates. Pages whose source is missing show "Nicht genug Daten / Not enough data" and name the source that would fix it.
5. **Daten löschen / Delete data** (in the green banner) removes the imported data from memory. It also clears everything the app put in localStorage (events, source switches); only the language choice is kept.

Privacy rules applied on import:

- Columns with names, addresses, contact details, free-text notes, diagnoses or birth dates are refused, and the reason is shown. A hashed e-mail or phone column is allowed.
- A patient-number column whose values look like names is refused.
- Values in the *Behandler* column are replaced by letters (A, B, C …). The names themselves are not kept.
- Exports contain no bookable time slots, so "treatment time used" shows "not enough data" for real data.

Sample files for every import type are in [public/samples/](public/samples/). They are built from the invented demo data, and importing them reproduces the demo figures exactly (this is a test).

## Where things live

```
src/data/        types.ts (raw record types), demo.ts (seeded generator), dates.ts
src/metrics/     every metric as a pure function of (records, filter) with tests
                 core.ts (filter, result shape, "missing"/"too few" handling)
                 revenue, bridge (revenue bridge, log decomposition), plans, recall,
                 capacity, requests, marketing, instagram, opportunity, series
                 registry.ts: the AI tools, built on the metric functions
src/insights/    story.ts: headline, story sentences and "money on the table" cards
src/ai/          toolDefs.ts (tool names, labels, schemas), toolLoop.ts (browser side of the loop),
                 verifyAnswer.ts (answer check), fallback.ts (rule-based answers), answerQuestion.ts
src/import/      schema.ts (import types, column aliases, refused columns), normalize.ts (dates,
                 amounts, treatments …), mapping.ts (read files, detect type, map columns), build.ts
src/i18n/        de.json, en.json (all visible text), glossary/ (HKP, Recall, PZR, GKV/PKV, Eigenlabor),
                 format.ts (Intl number, currency, percent, date formats)
src/pages/       Data pages, Insights pages, Ask, Data sources, Upload
src/components/  layout and shared UI parts
server/          app.ts (AI proxy), prompt.ts (system prompt), index.ts
tests/           question sets, render tests for every page, language and view
```

Rules the code follows:

- Metrics are always calculated from records, never stored.
- Each metric returns `{ value, unit, sampleSize, sources }`. When it cannot calculate, it returns `value: null` with `reason: 'missing_source' | 'too_few_records'`, never 0.
- All visible text comes from `de.json` / `en.json` templates with variables. Tests check that both files have identical keys and the same variables, that German text contains no English (and the reverse) apart from an allowlist, that German uses the formal *Sie*, and that English uses British spelling.

## Add a new data source

1. Add a key to `SOURCE_KEYS` in `src/data/types.ts`, plus any new record type, and add the records to `Dataset`.
2. Add its name and card texts to both language files (`sourceName.<key>`, `src.card.<key>.unlocks`, `src.card.<key>.access`). The Data sources page lists it automatically.
3. Write the metric in `src/metrics/`. Start it with `firstMissing(data, [...sources])` and return `missingSource(...)` when the source is off. Add tests.
4. For real data: add an import type in `src/import/schema.ts` (fields and column aliases) and handle it in `processFile` and `buildDataset` (`src/import/build.ts`). Set `sources.<key>` when rows were imported. Add a sample file to `scripts/build-samples.ts`.
5. Later, a real integration (API sync) only needs to produce the same raw records.

## Add a new AI tool

1. Add the name to `TOOL_NAMES` and a definition to `TOOL_DEFS` in `src/ai/toolDefs.ts`:
   - labels in DE/EN for the "data queries" chips
   - its data sources
   - a 1–3 sentence description for the model that says what is **not** recorded
   - a JSON input schema with `additionalProperties: false`
2. Implement it in `RUN` in `src/metrics/registry.ts` on top of the metric functions:
   - Return small plain JSON (under ~4 KB) with units in field names (`_eur`, `_pct`).
   - Return only aggregates and pseudonymised IDs.
   - Return `{ missing: '<source>' }` when a source is off.
3. The proxy picks it up automatically and allows only names in `TOOL_NAMES`, in both directions.
4. Add questions to `scripts/build-question-sets.ts`, regenerate the sets, and run `npm test` and `npm run eval`.

## How the AI analyst works

1. The browser sends the conversation to `POST /api/ai`. On round 1 that is the question plus the last 6 turns; on later rounds it also includes the tool results.
2. The proxy adds the system prompt (`server/prompt.ts`), the tool definitions, the model and the limits, then calls the Anthropic Messages API.
3. When Claude asks for a tool, the browser runs the metric function locally on the data in memory and sends back only the JSON result. This repeats for at most 6 rounds.
4. The final text streams to the chat as server-sent events.
5. `verifyAnswer` (`src/ai/verifyAnswer.ts`) then extracts every number from the answer (German and English formats, `k`/`Tsd.`, percentages, negative numbers). It checks each one against the numbers the tools returned in this conversation, with a tolerance of ±1.5 %. Under each answer the chat shows "✓ All X numbers come from the data queries" or "⚠ Not covered by the data queries: …".
6. When the AI is not available (no key, rate limit, timeout, refusal, proxy down), a friendly notice appears and the **rule-based fallback** answers. It uses the same tools and i18n templates and is re-rendered in the current language and month.

Proxy safeguards (`server/app.ts`):

- Bound to `127.0.0.1` only, and CORS allows only localhost origins.
- Request body limited to 200 KB.
- Upstream timeout of 45 s plus an overall request timeout.
- The message structure is validated, and only the 8 known tool names are accepted in either direction.
- The model, system prompt, tools and limits are set by the proxy; the browser cannot change them.
- Stateless: it stores nothing, and it logs only timing, token counts, stop reason and tool names, never question text or tool results.
- Rate limit of 20 questions per 10 minutes per browser session (and 60 per address).

**The rate limit is prototype-level, not real protection.** The session ID comes from the browser and can be changed, and the counters live in memory. A production deployment needs real authentication and server-side quotas.

## AI evaluation

```bash
npm run eval                      # both languages, all questions
npm run eval -- --lang de --limit 10
```

This needs `ANTHROPIC_API_KEY`. Every question is a real, billed API conversation (about 100 questions in the full run). It reports:

- key numbers correct
- expected tools called
- "not in the data" said for profit, costs and unrecorded reasons
- "because/weil" used without a recorded reason
- numbers not covered by tools

The question sets (`tests/questions.de.json`, `tests/questions.en.json`, 48 questions each) hold the expected tools and key numbers. `npm test` runs the same questions through the fallback and through the tool loop with a mocked AI, so tests never need a key.

## Data protection for production

The prototype only sends tool results (aggregates and pseudonymised IDs) to the AI provider. It never sends uploaded files or raw records. Before using it with real practice data in production:

- Sign a contract with the AI provider that rules out training on the data.
- Use EU data processing where available.
- Cover the AI provider in the data processing agreement (AVV/DPA) with the practice, as a sub-processor.
- Keep processing only pseudonymised patient IDs, as the import does.

## Out of scope (for now)

Not built yet:

- real API integrations with practice software or ad platforms
- a database
- login
- sending messages to patients
- billing

The raw-record types and the metric layer are kept separate so that these can be added later.
