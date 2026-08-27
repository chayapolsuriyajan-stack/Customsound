/**
 * Ctrl+Shift+F. Text search across the workspace, rendered into the bottom
 * panel. The recursive walk happens in the backend (Rust in the app, the dev
 * middleware in the browser) so a large tree does not block the UI thread.
 */
import { fsapi, p } from './fsapi.js';
import { el } from './ui.js';
import { emitter } from './events.js';

let panel = null;
let input = null;
let body = null;
let title = null;

export function initSearch(panelEl) {
  panel = panelEl;
  title = panel.querySelector('.panel-title');
  body = panel.querySelector('.panel-body');

  const field = el('div', { className: 'search-field' });
  input = el('input', { placeholder: 'Search in files...', spellcheck: false });
  field.append(input);
  panel.querySelector('.panel-head').after(field);

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 220);   // debounce: each keystroke is a full walk
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(timer); run(); }
    if (e.key === 'Escape') { e.stopPropagation(); hide(); }
  });
}

export function show() {
  panel.hidden = false;
  panel.dataset.mode = 'search';
  panel.querySelector('.search-field').hidden = false;
  title.textContent = 'Search';
  input.focus();
  input.select();
}

export function hide() {
  panel.hidden = true;
  emitter.emit('panelClosed');
}

export const isVisible = () => panel && !panel.hidden;

async function run() {
  const query = input.value.trim();
  body.replaceChildren();
  if (query.length < 2) {
    body.append(el('p', { className: 'prose', textContent: 'Type at least two characters to search.' }));
    return;
  }

  body.append(el('p', { className: 'prose', textContent: 'Searching...' }));
  let hits;
  try {
    hits = await fsapi.search(query, 300);
  } catch (err) {
    body.replaceChildren(el('p', { className: 'prose', textContent: `Search failed: ${err.message}` }));
    return;
  }

  body.replaceChildren();
  if (!hits.length) {
    body.append(el('p', { className: 'prose', textContent: `No results for "${query}".` }));
    return;
  }

  const files = new Set(hits.map((h) => h.path));
  title.textContent = `Search — ${hits.length} result${hits.length === 1 ? '' : 's'} in ${files.size} file${files.size === 1 ? '' : 's'}`;

  for (const hit of hits) {
    const row = el('div', { className: 'hit' });
    row.append(el('span', { className: 'where', textContent: `${p.base(hit.path)}:${hit.line}` }));

    // Highlight the match inside the line without building HTML from file text.
    const text = el('span', { className: 'text' });
    const idx = hit.text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) {
      text.textContent = hit.text.trim();
    } else {
      text.append(hit.text.slice(0, idx));
      text.append(el('mark', { textContent: hit.text.slice(idx, idx + query.length) }));
      text.append(hit.text.slice(idx + query.length));
    }
    row.append(text);
    row.title = hit.path;
    row.addEventListener('click', () => emitter.emit('openFile', hit.path, { line: hit.line }));
    body.append(row);
  }
}
