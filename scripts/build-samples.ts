// Writes one sample export per import type to public/samples/, built from the invented demo data.
// German column names, semicolons and German number formats, like a typical export.
// Run: npx tsx scripts/build-samples.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { getDemoData } from '../src/data/demo';
import type { Channel, District, PostType, RequestChannel, Treatment } from '../src/data/types';

const d = getDemoData();
const dir = new URL('../public/samples/', import.meta.url);
mkdirSync(dir, { recursive: true });

const de = (n: number, digits = 2) => n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const date = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
const cell = (v: string | number | null | undefined) => {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function write(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const text = '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  writeFileSync(new URL(name, dir), text, 'utf-8');
  console.log(name, rows.length, 'rows');
}

// staff short codes instead of names
const code = (id: string) => `K${'ABCDE'.indexOf(id) + 1}`;
const pid = (id: string) => id.replace('#', '');

const TREATMENT: Record<Treatment, string> = {
  implants_surgery: 'Implantat',
  crowns_lab: 'Krone/Brücke (Eigenlabor)',
  aesthetics: 'Bleaching/Veneers',
  endo_perio: 'Wurzelbehandlung',
  prevention: 'PZR',
  checkups_cmd: 'Kontrolle/Füllung',
};
const STATUS = { completed: 'erledigt', cancelled: 'abgesagt', no_show: 'nicht erschienen' };
const REASON: Record<string, string> = { illness: 'krank', forgot: 'vergessen', cost: 'Kosten', other: 'Sonstiges', not_recorded: '' };
const lab = new Map(d.labWork.map((l) => [l.appointmentId, l.amount]));

write(
  'termine.csv',
  ['Datum', 'Uhrzeit', 'Patienten-Nr.', 'Behandler', 'Leistung', 'Betrag', 'Status', 'Folgetermin', 'Labor', 'Absagegrund', 'Bemerkung'],
  d.appointments.map((a, i) => [
    date(a.at),
    a.at.slice(11, 16),
    pid(a.patientId),
    code(a.staffId),
    TREATMENT[a.treatment],
    a.status === 'completed' ? de(a.billed) : '',
    STATUS[a.status],
    a.status === 'completed' ? (a.nextBooked ? 'ja' : 'nein') : '',
    lab.has(a.id) ? de(lab.get(a.id)!) : '',
    a.cancelReason ? REASON[a.cancelReason] : '',
    i % 97 === 0 ? 'Rückruf erbeten' : '',
  ]),
);

const PLAN_STATUS = { open: 'offen', accepted: 'angenommen', declined: 'abgelehnt', expired: 'abgelaufen' };
const DECLINE: Record<string, string> = { cost: 'Kosten', wants_to_think: 'Bedenkzeit', second_opinion: 'Zweitmeinung', other: 'Sonstiges', not_recorded: '' };
write(
  'behandlungsplaene.csv',
  ['HKP-Nr.', 'Patienten-Nr.', 'Behandler', 'Art', 'Betrag', 'Erstellt am', 'HKP-Status', 'Angenommen am', 'Abgelehnt am', 'Ratenzahlung angeboten', 'Ablehnungsgrund'],
  d.plans.map((p) => [
    p.id,
    pid(p.patientId),
    code(p.dentistId),
    TREATMENT[p.treatment],
    de(p.value),
    date(p.created),
    PLAN_STATUS[p.status],
    p.acceptedDate ? date(p.acceptedDate) : '',
    p.closedDate ? date(p.closedDate) : '',
    p.instalmentsOffered === 'yes' ? 'ja' : p.instalmentsOffered === 'no' ? 'nein' : '',
    p.declineReason ? DECLINE[p.declineReason] : '',
  ]),
);

const SOURCE: Record<Channel, string> = {
  website: 'Website',
  google: 'Google',
  instagram: 'Instagram',
  referral: 'Empfehlung',
  reviews: 'Bewertung',
  intl_site: 'Englische/Russische Website',
  phone: 'Telefon',
};
const PLZ: Record<District, string> = { charlottenburg: '10627', westend: '14052', wilmersdorf: '10713', grunewald: '14193', spandau: '13585', schoeneberg: '10781', other: '10115' };
const PAYER = { GKV: 'GKV', PKV: 'PKV', self: 'Selbstzahler' };
const seen = new Set(d.appointments.map((a) => a.patientId));
write(
  'patienten.csv',
  ['Patienten-Nr.', 'Erstbesuch', 'Kostenträger', 'Quelle', 'PLZ', 'Geburtsjahr'],
  d.patients
    .filter((p) => seen.has(p.id))
    .map((p) => [pid(p.id), p.firstVisit ? date(p.firstVisit) : '', p.payer ? PAYER[p.payer] : '', p.channel ? SOURCE[p.channel] : '', p.district ? PLZ[p.district] : '', p.birthYearRange?.slice(0, 4) ?? '']),
);

write(
  'recall.csv',
  ['Patienten-Nr.', 'Recall-Datum', 'Gesetzt am'],
  d.recalls.map((r) => [pid(r.patientId), date(r.due), r.createdAt ? date(r.createdAt) : '']),
);

const REQ_CHANNEL: Record<RequestChannel, string> = {
  website_form: 'Website-Formular',
  email: 'E-Mail',
  site_en: 'Englische Website',
  site_ru: 'Russische Website',
  instagram_dm: 'Instagram DM',
  instagram_bio: 'Instagram Link in Bio',
  phone: 'Telefon',
};
const dt = (s: string | null) => (s ? `${date(s)} ${s.slice(11, 16)}` : '');
write(
  'anfragen.csv',
  ['Eingang', 'Erste Antwort', 'Kanal', 'Quelle', 'Wurde Patient'],
  d.requests.map((r) => [dt(r.receivedAt), dt(r.firstReplyAt), REQ_CHANNEL[r.channel], r.source ? SOURCE[r.source] : '', r.becamePatientId ? pid(r.becamePatientId) : '']),
);

const POST: Record<PostType, string> = { before_after: 'Vorher/Nachher', implant_lab: 'Implantatfall/Labor', team: 'Team & Praxis', tips: 'Tipps', anxious: 'Angstpatienten/Sedierung' };
const messages = new Map(d.igMonthly.map((m) => [m.month, m.messages]));
const firstOfMonth = new Set<string>();
write(
  'instagram.csv',
  ['Datum', 'Beitragsart', 'Reichweite', 'Profilaufrufe', 'Link-Klicks', 'Nachrichten'],
  d.igPosts.map((p) => {
    const m = p.date.slice(0, 7);
    const msg = firstOfMonth.has(m) ? '' : messages.get(m);
    firstOfMonth.add(m);
    return [date(p.date), POST[p.type], p.reach, p.profileVisits, p.linkClicks, msg ?? ''];
  }),
);

const MONTH_DE = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
write(
  'google-ads.csv',
  ['Monat', 'Kampagne', 'Kosten', 'Klicks', 'Conversions'],
  d.adSpend.filter((s) => s.platform === 'google_ads').map((s) => [`${MONTH_DE[+s.month.slice(5, 7) - 1]} ${s.month.slice(0, 4)}`, 'Implantate Berlin', de(s.spend), Math.round(s.spend / 2.1), Math.round(s.spend / 45)]),
);
