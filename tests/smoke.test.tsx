// Renders every page in both views and both languages on the server. Catches runtime errors and leftover i18n keys.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { i18n } from '../src/i18n';
import { PAGES, renderLiveStateOnServer, useStore } from '../src/state/store';

// server rendering reads the store's initial state: point it at the live state
renderLiveStateOnServer();

const KEY_LIKE = />\s*([a-z][a-zA-Z0-9]*\.)+[a-zA-Z0-9_]+\s*</;

describe('weekly summary and disconnected sources', () => {
  for (const lang of ['de', 'en'] as const) {
    it(`weekly summary renders (${lang})`, async () => {
      await i18n.changeLanguage(lang);
      useStore.setState({ lang, view: 'insights', page: 'overview', month: '2026-10', weeklyOpen: true });
      const html = renderToString(<App />);
      expect(html).toContain('role="dialog"');
      expect(html).not.toMatch(KEY_LIKE);
      useStore.setState({ weeklyOpen: false });
    });
    it(`pages show "connect" messages when every source is disconnected (${lang})`, async () => {
      await i18n.changeLanguage(lang);
      const all = { ...useStore.getState().connected };
      const off = Object.fromEntries(Object.keys(all).map((k) => [k, false])) as typeof all;
      for (const view of ['insights', 'data'] as const) {
        for (const page of PAGES) {
          useStore.setState({ lang, view, page, month: '2026-10', selection: null, connected: off });
          const html = renderToString(<App />);
          expect(html).not.toMatch(KEY_LIKE);
          expect(html).not.toContain('NaN');
        }
      }
      // one source at a time
      for (const key of Object.keys(all)) {
        for (const page of PAGES) {
          useStore.setState({ lang, view: 'insights', page, connected: { ...all, [key]: false } });
          expect(renderToString(<App />)).not.toContain('NaN');
        }
      }
      useStore.setState({ connected: all });
    });
  }
});

describe('every page renders', () => {
  for (const lang of ['de', 'en'] as const) {
    for (const view of ['insights', 'data'] as const) {
      for (const page of PAGES) {
        for (const month of ['2026-10', '2026-03', '2025-10']) {
          it(`${lang} · ${view} · ${page} · ${month}`, async () => {
            await i18n.changeLanguage(lang);
            useStore.setState({ lang, view, page, month, selection: null, weeklyOpen: false });
            const html = renderToString(<App />);
            expect(html.length).toBeGreaterThan(500);
            expect(html).toContain(i18n.t(view === 'insights' || page === 'ask' || page === 'sources' ? `question.${page}` : `nav.${page}.name`, { month: 'X' }).slice(0, 10).replace(/&/g, '&amp;'));
            // an untranslated key would show up as text like "nav.overview.name"
            expect(html).not.toMatch(KEY_LIKE);
            expect(html).not.toContain('NaN');
            expect(html).not.toContain('undefined');
          });
        }
      }
    }
  }
});
