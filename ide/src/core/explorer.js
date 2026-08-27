/**
 * The file tree: lazy-expanded directories, full CRUD, drag-to-move.
 *
 * The DOM is the model. Each row carries its path and depth in dataset, and a
 * directory's children live in a sibling container, so expanding a folder only
 * touches that folder -- no whole-tree re-render on every change.
 */
import { fsapi, p } from './fsapi.js';
import { icons } from './icons.js';
import { el, contextMenu, showInputBox, confirm, toast } from './ui.js';
import { emitter } from './events.js';
import { isDirty } from './editor.js';

let host = null;              // .sidebar-body
let rootPath = '';            // absolute, display only
const expanded = new Set();   // directory paths currently open
let selected = null;

/** Rows keyed by path, so a rename/dirty change can patch one row in place. */
const rows = new Map();

export function initExplorer(container) {
  host = container;
  host.addEventListener('contextmenu', onContextMenu);

  // Right-clicking empty space below the tree acts on the workspace root.
  host.addEventListener('mousedown', (e) => {
    if (e.target === host || e.target.classList.contains('tree')) select(null);
  });

  emitter.on('dirty', ({ path }) => {
    rows.get(path)?.classList.toggle('dirty', isDirty(path));
  });

  return { refresh, revealAndSelect, collapseAll };
}

export async function setRoot(absolutePath) {
  rootPath = absolutePath;
  expanded.clear();
  await refresh();
}

export const workspaceRoot = () => rootPath;

/* --- rendering ----------------------------------------------------------- */

function rowNode(entry, depth) {
  const row = el('div', { className: `row ${entry.isDir ? 'dir' : 'file'}` });
  row.dataset.path = entry.path;
  row.dataset.dir = String(entry.isDir);
  row.style.paddingLeft = `${depth * 12 + 6}px`;
  row.draggable = true;

  const chevron = el('span', { className: `chevron${entry.isDir ? '' : ' leaf'}` });
  chevron.innerHTML = icons.chevron;
  row.append(chevron);

  row.append(el('span', { className: 'ficon', textContent: entry.isDir ? '' : fileGlyph(entry.path) }));
  row.append(el('span', { className: 'label', textContent: entry.name }));

  if (!entry.isDir && isDirty(entry.path)) row.classList.add('dirty');
  if (entry.isDir && expanded.has(entry.path)) row.classList.add('open');

  row.addEventListener('click', () => onActivate(entry));
  wireDrag(row, entry);

  rows.set(entry.path, row);
  return row;
}

/**
 * A single character standing in for a file-type icon. An icon font or an SVG
 * set per language would be the obvious thing, but both cost far more bytes
 * than they earn in a tree this dense.
 */
function fileGlyph(path) {
  const ext = p.ext(path);
  if (['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx'].includes(ext)) return 'JS';
  if (['json', 'yaml', 'yml', 'toml', 'ini'].includes(ext)) return '{}';
  if (['md', 'txt', 'rst'].includes(ext)) return '¶';
  if (['css', 'scss', 'less', 'html'].includes(ext)) return '<>';
  if (['rs', 'go', 'py', 'rb', 'java', 'c', 'cpp', 'h'].includes(ext)) return '#';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return '◇';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return '♪';
  return '·';
}

async function renderInto(container, dir, depth) {
  let entries;
  try {
    entries = await fsapi.readDir(dir);
  } catch (err) {
    toast(`Cannot read ${dir || 'workspace'}: ${err.message}`, 'error');
    return;
  }

  const frag = document.createDocumentFragment();
  entries.forEach((entry, i) => {
    const row = rowNode(entry, depth);
    // Staggered entrance, capped so a 300-file directory does not crawl in.
    if (i < 24) {
      row.classList.add('entering');
      row.style.setProperty('--i', String(i));
    }
    frag.append(row);

    if (entry.isDir && expanded.has(entry.path)) {
      const kids = el('div', { className: 'children' });
      kids.dataset.for = entry.path;
      frag.append(kids);
      renderInto(kids, entry.path, depth + 1);
    }
  });
  container.append(frag);
}

