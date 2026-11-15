// Import types and the columns each one understands. Aliases are compared after normalising
// (lower case, umlauts folded, punctuation removed), so "HKP-Nr." matches "hkp nr".

export const IMPORT_TYPES = ['appointments', 'plans', 'patients', 'recall', 'requests', 'instagram', 'google_ads'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export interface FieldDef {
  key: string;
  required?: boolean;
  aliases: string[];
}

export const FIELDS: Record<ImportType, FieldDef[]> = {
  appointments: [
    { key: 'date', required: true, aliases: ['datum', 'termin', 'termindatum', 'date', 'behandlungsdatum', 'tag'] },
    { key: 'time', aliases: ['uhrzeit', 'zeit', 'beginn', 'time', 'start'] },
    { key: 'patientId', required: true, aliases: ['patienten nr', 'patientennr', 'patientennummer', 'pat nr', 'patnr', 'patient id', 'patient nr', 'patient', 'id patient', 'pseudonym'] },
    { key: 'staff', aliases: ['behandler', 'behandlerin', 'zahnarzt', 'mitarbeiter', 'staff', 'dentist', 'arzt', 'kuerzel'] },
    { key: 'treatment', aliases: ['leistung', 'behandlung', 'behandlungsart', 'leistungsart', 'treatment', 'art', 'terminart', 'kategorie'] },
    { key: 'amount', aliases: ['betrag', 'honorar', 'umsatz', 'summe', 'amount', 'betrag eur', 'abgerechnet', 'billed', 'preis'] },
    { key: 'status', aliases: ['status', 'terminstatus', 'state'] },
    { key: 'nextBooked', aliases: ['folgetermin', 'naechster termin', 'next appointment', 'folgetermin gebucht', 'wiedereinbestellt'] },
    { key: 'labAmount', aliases: ['labor', 'laborbetrag', 'eigenlabor', 'lab', 'laborkosten', 'lab amount'] },
    { key: 'cancelReason', aliases: ['absagegrund', 'grund', 'ausfallgrund', 'cancel reason'] },
  ],
  plans: [
    { key: 'planId', required: true, aliases: ['hkp nr', 'hkpnr', 'hkp', 'plan nr', 'plannr', 'kostenvoranschlag', 'kva nr', 'plan id'] },
    { key: 'patientId', required: true, aliases: ['patienten nr', 'patientennr', 'patientennummer', 'pat nr', 'patnr', 'patient id', 'patient nr', 'patient'] },
    { key: 'staff', aliases: ['behandler', 'behandlerin', 'zahnarzt', 'dentist', 'arzt'] },
    { key: 'treatment', aliases: ['leistung', 'behandlung', 'art', 'planart', 'hkp art', 'treatment', 'kategorie'] },
    { key: 'value', required: true, aliases: ['betrag', 'wert', 'summe', 'hkp betrag', 'value', 'eigenanteil', 'gesamtbetrag', 'honorar'] },
    { key: 'created', required: true, aliases: ['erstellt', 'erstellt am', 'datum', 'hkp datum', 'created', 'date'] },
    { key: 'status', aliases: ['hkp status', 'status', 'state'] },
    { key: 'acceptedDate', aliases: ['angenommen am', 'genehmigt am', 'zusage', 'accepted', 'accepted date'] },
    { key: 'closedDate', aliases: ['abgelehnt am', 'abgelaufen am', 'geschlossen am', 'erledigt am', 'closed', 'closed date'] },
    { key: 'instalments', aliases: ['ratenzahlung angeboten', 'ratenzahlung', 'raten', 'instalments', 'instalments offered', 'finanzierung'] },
    { key: 'declineReason', aliases: ['ablehnungsgrund', 'grund', 'decline reason'] },
  ],
  patients: [
    { key: 'patientId', required: true, aliases: ['patienten nr', 'patientennr', 'patientennummer', 'pat nr', 'patnr', 'patient id', 'patient nr', 'patient', 'pseudonym'] },
    { key: 'firstVisit', aliases: ['erstbesuch', 'erster termin', 'neupatient seit', 'aufnahme', 'first visit', 'patient seit'] },
    { key: 'payer', aliases: ['kostentraeger', 'versicherung', 'versicherungsart', 'kasse', 'payer', 'insurance'] },
    { key: 'channel', aliases: ['quelle', 'wie aufmerksam geworden', 'aufmerksam geworden', 'kanal', 'source', 'herkunft', 'empfohlen durch'] },
    { key: 'postcode', aliases: ['plz', 'postleitzahl', 'postcode', 'zip'] },
    { key: 'birthYear', aliases: ['geburtsjahr', 'jahrgang', 'altersgruppe', 'birth year'] },
  ],
  recall: [
    { key: 'patientId', required: true, aliases: ['patienten nr', 'patientennr', 'patientennummer', 'pat nr', 'patnr', 'patient id', 'patient nr', 'patient'] },
    { key: 'due', required: true, aliases: ['recall datum', 'recall', 'faellig', 'faellig am', 'naechster recall', 'due', 'due date'] },
    { key: 'createdAt', aliases: ['letzter termin', 'gesetzt am', 'letzte kontrolle', 'last visit'] },
  ],
  requests: [
    { key: 'receivedAt', required: true, aliases: ['eingang', 'eingegangen', 'empfangen', 'datum', 'received', 'received at', 'zeitpunkt'] },
    { key: 'firstReplyAt', aliases: ['erste antwort', 'antwort', 'beantwortet', 'first reply', 'reply'] },
    { key: 'channel', aliases: ['kanal', 'eingangskanal', 'channel', 'weg'] },
    { key: 'source', aliases: ['quelle', 'utm source', 'herkunft', 'source', 'wie aufmerksam geworden'] },
    { key: 'patientId', aliases: ['patienten nr', 'patientennr', 'wurde patient', 'patient', 'patient id'] },
  ],
  instagram: [
    { key: 'date', required: true, aliases: ['datum', 'veroeffentlicht', 'publish time', 'date', 'veroeffentlichungszeit'] },
    { key: 'type', aliases: ['beitragsart', 'art', 'kategorie', 'thema', 'post type', 'type'] },
    { key: 'reach', required: true, aliases: ['reichweite', 'reach', 'erreichte konten', 'accounts reached'] },
    { key: 'profileVisits', aliases: ['profilaufrufe', 'profile visits', 'profilbesuche'] },
    { key: 'linkClicks', aliases: ['link klicks', 'linkklicks', 'link clicks', 'klicks auf link', 'website klicks'] },
    { key: 'messages', aliases: ['nachrichten', 'messages', 'direktnachrichten'] },
  ],
  google_ads: [
    { key: 'month', required: true, aliases: ['monat', 'month', 'zeitraum', 'datum', 'tag', 'day'] },
    { key: 'campaign', aliases: ['kampagne', 'campaign'] },
    { key: 'cost', required: true, aliases: ['kosten', 'cost', 'ausgaben', 'spend', 'kosten eur'] },
    { key: 'clicks', aliases: ['klicks', 'clicks'] },
    { key: 'conversions', aliases: ['conversions', 'konversionen'] },
  ],
};

/**
 * Columns that must never be imported: names, addresses, contact details, free-text notes, diagnoses, birth dates.
 * (Hashed e-mail/phone values are allowed; see privacy.ts.)
 */
export const FORBIDDEN_COLUMN =
  /^(vor ?name|nach ?name|name|namen|patientenname|patienten name|patient name|first ?name|last ?name|surname|full ?name|anrede|titel|strasse|str|hausnummer|anschrift|adresse|address|street|wohnort|ort|stadt|city|e ?mail|email|mail|telefon|tel|telefonnummer|handy|mobil|mobile|phone|notiz|notizen|bemerkung|bemerkungen|kommentar|kommentare|anmerkung|freitext|notes?|comments?|diagnose|diagnosen|befund|befunde|anamnese|geburtsdatum|geb datum|birth ?date|date of birth|versichertennummer|versicherten nr|kvnr)$/;

export const normalizeHeader = (h: string): string =>
  h
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
