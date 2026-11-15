// Builds tests/questions.de.json and tests/questions.en.json from the hand-written questions below.
// The expected numbers are read from the tools for the demo month 2026-10, so they stay in step
// with the demo data. Run after changing the demo generator: npx tsx scripts/build-question-sets.ts
import { writeFileSync } from 'node:fs';
import '../src/i18n';
import type { ToolName } from '../src/ai/toolDefs';
import { toolContext } from '../src/ai/toolLoop';
import { getDemoData } from '../src/data/demo';
import { runTool } from '../src/metrics/registry';

const MONTH = '2026-10';
const data = getDemoData();
const ctx = toolContext(data, MONTH);
/* eslint-disable @typescript-eslint/no-explicit-any */
const run = (name: ToolName, input: Record<string, unknown> = {}): any => runTool(data, name, input, ctx);

interface Topic {
  tools: ToolName[];
  numbers: () => number[];
  mustRefuse?: boolean;
  de: string[];
  en: string[];
}

const TOPICS: Record<string, Topic> = {
  revenue_why: {
    tools: ['get_revenue_breakdown'],
    numbers: () => [run('get_revenue_breakdown').revenue_eur, Math.abs(run('get_revenue_breakdown').change_eur)],
    de: ['Warum ist der Umsatz im Oktober gesunken?', 'Was hat sich beim Umsatz verändert?', 'Wieso sind die Einnahmen gefallen?'],
    en: ['Why did revenue fall in October?', 'What changed in our revenue?', 'Why did our turnover drop?'],
  },
  open_plans: {
    tools: ['get_treatment_plans'],
    numbers: () => [run('get_treatment_plans').open_eur, run('get_treatment_plans').open_under_3_months_eur],
    de: ['Wie viel geplante Behandlung ist noch nicht gebucht?', 'Wie viele Behandlungspläne sind noch offen?', 'Wie hoch ist der Wert der offenen HKP?'],
    en: ['How much planned treatment is not booked yet?', 'How many treatment plans are still open?', 'What is the value of our open cost estimates?'],
  },
  request_speed: {
    tools: ['get_marketing'],
    numbers: () => [run('get_marketing').answered_within_2h_pct, run('get_marketing').online_requests],
    de: ['Wie schnell beantworten wir Online-Anfragen?', 'Antworten wir schnell genug auf das Anfrageformular?'],
    en: ['How quickly do we answer online requests?', 'Do we reply fast enough to the request form?'],
  },
  waiting: {
    tools: ['get_marketing'],
    numbers: () => [run('get_marketing').requests_waiting_over_2h],
    de: ['Wie viele Anfragen haben länger als zwei Stunden gewartet?'],
    en: ['How many requests waited more than two hours?'],
  },
  overdue: {
    tools: ['get_patients_recall'],
    numbers: () => [run('get_patients_recall').overdue_for_checkup, run('get_patients_recall').overdue_value_eur],
    de: ['Wie viele Patienten sind für die Kontrolle überfällig?', 'Wie viele Recall-Patienten fehlen uns?', 'Kommen die Patienten zur Zahnreinigung wieder?'],
    en: ['How many patients are overdue for a check-up?', 'How is our recall doing?', 'Do patients come back for their cleaning?'],
  },
  missed: {
    tools: ['get_capacity_team'],
    numbers: () => [run('get_capacity_team').missed_value_eur, run('get_capacity_team').cancelled],
    de: ['Was kosten uns Terminausfälle?', 'Wie viele Termine wurden abgesagt?', 'Wie viele Patienten sind nicht erschienen?'],
    en: ['What do missed appointments cost us?', 'How many appointments were cancelled?', 'How many no-shows did we have?'],
  },
  instalments: {
    tools: ['get_treatment_plans'],
    numbers: () => [run('get_treatment_plans').instalments.acceptance_with_offer_pct, run('get_treatment_plans').instalments.acceptance_without_offer_pct],
    de: ['Hilft das Angebot der Ratenzahlung?', 'Lohnt es sich, Ratenzahlung anzubieten?'],
    en: ['Does offering instalments help?', 'Is it worth offering instalment payment?'],
  },
  sources: {
    tools: ['get_marketing'],
    numbers: () => [run('get_marketing').new_patients],
    de: ['Woher kommen unsere Neupatienten?', 'Welcher Kanal bringt die meisten Patienten?', 'In welchem Bezirk wohnen unsere neuen Patienten?'],
    en: ['Where do our new patients come from?', 'Which channel brings the most patients?', 'Which district do our new patients live in?'],
  },
  new_patients: {
    tools: ['get_patients_recall'],
    numbers: () => [run('get_patients_recall').new_patients],
    de: ['Wie viele Neupatienten hatten wir?', 'Wie viele neue Patienten kamen im Oktober?'],
    en: ['How many new patients did we have?', 'How many new patients came in October?'],
  },
  instagram: {
    tools: ['get_instagram'],
    numbers: () => [run('get_instagram').reach],
    de: ['Welche Instagram-Beiträge bringen Patienten?', 'Bringt Instagram neue Patienten?', 'Wie ist unsere Reichweite?'],
    en: ['Which posts on Instagram bring new patients?', 'Does Instagram bring us patients?', 'How is our reach developing on social media?'],
  },
  google_ads: {
    tools: ['get_marketing'],
    numbers: () => [run('get_marketing').google_ads.spend_eur, run('get_marketing').google_ads.cost_per_new_patient_eur],
    de: ['Lohnt sich Google Ads?', 'Was kostet uns ein Neupatient über Google?'],
    en: ['Does Google Ads pay off?', 'What does a new patient from Google cost us?'],
  },
  focus: {
    tools: ['get_month_summary'],
    numbers: () => [],
    de: ['Worauf sollten wir uns diesen Monat konzentrieren?', 'Was ist jetzt am wichtigsten?', 'Wo bleibt Geld liegen?'],
    en: ['What should we focus on this month?', 'What is most important right now?', 'Where is money being left on the table?'],
  },
  profit: {
    tools: [],
    numbers: () => [],
    mustRefuse: true,
    de: ['Was ist unser Gewinn pro Implantat?', 'Wie hoch ist unser Gewinn?', 'Wie ist unsere Marge bei Kronen?'],
    en: ['What is our profit per implant?', 'How much profit did we make?', 'What is our margin on crowns?'],
  },
  cancel_reasons: {
    tools: ['get_patients_recall'],
    numbers: () => [],
    mustRefuse: true,
    de: ['Warum sagen Patienten ihre Termine ab?', 'Aus welchem Grund fallen Termine aus?'],
    en: ['Why do patients cancel their appointments?', 'What is the reason for the no-shows?'],
  },
  decline_reasons: {
    tools: ['get_treatment_plans'],
    numbers: () => [],
    mustRefuse: true,
    de: ['Warum lehnen Patienten Behandlungspläne ab?'],
    en: ['Why do patients decline treatment plans?'],
  },
  not_in_data: {
    tools: [],
    numbers: () => [],
    mustRefuse: true,
    de: ['Wie zufrieden sind unsere Patienten?', 'Was macht die Konkurrenz besser?'],
    en: ['How satisfied are our patients?', 'What are our competitors doing better?'],
  },
  weekday: {
    tools: ['get_capacity_team'],
    numbers: () => [run('get_capacity_team').time_used_pct],
    de: ['Welcher Wochentag hat die meiste freie Zeit?', 'Nutzen wir unsere Behandlungszeit?'],
    en: ['Which weekday has the most free time?', 'Are we using our treatment time?'],
  },
  best_month: {
    tools: ['get_monthly_series'],
    numbers: () => [run('get_monthly_series', { metric: 'revenue_eur' }).highest.value],
    de: ['Was war unser bester Monat?', 'Welcher Monat hatte den höchsten Umsatz?'],
    en: ['What was our best month?', 'Which month had the highest revenue?'],
  },
  dentist_acceptance: {
    tools: ['get_treatment_plans'],
    numbers: () => [Math.min(...run('get_treatment_plans').by_dentist.map((d: any) => d.acceptance_pct))],
    de: ['Welcher Zahnarzt hat die niedrigste Annahmequote?'],
    en: ['Which dentist has the lowest plan acceptance?'],
  },
  acceptance_period: {
    tools: ['get_treatment_plans'],
    numbers: () => [run('get_treatment_plans', { from: '2026-01', to: '2026-06' }).acceptance_pct],
    de: ['Wie war die Annahmequote im ersten Halbjahr?'],
    en: ['What was plan acceptance in the first half of the year?'],
  },
  rebooking: {
    tools: ['get_capacity_team'],
    numbers: () => [run('get_capacity_team').team_average_next_appointment_booked_pct],
    de: ['Wer bucht am seltensten den nächsten Termin?', 'Wie oft gehen Patienten mit einem Folgetermin nach Hause?'],
    en: ['Who books the next appointment least often?', 'How often do patients leave with a next appointment?'],
  },
  lab: {
    tools: ['get_month_summary'],
    numbers: () => [run('get_month_summary').this_month.in_house_lab_eur],
    de: ['Wie viel Umsatz bleibt im Eigenlabor?', 'Wie verteilt sich der Umsatz auf GKV und PKV?'],
    en: ['How much revenue stays in the in-house lab?', 'How does revenue split between GKV and PKV?'],
  },
};

for (const lang of ['de', 'en'] as const) {
  const entries = Object.entries(TOPICS).flatMap(([topic, t]) =>
    t[lang].map((question) => ({
      question,
      language: lang,
      month: MONTH,
      topic,
      expectedTools: t.tools,
      expectedNumbers: t.numbers().filter((n) => typeof n === 'number'),
      ...(t.mustRefuse ? { mustRefuse: true } : {}),
      mustNotContain: lang === 'de' ? ['weil'] : ['because'],
    })),
  );
  writeFileSync(new URL(`../tests/questions.${lang}.json`, import.meta.url), `${JSON.stringify(entries, null, 2)}\n`);
  console.log(lang, entries.length, 'questions');
}
