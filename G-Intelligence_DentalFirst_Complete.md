# G-Intelligence for Dental Practices: Complete Project Document

Case study: DentalFirst (Dres. Nowak), Berlin-Charlottenburg

---

## Contents

1. What G-Intelligence is
2. Why dental practices
3. Market and competition
4. Positioning
5. The client: DentalFirst
6. The dashboard
7. How the Insights work
8. The AI analyst
9. Data: what is available and how to get it
10. Data protection
11. The demo
12. The pitch (informal meeting)
13. Pricing
14. Risks and how to handle them
15. Roadmap and next steps
16. Files in this project

---

## 1. What G-Intelligence is

G-Intelligence connects the data a business already has (practice software, website, inbox, Instagram, Google) and explains in plain language:

- **what happened**
- **why it happened**, as far as the data shows
- **where money is being left on the table**
- **what to look at next**

It does not replace any existing software. It reads from it.

The platform has two sides, switchable at the top:

- **Data:** all figures, charts and tables, with no commentary
- **Insights:** plain-language explanations, each backed by the numbers that prove it

The platform is available in **German and English**, switchable at the top.

---

## 2. Why dental practices

- **The amounts are large.** A practice like DentalFirst bills over €1M a year. Open treatment plans alone can be €25,000–30,000 a month.
- **The key numbers are standard.** Treatment plan acceptance, overdue check-ups, chair time and new patients are measures every practice understands.
- **Their information is spread out.** Practice software, website form, inbox, Instagram, Google Ads, review platforms, in-house lab and instalment provider each see only their own piece.
- **The category is proven.** In the US, tools like Dental Intelligence and Practice by Numbers sell these metrics to practices.

### Value hierarchy

| Level | Example | Value to the owner |
|---|---|---|
| Data | "Revenue was €118,600" | Low: their software already shows it |
| Insight | "Revenue fell mainly because of fewer implant cases" | Medium: only if someone acts |
| Action | "Follow up these 6 plans, offer instalments on the big ones" | High |
| Outcome | "You recovered €11,000 this month" | What they pay for |

G-Intelligence must reach at least the **action** level and show **outcomes** over time.

---

## 3. Market and competition

### United States (proves the category)
- **Dental Intelligence:** unscheduled treatment, follow-up outcomes per team member, automated morning huddle
- **Practice by Numbers:** 400+ dental KPIs, multi-location; one listing shows a starting price of $300/month
- **Others:** Jarvis Analytics, Adit, DentalBase (AI follow-up of unscheduled treatment)

### Germany (direct competition)
- **Roger (Sanos, Berlin):** tracks open treatment plans (HKP/KV), reminds patients via WhatsApp, digital signatures, recall automation, some analysis per dentist. **Most direct competitor** for treatment plan follow-up.
- **charly analytics (solutio):** business intelligence built into Charly practice software
- **solvi control:** practice controlling and cost figures
- **Dentero:** Frankfurt startup automating documentation and billing
- **Patient21:** software used at Dental21, one of Germany's largest dental groups

### What existing tools don't cover well
1. **Connections across systems:** practice software + website + inbox + Instagram + Google together. Each existing tool sees only its own data.
2. **Request response time** and its effect on new patients
3. **Instagram → real patients**, by post type
4. **Plain-language explanations in euros**, not just reports
5. **Group practices with several locations** (not the DentalFirst case, but a future market)

**Conclusion:** don't compete head-on on treatment plan follow-up, where Roger is strong. Lead with the connections between systems, request speed and marketing → patients.

---

## 4. Positioning

**Don't say:** "dashboard", "business intelligence", "all your data in one place", "the AI tells you why everything happens".

**Say:**
> "Finally see how your practice software, website, Instagram and Google work together, and what that means in euros, explained in plain German every Monday."

**About the AI:**
> "It shows you exactly what changed, where and what it's worth, so you can see the reason in minutes instead of guessing."

**About "one place":** the single place is the foundation. The **connections between systems** and the **plain explanations** are what practices pay for.

---

## 5. The client: DentalFirst

Source: their website (homepage only; Impressum and subpages not checked).

