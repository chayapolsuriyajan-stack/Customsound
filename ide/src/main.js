/**
 * Bootstrap: build the shell, register core commands, restore the session.
 */
import './style.css';

import { fsapi, p } from './core/fsapi.js';
import { icons } from './core/icons.js';
import { el, quickPick, toast, isOverlayOpen, close as closeOverlay } from './core/ui.js';
import { emitter } from './core/events.js';
import { registerCommand, executeCommand, listCommands } from './core/commands.js';
import { bindKey, installKeymap, chordFor } from './core/keymap.js';
import { createEditor } from './core/editor.js';
import * as ed from './core/editor.js';
import { allLanguages, languageLabel } from './core/langs.js';
import { themeNames, applyTheme, activeTheme } from './core/theme.js';
import * as explorer from './core/explorer.js';
import * as tabs from './core/tabs.js';
import { initTabs } from './core/tabs.js';
import { initStatusBar } from './core/statusbar.js';
import { initPanel, hidePanel, isPanelOpen } from './core/panel.js';
import * as search from './core/search.js';
import { quickOpen, invalidateFileList } from './core/quickopen.js';
import { initExtensions, listExtensions, activate as activateExt } from './core/extensions.js';

/* --- shell --------------------------------------------------------------- */

const app = document.getElementById('app');

const iconBtn = (name, title, cls = 'icon-btn') => {
  const b = el('button', { className: cls, title, innerHTML: icons[name] });
  b.type = 'button';
  return b;
};

const activity = el('aside', { className: 'pane activity' });
const btnFiles = iconBtn('files', 'Explorer', '');
const btnSearch = iconBtn('search', 'Search  (Ctrl+Shift+F)', '');
const btnExt = iconBtn('puzzle', 'Extensions', '');
btnFiles.setAttribute('aria-pressed', 'true');
activity.append(btnFiles, btnSearch, btnExt, el('div', { className: 'spacer' }));

const sidebar = el('aside', { className: 'pane sidebar' });
const sidebarTitle = el('span', { className: 'sidebar-title', textContent: 'Explorer' });
const actNewFile = iconBtn('newFile', 'New File');
const actNewFolder = iconBtn('newFolder', 'New Folder');
const actRefresh = iconBtn('refresh', 'Refresh');
const actCollapse = iconBtn('collapse', 'Collapse All');
const sidebarHead = el('div', { className: 'sidebar-head' },
  sidebarTitle,
  el('div', { className: 'sidebar-actions' }, actNewFile, actNewFolder, actRefresh, actCollapse));
const sidebarBody = el('div', { className: 'sidebar-body' });
sidebar.append(sidebarHead, sidebarBody);

const tabStrip = el('div', { className: 'tabs' });
const editorHost = el('div', { id: 'editor', hidden: true });

const welcome = el('section', { className: 'welcome' });
welcome.innerHTML = `
  <h1>Mini<em>Code</em></h1>
  <p>A small editor with a real extension host. Open a file from the explorer, or
     use the keys below. Languages load on demand, one grammar at a time.</p>
  <div class="keys">
    <div><kbd>Ctrl</kbd><kbd>P</kbd> <span>Go to file</span></div>
    <div><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>P</kbd> <span>Command palette</span></div>
    <div><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>F</kbd> <span>Search in files</span></div>
  </div>`;

const panel = el('section', { className: 'panel', hidden: true });
panel.append(
  el('div', { className: 'panel-head' },
    el('span', { className: 'panel-title', textContent: 'Panel' }),
    el('div', { className: 'spacer', style: 'flex:1' }),
    (() => { const b = iconBtn('close', 'Close panel'); b.classList.add('panel-close'); return b; })()),
  el('div', { className: 'panel-body' }));

const main = el('main', { className: 'main' }, tabStrip, welcome, editorHost, panel);
const status = el('footer', { className: 'status' });

app.append(activity, sidebar, main, status);

/* --- init ---------------------------------------------------------------- */

createEditor(editorHost);
initTabs(tabStrip);
initStatusBar(status);
initPanel(panel);
search.initSearch(panel);
explorer.initExplorer(sidebarBody);
installKeymap();

/** The editor is only shown once something is open; otherwise the welcome is. */
function syncMainView() {
  const has = tabs.openTabs().length > 0;
  editorHost.hidden = !has;
  welcome.hidden = has;
  if (has) ed.getEditor()?.layout();
}
emitter.on('tabsChanged', syncMainView);