export async function refresh() {
  if (!host) return;
  rows.clear();
  host.replaceChildren();
  const tree = el('div', { className: 'tree' });
  host.append(tree);
  await renderInto(tree, '', 0);
  if (selected) rows.get(selected)?.classList.add('selected');
}

/* --- interaction --------------------------------------------------------- */

function select(path) {
  if (selected) rows.get(selected)?.classList.remove('selected');
  selected = path;
  if (path) rows.get(path)?.classList.add('selected');
}

async function onActivate(entry) {
  select(entry.path);
  if (!entry.isDir) {
    emitter.emit('openFile', entry.path);
    return;
  }
  const row = rows.get(entry.path);
  if (expanded.has(entry.path)) {
    expanded.delete(entry.path);
    row?.classList.remove('open');
    document.querySelector(`.children[data-for="${cssEscape(entry.path)}"]`)?.remove();
  } else {
    expanded.add(entry.path);
    row?.classList.add('open');
    const kids = el('div', { className: 'children' });
    kids.dataset.for = entry.path;
    row.after(kids);
    const depth = Math.round((parseInt(row.style.paddingLeft, 10) - 6) / 12) + 1;
    await renderInto(kids, entry.path, depth);
  }
}

const cssEscape = (s) => (window.CSS?.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));

/** Expand every ancestor of a path, then select it. Used by quick open. */
export async function revealAndSelect(path) {
  const parts = path.split('/').slice(0, -1);
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    expanded.add(acc);
  }
  await refresh();
  select(path);
  rows.get(path)?.scrollIntoView({ block: 'nearest' });
}

export async function collapseAll() {
  expanded.clear();
  await refresh();
}

/* --- CRUD ---------------------------------------------------------------- */

/** Where a new entry should land: inside a selected folder, else beside a file. */
function targetDir() {
  if (!selected) return '';
  const row = rows.get(selected);
  if (row?.dataset.dir === 'true') return selected;
  return p.dir(selected);
}

const nameCheck = (v) => {
  if (!v) return 'Name cannot be empty.';
  if (v.includes('/') || v.includes('\\')) return 'Name cannot contain a path separator.';
  if (v === '.' || v === '..') return 'Reserved name.';
  return null;
};

export async function newFile(dir = targetDir()) {
  const name = await showInputBox({ placeholder: 'File name', prompt: `New file in ${dir || 'workspace root'}`, validate: nameCheck });
  if (!name) return;
  const path = p.join(dir, name);
  try {
    if (await fsapi.exists(path)) return toast(`${name} already exists.`, 'warn');
    await fsapi.createFile(path);
    if (dir) expanded.add(dir);
    await refresh();
    select(path);
    emitter.emit('openFile', path);
  } catch (err) {
    toast(`Could not create ${name}: ${err.message}`, 'error');
  }
}

export async function newFolder(dir = targetDir()) {
  const name = await showInputBox({ placeholder: 'Folder name', prompt: `New folder in ${dir || 'workspace root'}`, validate: nameCheck });
  if (!name) return;
  const path = p.join(dir, name);
  try {
    if (await fsapi.exists(path)) return toast(`${name} already exists.`, 'warn');
    await fsapi.mkdir(path);
    if (dir) expanded.add(dir);
    expanded.add(path);
    await refresh();
    select(path);
  } catch (err) {
    toast(`Could not create ${name}: ${err.message}`, 'error');
  }
}

export async function rename(path) {
  const old = p.base(path);
  const name = await showInputBox({ placeholder: 'New name', value: old, prompt: `Rename ${old}`, validate: nameCheck });
  if (!name || name === old) return;
  const to = p.join(p.dir(path), name);
  try {
    if (await fsapi.exists(to)) return toast(`${name} already exists.`, 'warn');
    await fsapi.rename(path, to);
    // Carry expansion state across the rename so an open folder stays open.
    if (expanded.delete(path)) expanded.add(to);
    emitter.emit('pathRenamed', { from: path, to });
    await refresh();
    select(to);
  } catch (err) {
    toast(`Could not rename ${old}: ${err.message}`, 'error');
  }
}