- **Name:** DentalFirst (Zahnarztpraxis Dres. Nowak)
- **Location:** one practice, Reichsstraße 2, 14052 Berlin-Charlottenburg (near Theodor-Heuss-Platz, Messe Nord/ICC)
- **Catchment area named on the site:** Westend, Wilmersdorf, Grunewald, Halensee, Schmargendorf
- **Team:** Dr. Ole Nowak and Dr. Kalvin Nowak plus a team of specialised dentists and in-house dental technicians (headcount not stated)
- **Opening hours:** Mon–Thu 8:00–18:00, Fri 8:00–16:00
- **Focus areas:**
  - implants and oral surgery (same-day implants, 3D planning with DVT)
  - prosthetics with an **in-house lab** (zirconia, CAD/CAM, 3D printing)
  - aesthetics (veneers, bleaching, aligners)
  - root canal and gum treatment
  - prevention (professional cleaning, Guided Biofilm Therapy)
  - **CMD centre** (jaw pain and dysfunction)
  - anxious patients and treatment under general anaesthesia
  - premium lounge
- **Booking:** website **appointment request form** (not instant booking), phone, email
- **Payments:** instalment payment offered
- **Languages:** German site plus English and Russian sites
- **Marketing:** **active on Instagram, posts often**; link in bio tagged as Instagram traffic (`utm_source=ig`); ProvenExpert reviews widget
- **Practice software:** unknown. **Ask in the meeting.**

### What this means for the product
- The **request form** makes response speed a key, unique insight.
- **Implants and the in-house lab** make treatment plans and lab revenue important.
- **Instagram** activity makes "Instagram → patients" a strong hook.
- **Instalments** allow the "does offering instalments help?" insight.
- One location means no location comparison for now.

---

## 6. The dashboard

### Header
- Demo banner: "Preview for DentalFirst … all figures are invented sample data; team and patients anonymised"
- **Data | Insights** switch
- **DE | EN** switch
- Month selector (Nov 2025 – Oct 2026)
- **Weekly summary** button
- Sync status listing connected sources

### Pages

| Page (DE / EN) | Insights question | Data side |
|---|---|---|
| Überblick / Overview | What happened this month, and why? | 10 key figures, revenue chart, treatment/team/channel tables |
| Umsatz / Revenue | Why did revenue change? | Monthly table by treatment, payer and in-house lab |
| Behandlungspläne / Treatment plans | How much planned treatment never gets booked? | Plans per month, acceptance by dentist, open plans list |
| Marketing | Does your marketing bring new patients? | Channels, requests per month, districts, Instagram per month and per post type |
| Patienten & Prophylaxe / Patients & prevention | Do patients come back for check-ups? | Patients per month, sortable pseudonymised patient list |
| Behandlungszeit & Team / Treatment time & team | Are we using our treatment time? | Appointments per month, team table, weekday table |
| Fragen stellen / Ask a question | Ask anything about your practice | (same in both modes) |
| Datenquellen / Data sources | Which data powers these answers? | (same in both modes) |

### Insights content per page

**Overview**
- Story card: headline, short explanation, 3 clickable key numbers
- "Why did revenue change?": exact breakdown into number of appointments / type of treatment / prices
- Revenue = patients × visits × revenue per visit, with euro effects
- "Where is money being left on the table?": 4 cards (open treatment plans, requests answered too late, overdue check-ups, missed appointments) with a monthly total
- "What moved the numbers most?": top 5 changes in euros
- Suggested questions

**Revenue**
- Which treatments caused the change (split into number of sessions and price)
- Treatment detail with 12-month trend and who delivers it
- "Is this month unusual?" compared with the 12-month average and last year
- Payer mix (statutory / private / self-pay) and in-house lab revenue

**Treatment plans**
- Proposed vs booked vs open (under / over 3 months)
- Value of one extra point of acceptance
- With vs without instalment offer (a link, not proof)
- Acceptance by dentist, with holiday notes
- **Follow-up list for the front desk**, sorted by value and age, with a suggested next step

**Marketing**
- **Request speed:** answered within 2 hours, conversion fast vs slow, estimated missed new patients and their value
- Channels: website request, Google, Instagram, referrals, reviews, English & Russian site, phone, each with its funnel and biggest drop-off
- New patients by district, highlighting high-value areas
- **Instagram:** posts → reach → link clicks → messages → requests → new patients → 6-month revenue, plus results per post type
- Google Ads: spend, cost per new patient, return per €1 within 6 months
- Warning about new patients with no recorded source

**Patients & prevention**
- Overdue check-ups and their value
- Value of a typical patient per year, a recall visit, +1 point "next appointment booked", and a new patient who never returns
- Overdue patient examples (by ID) with visit history

