// AI evaluation against the real API. Usage:
//   npm run eval                 (both languages, all questions)
//   npm run eval -- --lang de --limit 10
// Needs ANTHROPIC_API_KEY in .env. Each question is a real, billed API conversation.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import '../src/i18n';
import { answerQuestion } from '../src/ai/answerQuestion';
import { extractNumbers } from '../src/ai/verifyAnswer';
import { getDemoData } from '../src/data/demo';
import type { Lang } from '../src/state/store';

interface Entry {
  question: string;
  language: Lang;
  month: string;
  expectedTools: string[];
  expectedNumbers: number[];
  mustRefuse?: boolean;
  mustNotContain?: string[];
}

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('No ANTHROPIC_API_KEY set: the evaluation needs the real API. Add the key to .env and run "npm run eval" again.');
  console.log('Without a key, "npm test" runs the same questions through the rule-based fallback and a mocked AI.');
  process.exit(0);
}

const REFUSAL: Record<Lang, RegExp> = {
  de: /nicht (in den daten|verfügbar|erfasst|berechn|vorhanden|enthalten|möglich)|liegen? .*nicht vor|kann ich nicht|fehl(t|en)|keine (daten|angaben|kosten)/i,
  en: /not (in the data|available|recorded|possible)|cannot|can't|no (data|cost)|missing|isn't (recorded|available)/i,
};

const langs = (arg('lang') ? [arg('lang') as Lang] : ['de', 'en']) as Lang[];
const limit = arg('limit') ? Number(arg('limit')) : Infinity;
const data = getDemoData();

const app = createApp({ rateLimit: 100_000, log: () => {} });
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const has = (text: string, n: number, lang: Lang) => extractNumbers(text, lang).some((x) => Math.abs(Math.abs(x.value) - Math.abs(n)) <= Math.max(0.6, Math.abs(n) * 0.015));

const totals = { questions: 0, answeredByAi: 0, numbers: 0, numbersOk: 0, tools: 0, toolsOk: 0, becauseViolations: 0, refusals: 0, refusalsOk: 0, uncovered: 0 };
const problems: string[] = [];

for (const lang of langs) {
  const questions = (JSON.parse(readFileSync(new URL(`../tests/questions.${lang}.json`, import.meta.url), 'utf-8')) as Entry[]).slice(0, limit);
  console.log(`\n=== ${lang.toUpperCase()} · ${questions.length} questions ===`);
  for (const q of questions) {
    totals.questions++;
    let reasonsRecorded = false;
    const a = await answerQuestion(q.question, { data, lang, month: q.month, baseUrl });
    if (a.mode !== 'ai') {
      problems.push(`[${lang}] "${q.question}": the AI did not answer (${a.aiError})`);
      console.log(`  ✗ ${q.question}  -> ${a.aiError}`);
      continue;
    }
    totals.answeredByAi++;
    const notes: string[] = [];
    for (const n of q.expectedNumbers) {
      totals.numbers++;
      if (has(a.text, n, lang)) totals.numbersOk++;
      else notes.push(`number ${n} missing`);
    }
    for (const tool of q.expectedTools) {
      totals.tools++;
      if (a.metricCalls.includes(tool as (typeof a.metricCalls)[number])) totals.toolsOk++;
      else notes.push(`tool ${tool} not called`);
    }
    // "because/weil" is allowed only when a tool returned a recorded reason or event
    reasonsRecorded = a.metricCalls.some((c) => ['get_month_summary', 'get_revenue_breakdown', 'get_treatment_plans', 'get_capacity_team', 'get_patients_recall'].includes(c));
    for (const word of q.mustNotContain ?? []) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(a.text)) {
        if (!reasonsRecorded) {
          totals.becauseViolations++;
          notes.push(`contains "${word}" without a recorded reason`);
        } else notes.push(`contains "${word}" (a tool with recorded events/reasons was called: check by hand)`);
      }
    }
    if (q.mustRefuse) {
      totals.refusals++;
      if (REFUSAL[lang].test(a.text)) totals.refusalsOk++;
      else notes.push('did not say that this is not in the data');
    }
    if (a.check.bad.length) {
      totals.uncovered += a.check.bad.length;
      notes.push(`numbers not covered by tools: ${a.check.bad.join(', ')}`);
    }
    console.log(`  ${notes.length ? '✗' : '✓'} ${q.question}  [${a.metricCalls.join(', ') || 'no tools'}]${notes.length ? `\n      ${notes.join('; ')}` : ''}`);
    if (notes.length) problems.push(`[${lang}] "${q.question}": ${notes.join('; ')}\n      answer: ${a.text.replace(/\n/g, ' ⏎ ')}`);
  }
}

server.close();
const pc = (a: number, b: number) => (b ? `${a}/${b} (${Math.round((a / b) * 100)} %)` : 'n/a');
console.log('\n=== Summary ===');
console.log(`Answered by the AI:            ${pc(totals.answeredByAi, totals.questions)}`);
console.log(`Key numbers correct:           ${pc(totals.numbersOk, totals.numbers)}`);
console.log(`Expected tools called:         ${pc(totals.toolsOk, totals.tools)}`);
console.log(`"Not in the data" said:        ${pc(totals.refusalsOk, totals.refusals)}`);
console.log(`because/weil without a reason: ${totals.becauseViolations}`);
console.log(`Numbers not covered by tools:  ${totals.uncovered}`);
if (problems.length) {
  console.log('\n=== To review ===');
  for (const p of problems) console.log(`- ${p}`);
}
process.exit(0);