/* --- file opening -------------------------------------------------------- */

emitter.on('openFile', async (path, opts = {}) => {
  const ok = await tabs.open(path);
  if (!ok) return;
  syncMainView();
  if (opts.line) {
    const editor = ed.getEditor();
    editor.revealLineInCenter(opts.line);
    editor.setPosition({ lineNumber: opts.line, column: 1 });
    editor.focus();
  }
});

emitter.on('runCommand', (id) => executeCommand(id).catch((err) => toast(err.message, 'error')));

// Any filesystem mutation invalidates the quick-open index.
emitter.on('pathRenamed', invalidateFileList);
emitter.on('pathRemoved', invalidateFileList);

/* --- sidebar views ------------------------------------------------------- */

function showExplorer() {
  sidebar.hidden = false;
  sidebarTitle.textContent = 'Explorer';
  sidebarHead.querySelector('.sidebar-actions').hidden = false;
  sidebarBody.replaceChildren();
  explorer.initExplorer(sidebarBody);
  explorer.refresh();
  setActivity(btnFiles);
}

async function showExtensionsView() {
  sidebar.hidden = false;
  sidebarTitle.textContent = 'Extensions';
  sidebarHead.querySelector('.sidebar-actions').hidden = true;
  sidebarBody.replaceChildren();

  const list = el('div', { className: 'tree' });
  for (const x of listExtensions()) {
    const row = el('div', { className: 'row file' });
    row.style.paddingLeft = '10px';
    row.append(el('span', { className: 'chevron leaf' }));
    row.append(el('span', { className: 'ficon', textContent: x.active ? '●' : '○' }));
    row.append(el('span', { className: 'label', textContent: `${x.name} ${x.version}` }));
    row.title = `${x.id} — ${x.description || 'no description'}\n${x.source}, ${x.active ? 'active' : 'not yet activated'}`;
    row.addEventListener('click', () => activateExt(x.id).then(showExtensionsView).catch(() => {}));
    list.append(row);
  }
  sidebarBody.append(list);
  setActivity(btnExt);
}

function setActivity(button) {
  for (const b of [btnFiles, btnSearch, btnExt]) b.setAttribute('aria-pressed', String(b === button));
}

btnFiles.addEventListener('click', () => {
  if (sidebarTitle.textContent === 'Explorer' && !sidebar.hidden) sidebar.hidden = true;
  else showExplorer();
});
btnExt.addEventListener('click', showExtensionsView);
btnSearch.addEventListener('click', () => executeCommand('search.findInFiles'));

actNewFile.addEventListener('click', () => explorer.newFile());
actNewFolder.addEventListener('click', () => explorer.newFolder());
actRefresh.addEventListener('click', () => { invalidateFileList(); explorer.refresh(); });
actCollapse.addEventListener('click', () => explorer.collapseAll());

/* --- core commands ------------------------------------------------------- */

const cmd = (id, title, run, category = '') => registerCommand(id, run, { title, category });

cmd('workspace.openFolder', 'Open Folder...', async () => {
  const dir = await fsapi.pickFolder();
  if (dir) await openWorkspace(dir);
}, 'File');

cmd('file.new', 'New File', () => explorer.newFile(), 'File');
cmd('file.newFolder', 'New Folder', () => explorer.newFolder(), 'File');
cmd('file.save', 'Save', async () => {
  if (!ed.activePath()) return;
  try {
    await ed.save();
    toast(`Saved ${p.base(ed.activePath())}`);
  } catch (err) {
    toast(`Save failed: ${err.message}`, 'error');
  }
}, 'File');
cmd('file.saveAll', 'Save All', async () => {
  const dirty = ed.anyDirty();
  for (const path of dirty) await ed.save(path);
  toast(dirty.length ? `Saved ${dirty.length} file${dirty.length === 1 ? '' : 's'}` : 'Nothing to save');
}, 'File');

cmd('file.rename', 'Rename File', () => {
  const target = explorer.selectedPath() || ed.activePath();
  if (target) explorer.rename(target);
}, 'File');
cmd('file.delete', 'Delete File', () => {
  const target = explorer.selectedPath() || ed.activePath();
  if (target) explorer.remove(target);
}, 'File');

cmd('view.quickOpen', 'Go to File...', quickOpen, 'Go');
cmd('view.commandPalette', 'Command Palette', showCommandPalette, 'View');
cmd('view.explorer', 'Show Explorer', showExplorer, 'View');
cmd('view.extensions', 'Show Extensions', showExtensionsView, 'View');
cmd('view.toggleSidebar', 'Toggle Sidebar', () => { sidebar.hidden = !sidebar.hidden; }, 'View');