export async function remove(path) {
  const name = p.base(path);
  if (!(await confirm(`Delete ${name}? This cannot be undone.`))) return;
  try {
    await fsapi.remove(path);
    expanded.delete(path);
    if (selected === path) selected = null;
    emitter.emit('pathRemoved', path);
    await refresh();
  } catch (err) {
    toast(`Could not delete ${name}: ${err.message}`, 'error');
  }
}

export async function duplicate(path) {
  const base = p.base(path);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';

  // Find the first free "name copy", "name copy 2", ... rather than failing.
  let to = p.join(p.dir(path), `${stem} copy${ext}`);
  for (let n = 2; await fsapi.exists(to); n++) {
    to = p.join(p.dir(path), `${stem} copy ${n}${ext}`);
  }
  try {
    await fsapi.copy(path, to);
    await refresh();
    select(to);
  } catch (err) {
    toast(`Could not duplicate ${base}: ${err.message}`, 'error');
  }
}

/* --- drag to move -------------------------------------------------------- */

let dragging = null;

function wireDrag(row, entry) {
  row.addEventListener('dragstart', (e) => {
    dragging = entry.path;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', entry.path);
  });
  row.addEventListener('dragend', () => {
    dragging = null;
    document.querySelectorAll('.row.drop-target').forEach((r) => r.classList.remove('drop-target'));
  });

  if (!entry.isDir) return;   // only folders accept a drop

  row.addEventListener('dragover', (e) => {
    if (!dragging || dragging === entry.path) return;
    // Refuse to drop a folder into its own subtree -- that would orphan it.
    if (entry.path.startsWith(dragging + '/')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drop-target');
  });
  row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
  row.addEventListener('drop', async (e) => {
    e.preventDefault();
    row.classList.remove('drop-target');
    const from = dragging;
    dragging = null;
    if (!from) return;
    await move(from, entry.path);
  });
}

export async function move(from, intoDir) {
  const to = p.join(intoDir, p.base(from));
  if (to === from) return;
  try {
    if (await fsapi.exists(to)) return toast(`${p.base(from)} already exists there.`, 'warn');
    await fsapi.rename(from, to);
    if (expanded.delete(from)) expanded.add(to);
    expanded.add(intoDir);
    emitter.emit('pathRenamed', { from, to });
    await refresh();
    select(to);
  } catch (err) {
    toast(`Could not move ${p.base(from)}: ${err.message}`, 'error');
  }
}

/* --- context menu -------------------------------------------------------- */

function onContextMenu(e) {
  const row = e.target.closest('.row');
  e.preventDefault();

  if (!row) {
    contextMenu(e.clientX, e.clientY, [
      { label: 'New File', run: () => newFile('') },
      { label: 'New Folder', run: () => newFolder('') },
      '-',
      { label: 'Refresh', run: refresh },
    ]);
    return;
  }

  const path = row.dataset.path;
  const isDir = row.dataset.dir === 'true';
  select(path);

  const entries = [];
  if (isDir) {
    entries.push({ label: 'New File', run: () => newFile(path) });
    entries.push({ label: 'New Folder', run: () => newFolder(path) });
    entries.push('-');
  } else {
    entries.push({ label: 'Open', run: () => emitter.emit('openFile', path) });
    entries.push('-');
  }
  entries.push({ label: 'Rename', hint: 'F2', run: () => rename(path) });
  entries.push({ label: 'Duplicate', run: () => duplicate(path) });
  entries.push('-');
  entries.push({ label: 'Copy Path', run: () => navigator.clipboard?.writeText(path).then(() => toast('Path copied.')) });
  entries.push({ label: 'Delete', hint: 'Del', danger: true, run: () => remove(path) });

  contextMenu(e.clientX, e.clientY, entries);
}

export const selectedPath = () => selected;
