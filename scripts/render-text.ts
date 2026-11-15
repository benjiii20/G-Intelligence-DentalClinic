// Prints the visible text of a page. Usage: npx tsx scripts/render-text.ts overview insights de 2026-10
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import App from '../src/App';
import { i18n } from '../src/i18n';
import { renderLiveStateOnServer, useStore, type Lang, type PageKey, type View } from '../src/state/store';

const [page = 'overview', view = 'insights', lang = 'de', month = '2026-10', sel] = process.argv.slice(2);
// server rendering reads the store's initial state: point it at the live state
renderLiveStateOnServer();
await i18n.changeLanguage(lang);
const selection = sel ? { kind: sel.split(':')[0] as 'treatment', id: sel.split(':')[1] } : null;
useStore.setState({ lang: lang as Lang, view: view as View, page: page as PageKey, month, selection });
const html = renderToString(createElement(App));
const main = html.slice(html.indexOf('<main'));
const text = main
  .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
  .replace(/<span[^>]*role="tooltip"[\s\S]*?<\/span>/g, '')
  .replace(/<\/(p|h1|h2|h3|li|tr|div|section|button)>/g, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s*\n+/g, '\n');
console.log(text);