**Treatment time & team**
- Treatment time used: completed / cancelled / no-show / never booked
- Value of missed and empty time
- "Next appointment booked" per team member compared with the team ("a booking habit, not clinical quality")
- Quiet weekdays matched to overdue patients

---

## 7. How the Insights work

### Rules
- Every number is **calculated from raw records** by tested code.
- The revenue breakdown **adds up exactly** to the change.
- **Say what changed, not why,** unless the data shows the reason (e.g. holiday days). Otherwise: "worth checking".
- **Estimates are labelled** ("about", "estimate") and kept conservative.
- **Too little data** (fewer than 10 records) shows "not enough data" and which source would fix it.

### Language rules
- Short sentences, at most ~20 words
- Everyday words: "type of treatment" not "mix effect"; "treatment time used" not "utilisation"; "money left on the table"
- Euros before percentages
- Every page starts with the answer, then the evidence
- German: formal "Sie", natural native German; HKP, Recall, PZR, GKV/PKV and Eigenlabor explained once in tooltips
- English: British spelling, plain and friendly

---

## 8. The AI analyst

### Core rule: the AI explains, the code calculates
1. **Code calculates every number** (tested metric functions).
2. **The AI only chooses and explains.** It calls the metric functions as tools and writes the answer using only their numbers.
3. **A check runs on every answer.** Every number in the text must match a tool result (±1.5% for rounding). Each answer shows "✓ All numbers come from the data queries" or "⚠ Not covered: …".

### The 8 tools
`get_month_summary`, `get_revenue_breakdown`, `get_treatment_plans`, `get_marketing`, `get_instagram`, `get_patients_recall`, `get_capacity_team`, `get_monthly_series`

### Instructions to the AI
- answer in the selected language, for the selected month
- every number from a tool; never calculate, estimate or invent
- plain style: short answer, up to 5 bullets, under 150 words
- "why": breakdown first, then what lines up, then what to check; never "because" without a recorded reason
- general knowledge only if labelled ("Generally …")
- clearly say what is not in the data
- no medical, legal or tax advice

### Which questions it can answer

| Group | Example | Answerable? |
|---|---|---|
| Fixed metrics | "Why did revenue fall?" | ✅ Yes |
| Same metrics, sliced | "Acceptance for private implant patients this year?" | ✅ Yes, with filters |
| New combinations | "Westend patients via Instagram who started an implant plan?" | ⚠️ With a flexible query tool |
| Predictions / what-if | "What will November look like?" | ⚠️ Only with a dedicated, tested forecast tool |
| Not in the data | "Why do patients cancel?", "Profit per implant?" | ❌ No. Say so and name what's missing |

### "Why" questions
- **The data can answer which part changed** (exact arithmetic).
- **The data can only partly answer the human reason.** Reasons are often not recorded, several things change at once, correlation isn't cause, and small numbers are noisy.
- **To make more "why" questions answerable:** record decline and cancellation reasons, log events (holidays, staff changes, campaigns), and run small tests (e.g. offer instalments on all large plans for 2 months).

**It is still valuable:** most owners don't even know the "what and where" today. The tool narrows it down in seconds; the dentist supplies the human reason.

### Production design
- A small server proxy holds the Anthropic API key.
- The browser runs the tools locally; only aggregated results go to the AI.
- 40+ test questions per language; `npm run eval` checks the AI against the real API.
- Rule-based answers as a fallback.

Full detail: `G-Intelligence_AI_Analyst.md`.

---

## 9. Data: what is available and how to get it

### Easy: practice software export
Dampsoft, Charly, CGM Z1 and evident all export statistics and lists (CSV/Excel). Open APIs are rare; for a pilot a manual or scheduled export is fine.
- Revenue by treatment, month and payer
- Appointments (completed, cancelled, no-show) by team member and weekday
- Patients: new vs existing, last visit, recall due date, postcode
- Treatment plans: created, value, status, dentist
- Schedule slots for chair time

### Easy: online tools, read-only
- **Instagram** (Meta Business Suite): posts, reach, profile visits, link clicks, messages
- **Google Ads:** spend, clicks, calls
- **Google Business Profile:** calls, direction requests
- **ProvenExpert:** reviews over time

