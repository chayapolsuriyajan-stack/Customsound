/**
 * The status bar. Core owns the left cluster (workspace, cursor, language);
 * extensions add items through ide.window.createStatusBarItem, which is the
 * same API core uses for its own.
 */
import { el } from './ui.js';
import { emitter } from './events.js';
import { languageLabel } from './langs.js';
import * as ed from './editor.js';

let bar = null;
let spacer = null;

export function initStatusBar(container) {
  bar = container;

  const workspace = addItem({ id: 'core.workspace', text: 'No folder', align: 'left', priority: 0 });
  const problems = addItem({ id: 'core.language', text: '', align: 'right', priority: 10 });
  const cursor = addItem({ id: 'core.cursor', text: '', align: 'right', priority: 20 });
  const encoding = addItem({ id: 'core.encoding', text: 'UTF-8', align: 'right', priority: 30 });

  emitter.on('workspaceChanged', (root) => {
    workspace.text = root ? root.split(/[/\\]/).filter(Boolean).pop() : 'No folder';
    workspace.tooltip = root || '';
  });

  emitter.on('activeChanged', ({ model }) => {
    problems.text = model ? languageLabel(model.getLanguageId()) : '';
    const pos = ed.getEditor()?.getPosition();
    cursor.text = pos ? `Ln ${pos.lineNumber}, Col ${pos.column}` : '';
  });

  emitter.on('cursor', (pos) => {
    cursor.text = `Ln ${pos.lineNumber}, Col ${pos.column}`;
  });

  emitter.on('tabsChanged', ({ active }) => {
    if (active) return;
    problems.text = '';
    cursor.text = '';
  });

  // Clicking the language name opens the language picker, as in VS Code.
  problems.command = 'editor.selectLanguage';
  encoding.tooltip = 'File encoding';

  return { addItem };
}

const items = [];

/**
 * @returns a live handle: assigning .text/.tooltip/.command/.accent updates the
 * DOM immediately, and .dispose() removes it. Extensions hold one of these.
 */
export function addItem({ id, text = '', tooltip = '', align = 'right', priority = 100, command = null, accent = false } = {}) {
  const node = el('div', { className: 'item' + (accent ? ' accent' : ''), textContent: text });
  if (tooltip) node.title = tooltip;

  const entry = { id, node, align, priority };
  items.push(entry);
  layout();

  const handle = {
    get text() { return node.textContent; },
    set text(v) { node.textContent = v; node.hidden = !v; },
    set tooltip(v) { node.title = v; },
    set accent(v) { node.classList.toggle('accent', !!v); },
    set command(v) {
      if (v) {
        node.dataset.clickable = 'true';
        node.onclick = () => emitter.emit('runCommand', v);
      } else {
        delete node.dataset.clickable;
        node.onclick = null;
      }
    },
    show: () => { node.hidden = false; },
    hide: () => { node.hidden = true; },
    dispose: () => {
      node.remove();
      const i = items.indexOf(entry);
      if (i >= 0) items.splice(i, 1);
    },
  };
  if (command) handle.command = command;
  node.hidden = !text;
  return handle;
}

/** Left items, then a flexible gap, then right items -- both priority-sorted. */
function layout() {
  if (!bar) return;
  if (!spacer) spacer = el('div', { className: 'spacer' });
  bar.replaceChildren();
  const by = (side) => items.filter((i) => i.align === side).sort((a, b) => a.priority - b.priority);
  for (const i of by('left')) bar.append(i.node);
  bar.append(spacer);
  for (const i of by('right')) bar.append(i.node);
}