cmd('search.findInFiles', 'Search in Files', () => { search.show(); setActivity(btnSearch); }, 'Search');

cmd('tab.close', 'Close Editor', () => tabs.closeActive(), 'View');
cmd('tab.next', 'Next Editor', () => tabs.next(), 'View');
cmd('tab.prev', 'Previous Editor', () => tabs.prev(), 'View');

cmd('editor.selectLanguage', 'Change Language Mode', async () => {
  const path = ed.activePath();
  if (!path) return toast('No file open.', 'warn');
  const choice = await quickPick({
    placeholder: 'Select language mode',
    items: allLanguages().map((l) => ({ label: l.label, description: l.id, value: l.id })),
  });
  if (choice) {
    ed.setLanguage(path, choice);
    emitter.emit('activeChanged', { path, model: ed.modelFor(path) });
  }
}, 'Editor');

cmd('editor.selectTheme', 'Color Theme', async () => {
  const choice = await quickPick({
    placeholder: 'Select color theme',
    items: themeNames().map((n) => ({ label: n, detail: n === activeTheme() ? 'current' : '', value: n })),
  });
  if (choice) {
    applyTheme(choice);
    localStorage.setItem('minicode.theme', choice);
  }
}, 'Preferences');

// Escape unwinds one layer at a time: overlay, then panel, then back to code.
// Registered without a title so it stays out of the palette -- it is a key
// binding, not something anyone would go looking for in a command list.
registerCommand('view.dismiss', () => {
  if (isOverlayOpen()) closeOverlay();
  else if (isPanelOpen()) hidePanel();
  else ed.getEditor()?.focus();
});

async function showCommandPalette() {
  const choice = await quickPick({
    placeholder: 'Type a command...',
    items: listCommands().map((c) => ({
      label: c.title,
      description: c.category,
      detail: chordFor(c.id),
      value: c.id,
    })),
  });
  if (choice) executeCommand(choice).catch((err) => toast(err.message, 'error'));
}

/* --- keybindings --------------------------------------------------------- */

bindKey('ctrl+p', 'view.quickOpen');
bindKey('ctrl+shift+p', 'view.commandPalette');
bindKey('ctrl+shift+f', 'search.findInFiles');
bindKey('ctrl+s', 'file.save');
bindKey('ctrl+shift+s', 'file.saveAll');
bindKey('ctrl+w', 'tab.close');
bindKey('ctrl+n', 'file.new');
bindKey('ctrl+b', 'view.toggleSidebar');
bindKey('ctrl+tab', 'tab.next');
bindKey('ctrl+shift+tab', 'tab.prev');
bindKey('esc', 'view.dismiss');
bindKey('f2', 'file.rename');

/* --- session ------------------------------------------------------------- */

const SESSION_KEY = 'minicode.session';

async function openWorkspace(root) {
  await explorer.setRoot(root);
  emitter.emit('workspaceChanged', root);
  invalidateFileList();
}

function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      tabs: tabs.openTabs(),
      active: tabs.activeTab(),
    }));
  } catch { /* quota or private mode -- session restore is a convenience */ }
}
emitter.on('tabsChanged', saveSession);

async function restoreSession() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); } catch { return; }
  if (!saved.tabs?.length) return;
  // Only reopen files that still exist; a session outlives the files in it.
  const alive = [];
  for (const path of saved.tabs) {
    if (await fsapi.exists(path).catch(() => false)) alive.push(path);
  }
  await tabs.restore(alive, saved.active);
  syncMainView();
}

// Warn before losing unsaved work. Under Tauri this maps to the window close
// request; in the browser it is the standard beforeunload prompt.
window.addEventListener('beforeunload', (e) => {
  if (ed.anyDirty().length) { e.preventDefault(); e.returnValue = ''; }
});

/* --- go ------------------------------------------------------------------ */

(async function start() {
  const root = await fsapi.root();
  await openWorkspace(root);
  await initExtensions();

  const savedTheme = localStorage.getItem('minicode.theme');
  if (savedTheme) applyTheme(savedTheme);

  await restoreSession();
  syncMainView();
  document.documentElement.dataset.ready = 'true';
})().catch((err) => {
  console.error(err);
  toast(`Startup failed: ${err.message}`, 'error');
});