### Medium: needs a small setup
- **Request response time:** form/inbox timestamps for arrival; sent emails or an "answered" checkbox for reply time. Phone is hard without a modern phone system.
- **Request → patient:** match by email or phone number, or front desk notes it
- **Instagram → patient:** the tagged link in bio covers form requests; direct messages need the source recorded
- **Holidays and absences:** from the schedule if entered there

### Hard: often not recorded today
- **Lead source for every new patient:** add "Wie sind Sie auf uns aufmerksam geworden?" to the medical history form
- **Instalment offered on a plan:** needs a checkbox or the financing provider's report
- **Profit per treatment:** needs costs from accounting (e.g. DATEV)

### Demo estimates real data would replace
- value of a new patient over 6 months
- visits per patient per year, value of a check-up
- "fast replies convert twice as often" (measure the real rates)
- bookable capacity

**Realistic start:** one export from the practice software plus read access to Instagram and Google Ads fills Overview, Revenue, Treatment plans, Patients, Treatment time and most of Marketing.

---

## 10. Data protection

- Treatment data is **health data under GDPR** (Art. 9).
- **Data processing agreement** (Auftragsverarbeitungsvertrag) with every practice
- **EU hosting**
- **Pseudonymised patient IDs** in all analysis; no names
- **Practice check mode:** imported files are processed only in the browser
- **AI:** only aggregated tool results are sent; AI provider contract with no training on the data and EU processing where available
- Have a lawyer review the agreement before the first real export.

*Not legal advice.*

---

## 11. The demo

### Versions
| File / link | What it is |
|---|---|
| `G-Intelligence_Demo_DentalFirst.html` | Single file; opens in any browser, works offline. Data/Insights, DE/EN, all pages, rule-based "Ask a question". Kept as a file, not a link, because it carries DentalFirst's name. |
| `G-Intelligence_Demo_DentalFirst_AI.html` / private Claude link | Same dashboard with the **working AI analyst** (Claude). Only works when opened in Claude; private to you. |

### Sample data stories (invented)
- **October vs September:** revenue −10% (~€132k → €119k), mainly fewer implant cases; plan acceptance 66% → 55%; Dentist A on holiday 5 days
- **Online requests:** record 92, but only 46% answered within 2 hours (was 62%); fast replies convert about twice as often
- **Instalments:** offered on only 30% of plans; acceptance clearly higher with an offer
- **Missed appointments** up, mostly check-ups and cleanings
- **Prophylaxe E** books fewer next appointments; many overdue patients last saw E
- **Wednesday and Friday** are the quietest days
- **Instagram:** before & after posts bring the most patients; team posts get reach but few requests
- **Referrals** convert best; **Google Ads** pays back clearly
- **Most new patients** from Charlottenburg and Westend; Grunewald patients are worth the most

### Rules for showing it
- Always say "sample numbers"
- Team shown as Dentist A/B/C, Hygienist D/E; patients only as IDs
- No DentalFirst logo
- Keep the AI link private until DentalFirst agrees

---

## 12. The pitch (informal meeting)

**Goal:** one concrete next step: "Can I do a free practice check with your data?" No price talk, no contract.

### 1. Opening (1–2 min)
> "I had a look at your Instagram. You post really regularly, and the before-and-after photos are great. Do you do that yourself, or does someone on the team handle it?"

### 2. Ask before showing (5 min), pick 3–4
> "Do you actually know how many patients come to you through Instagram?"
> "How many appointment requests come in through the website each week, and how quickly does the front desk usually reply?"
> "Roughly how much is sitting in open treatment plans right now, in euros?"
> "Which practice software do you use? Do you look at its statistics regularly?"

Listen for "no idea", "hard to say", "I'd have to check". Each one is your opening.

### 3. Explain (30 seconds)
> "I'm building a tool for dental practices that brings together the data from the practice software, website, Instagram and Google, and explains in plain language what happened and where money is being left on the table. Nothing new for the front desk to learn, and your software stays exactly as it is."

### 4. Show the demo (max 3 things, 5 min)
1. **Overview story:** "This is what you'd get every month."
2. **Marketing → request speed:** "Quick replies turn into patients about twice as often. How is that for you?"
3. **Marketing → Instagram by post type:** "Which posts actually bring patients, not just likes."

Then flip the Data/Insights switch once.

### 5. The offer
> "I'll do a free practice check for you. You give me one export from your practice software and read access to Instagram, and within a week I'll show you three numbers based on your real data: how much planned treatment is still open, what Instagram brings in, and how fast requests get answered. If nothing surprising comes out of it, you've lost nothing."

