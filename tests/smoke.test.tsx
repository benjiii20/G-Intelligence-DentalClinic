// Renders every page in both views and both languages on the server. Catches runtime errors and leftover i18n keys.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { i18n } from '../src/i18n';
import { PAGES, useStore } from '../src/state/store';

const KEY_LIKE = />\s*([a-z][a-zA-Z0-9]*\.)+[a-zA-Z0-9_]+\s*</;

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
