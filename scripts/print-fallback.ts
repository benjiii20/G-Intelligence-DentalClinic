// Prints every rule-based answer. Usage: npx tsx scripts/print-fallback.ts de 2026-10
import '../src/i18n';
import { fallbackAnswer } from '../src/ai/answerQuestion';
import { FALLBACK_KEYS } from '../src/ai/fallback';
import { getDemoData } from '../src/data/demo';
import type { Lang } from '../src/state/store';

const [lang = 'de', month = '2026-10'] = process.argv.slice(2);
const data = getDemoData();
for (const key of FALLBACK_KEYS) {
  const a = fallbackAnswer('Wie war die Annahmequote im ersten Halbjahr?', { data, lang: lang as Lang, month }, key);
  console.log(`\n=== ${key}  [${a.metricCalls.join(', ')}]  ok=${a.check.ok} bad=${JSON.stringify(a.check.bad)}`);
  console.log(a.text);
}
