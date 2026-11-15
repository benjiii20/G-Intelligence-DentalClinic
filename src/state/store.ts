import { create } from 'zustand';
import { addMonths } from '../data/dates';
import { getDemoData } from '../data/demo';
import type { Dataset, PracticeEvent, SourceKey } from '../data/types';
import { SOURCE_KEYS } from '../data/types';

export type Lang = 'de' | 'en';
export type View = 'data' | 'insights';
export const PAGES = ['overview', 'revenue', 'plans', 'marketing', 'patients', 'chairs', 'ask', 'sources'] as const;
export type PageKey = (typeof PAGES)[number];

/** What is open in a page's detail panel. */
export interface Selection {
  kind: 'treatment' | 'staff' | 'channel' | 'patient' | 'section';
  id: string;
}

const LS_LANG = 'gi.lang';
const LS_EVENTS = 'gi.events';
const LS_SOURCES = 'gi.sources';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage not available: the app still works */
  }
}

const allOn = (): Record<SourceKey, boolean> => Object.fromEntries(SOURCE_KEYS.map((k) => [k, true])) as Record<SourceKey, boolean>;

interface State {
  lang: Lang;
  view: View;
  page: PageKey;
  month: string;
  selection: Selection | null;
  weeklyOpen: boolean;
  /** a question handed to the Ask page (from a chip on another page) */
  askDraft: string | null;
  /** demo data or imported real data (memory only, never persisted) */
  base: Dataset;
  /** demo mode: which sources are "connected" */
  connected: Record<SourceKey, boolean>;
  lastSync: Record<SourceKey, string>;
  userEvents: PracticeEvent[];

  setLang: (lang: Lang) => void;
  setView: (view: View) => void;
  go: (page: PageKey, selection?: Selection | null) => void;
  setMonth: (month: string) => void;
  stepMonth: (delta: number) => void;
  select: (selection: Selection | null) => void;
  toggleSelect: (selection: Selection) => void;
  setWeeklyOpen: (open: boolean) => void;
  askAbout: (question: string) => void;
  clearAskDraft: () => void;
  setConnected: (key: SourceKey, on: boolean) => void;
  syncSource: (key: SourceKey) => void;
  addEvent: (event: PracticeEvent) => void;
  removeEvent: (id: string) => void;
  loadRealData: (data: Dataset) => void;
  clearData: () => void;
}

const demo = getDemoData();
const SYNC_DEFAULT = '2026-11-01T03:10';

/**
 * Server rendering (tests, scripts) reads the store's initial state. Calling this makes it
 * read the live state instead, so a page set with setState is the page that renders.
 */
export let renderLiveStateOnServer: () => void = () => {};

export const useStore = create<State>((set, get, api) => {
  renderLiveStateOnServer = () => {
    api.getInitialState = api.getState;
  };
  return {
  lang: read<Lang>(LS_LANG, 'de') === 'en' ? 'en' : 'de',
  view: 'insights',
  page: 'overview',
  month: demo.lastMonth,
  selection: null,
  weeklyOpen: false,
  askDraft: null,
  base: demo,
  connected: { ...allOn(), ...read<Partial<Record<SourceKey, boolean>>>(LS_SOURCES, {}) },
  lastSync: Object.fromEntries(SOURCE_KEYS.map((k) => [k, SYNC_DEFAULT])) as Record<SourceKey, string>,
  userEvents: read<PracticeEvent[]>(LS_EVENTS, []),

  setLang: (lang) => {
    write(LS_LANG, lang);
    set({ lang });
  },
  setView: (view) => set({ view }),
  go: (page, selection = null) => {
    set({ page, selection });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  },
  setMonth: (month) => {
    const { base } = get();
    if (month >= base.firstMonth && month <= base.lastMonth) set({ month });
  },
  stepMonth: (delta) => get().setMonth(addMonths(get().month, delta)),
  select: (selection) => set({ selection }),
  toggleSelect: (selection) => {
    const cur = get().selection;
    set({ selection: cur && cur.kind === selection.kind && cur.id === selection.id ? null : selection });
  },
  setWeeklyOpen: (weeklyOpen) => set({ weeklyOpen }),
  askAbout: (question) => {
    set({ askDraft: question, weeklyOpen: false });
    get().go('ask');
  },
  clearAskDraft: () => set({ askDraft: null }),
  setConnected: (key, on) => {
    const connected = { ...get().connected, [key]: on };
    write(LS_SOURCES, connected);
    set({ connected });
  },
  syncSource: (key) => {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    set({ lastSync: { ...get().lastSync, [key]: stamp } });
  },
  addEvent: (event) => {
    const userEvents = [...get().userEvents, event];
    write(LS_EVENTS, userEvents);
    set({ userEvents });
  },
  removeEvent: (id) => {
    const userEvents = get().userEvents.filter((e) => e.id !== id);
    write(LS_EVENTS, userEvents);
    set({ userEvents });
  },
  loadRealData: (data) => set({ base: data, month: data.lastMonth, selection: null, page: 'overview' }),
  clearData: () => {
    try {
      localStorage.removeItem(LS_EVENTS);
      localStorage.removeItem(LS_SOURCES);
    } catch {
      /* ignore */
    }
    set({ base: demo, month: demo.lastMonth, selection: null, userEvents: [], connected: allOn() });
  },
};
});

let memo: { base: Dataset; connected: Record<SourceKey, boolean>; userEvents: PracticeEvent[]; out: Dataset } | null = null;

/** The dataset every page and AI tool reads: base records + connection switches + user events. */
export function effectiveData(base: Dataset, connected: Record<SourceKey, boolean>, userEvents: PracticeEvent[]): Dataset {
  if (memo && memo.base === base && memo.connected === connected && memo.userEvents === userEvents) return memo.out;
  const sources = { ...base.sources };
  for (const k of SOURCE_KEYS) sources[k] = base.sources[k] && (base.mode === 'real' ? true : connected[k]);
  // user-entered staff holidays also reduce bookable time
  const staff = base.staff.map((s) => {
    const extra = userEvents.filter((e) => e.type === 'holiday' && e.staffId === s.id).map((e) => ({ from: e.from, to: e.to }));
    return extra.length ? { ...s, absences: [...s.absences, ...extra] } : s;
  });
  const out: Dataset = { ...base, staff, sources, events: [...base.events, ...userEvents] };
  memo = { base, connected, userEvents, out };
  return out;
}

export function useData(): Dataset {
  const base = useStore((s) => s.base);
  const connected = useStore((s) => s.connected);
  const userEvents = useStore((s) => s.userEvents);
  return effectiveData(base, connected, userEvents);
}

export function currentData(): Dataset {
  const s = useStore.getState();
  return effectiveData(s.base, s.connected, s.userEvents);
}