### 6. Objections
- **"My software already shows that."** → "Partly. But your software doesn't know what happens on Instagram or in your inbox. The interesting answers are in between."
- **"No time."** → "One export, I do the rest. Then a short email once a week, no login needed."
- **"Data protection?"** → "Data processing agreement, EU servers, patients only as ID numbers." (Only promise what you can deliver.)
- **"What does it cost?"** → "The check is free. If you want to continue, we'll talk about a monthly price once you've seen whether it's worth it."

### 7. Close
> "Would it be okay if I message you next week with exactly which export I need? Who on your team knows the software best?"

### Avoid
- saying "dashboard" or "business intelligence"
- presenting demo numbers as his
- criticising his team ("requests on Friday afternoons often wait until Monday", not "your front desk is slow")
- overselling; if he's not interested, ask "What would actually be helpful for you?"

*A German version of all lines exists in the conversation; use it if the meeting is in German.*

---

## 13. Pricing

### Recommended structure
| Step | Price | Purpose |
|---|---|---|
| Practice check | Free, 1 week, real data | Sales tool: show 3 real numbers |
| Pilot | ~€199/month for 3 months | Setup included; feedback, anonymised case study, monthly check-in; success criteria agreed up front |
| Regular | €349–399/month, everything included | One price for a single practice |

**Later**, once group practices ask: a higher tier (from ~€699) for several locations and a monthly review call with you. Don't show it while you don't have those customers. A price you can't justify with real features hurts credibility.

**Extras:** a setup fee of €500–1,000 only if their data needs custom work (waived for pilots); annual payment with two months free.

### Why it makes sense to a dentist
- One accepted implant plan (~€2,300+) pays for about six months.
- €399/month ≈ €13/day: less than one missed check-up.
- US tools charge similar or more (Practice by Numbers listed from $300/month).

### Avoid
- per-user pricing
- **fees tied to new patients or a share of revenue** (hard to measure, and German professional rules restrict payments for patient referrals; get legal advice first)
- prices that are too low (€49 signals a toy)
- promising guaranteed results

*Not legal or tax advice.*

---

## 14. Risks and how to handle them

| Risk | How to handle it |
|---|---|
| Practice software exports are hard to get or messy | Start with manual exports in the pilot; validation report on import; confirm the software in the first meeting |
| Lead sources and reply times aren't recorded | Small setup: question on the medical history form, tagged links, "answered" checkbox |
| Competitors (Roger, charly analytics) | Lead with cross-system insights, request speed and Instagram, not plan follow-up |
| Dashboard gets forgotten | Weekly summary email; front-desk follow-up list; monthly "recovered" report |
| Wrong explanations destroy trust | Numbers only from tested code; answer check; "worth checking" instead of "because" |
| Health data / GDPR | Data processing agreement, EU hosting, pseudonymisation, legal review |
| Overpromising the AI | Promise "what changed, where, and what it's worth", not "why everything happens" |

---

## 15. Roadmap and next steps

### Now
1. Test the AI demo with 30–50 real questions; note mistakes and ⚠ checks
2. Hold the informal meeting with DentalFirst; get the practice software name and a contact person
3. Run the free practice check with their real export and Instagram access

### Next
4. Build the real app with the Claude Code prompt (`PROMPT_G-Intelligence_DentalFirst.md`)
5. Have the data processing agreement reviewed by a lawyer before the first real export
6. Start the 3-month pilot at ~€199/month with agreed success criteria

### Later
7. Monthly "money recovered" report to prove value
8. Decline/cancellation reasons and events log for better "why" answers
9. Flexible query tool and tested forecasts for the AI
10. Real integrations (scheduled exports → APIs where available)
11. Group practices with several locations; benchmarks once you have 20+ practices

---

## 16. Files in this project

| File | Purpose |
|---|---|
| `G-Intelligence_DentalFirst_Complete.md` | This document: the whole project in one place |
| `PROMPT_G-Intelligence_DentalFirst.md` | Full Claude Code prompt to build the real app |
| `G-Intelligence_AI_Analyst.md` | Detailed AI analyst design |
| `G-Intelligence_Demo_DentalFirst.html` | Demo dashboard (single file, offline) |
| `G-Intelligence_Demo_DentalFirst_AI.html` | Demo with the working AI analyst (runs in Claude) |
