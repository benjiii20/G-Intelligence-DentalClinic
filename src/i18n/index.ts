import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import type { PracticeEvent, StaffMember } from '../data/types';
import { useStore, type Lang } from '../state/store';
import de from './de.json';
import en from './en.json';
import { fmtFor, type Fmt } from './format';
import glossaryDe from './glossary/de.json';
import glossaryEn from './glossary/en.json';

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de, glossary: glossaryDe },
    en: { translation: en, glossary: glossaryEn },
  },
  lng: useStore.getState().lang,
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
  returnNull: false,
});

useStore.subscribe((s, prev) => {
  if (s.lang !== prev.lang) {
    void i18n.changeLanguage(s.lang);
    if (typeof document !== 'undefined') document.documentElement.lang = s.lang;
  }
});
if (typeof document !== 'undefined') document.documentElement.lang = useStore.getState().lang;

export type TFn = (key: string, vars?: Record<string, unknown>) => string;

export interface Names {
  staff: (id: string) => string;
  treatment: (key: string) => string;
  channel: (key: string | null) => string;
  district: (key: string | null) => string;
  payer: (key: string) => string;
  postType: (key: string) => string;
  source: (key: string) => string;
  event: (e: PracticeEvent) => string;
}

export function makeNames(t: TFn, staff: StaffMember[]): Names {
  return {
    staff: (id) => {
      const s = staff.find((x) => x.id === id);
      if (!s) return id;
      const special = `staff.demo.${s.label}`;
      // demo team: fixed anonymised labels; imported data: role + letter
      const fixed = t(special);
      if (fixed !== special && staff.length === 5 && s.label.length === 1 && 'ABCDE'.includes(s.label)) return fixed;
      return t(`staff.role.${s.role}`, { label: s.label });
    },
    treatment: (key) => t(`treatment.${key}`),
    channel: (key) => t(`channel.${key ?? 'none'}`),
    district: (key) => t(`district.${key ?? 'unknown'}`),
    payer: (key) => t(`payer.${key}`),
    postType: (key) => t(`postType.${key}`),
    source: (key) => t(`sourceName.${key}`),
    event: (e) => (e.descriptionKey ? t(e.descriptionKey) : e.description ?? t(`eventType.${e.type}`)),
  };
}

/** Translation function, number/date formatting and translated names for the current language. */
export function useT(): { t: TFn; f: Fmt; lang: Lang; names: Names } {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const staff = useStore((s) => s.base.staff);
  const tf = t as unknown as TFn;
  return { t: tf, f: fmtFor(lang), lang, names: makeNames(tf, staff) };
}

/** Non-React access (AI fallback, tests). */
export function translator(lang: Lang): TFn {
  return i18n.getFixedT(lang) as unknown as TFn;
}

export { i18n };
