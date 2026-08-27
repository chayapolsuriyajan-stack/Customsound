/**
 * The tab strip. Owns which file is visible and the unsaved-changes gate on
 * close; the editor module owns the models behind them.
 */
import { el, confirm, toast } from './ui.js';
import { p } from './fsapi.js';
import { emitter } from './events.js';
import * as ed from './editor.js';

let strip = null;
let order = [];        // open paths, in tab order
let active = null;

export function initTabs(container) {
  strip = container;

  emitter.on('dirty', ({ path, dirty }) => {
    tabNode(path)?.classList.toggle('dirty', dirty);
  });

  // Keep tabs honest when the explorer changes the filesystem underneath them.
  emitter.on('pathRenamed', ({ from, to }) => {
    if (!order.includes(from)) return;
    ed.renameModel(from, to);
    order = order.map((x) => (x === from ? to : x));
    if (active === from) active = to;
    render();
  });
  emitter.on('pathRemoved', (path) => {
    for (const open of [...order]) {
      // A deleted directory takes its open descendants with it.
      if (open === path || open.startsWith(path + '/')) closeTab(open, { force: true });
    }
  });

  return { open, closeTab, closeActive, next, prev };
}

const tabNode = (path) => strip?.querySelector(`[data-path="${cssEscape(path)}"]`);
const cssEscape = (s) => (window.CSS?.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));

export async function open(path) {
  if (!order.includes(path)) {
    try {
      await ed.openModel(path);
    } catch (err) {
      toast(err.message, 'warn');
      return false;
    }
    order.push(path);
  }
  active = path;
  render();
  ed.showModel(path);
  emitter.emit('tabsChanged', { order, active });
  return true;
}

export async function closeTab(path, { force = false } = {}) {
  if (!order.includes(path)) return true;

  if (!force && ed.isDirty(path)) {
    const discard = await confirm(`${p.base(path)} has unsaved changes.`, 'Discard changes');
    if (!discard) return false;
  }

  const idx = order.indexOf(path);
  order.splice(idx, 1);
  ed.disposeModel(path);

  if (active === path) {
    // Prefer the tab to the left, matching what VS Code does.
    active = order[idx - 1] || order[idx] || null;
  }
  render();
  if (active) ed.showModel(active);
  emitter.emit('tabsChanged', { order, active });
  return true;
}

export const closeActive = () => (active ? closeTab(active) : Promise.resolve(true));

export function next() { step(1); }
export function prev() { step(-1); }

function step(delta) {
  if (order.length < 2) return;
  const i = (order.indexOf(active) + delta + order.length) % order.length;
  open(order[i]);
}

function render() {
  if (!strip) return;
  strip.replaceChildren();
  for (const path of order) {
    const tab = el('div', { className: 'tab' + (path === active ? ' active' : '') });
    tab.dataset.path = path;
    tab.title = path;
    if (ed.isDirty(path)) tab.classList.add('dirty');

    tab.append(el('span', { className: 'name', textContent: p.base(path) }));

    const close = el('button', { className: 'close', title: 'Close', innerHTML: '&times;' });
    close.addEventListener('mousedown', (e) => { e.stopPropagation(); });
    close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(path); });
    tab.append(close);

    tab.addEventListener('mousedown', (e) => {
      if (e.button === 1) { e.preventDefault(); closeTab(path); }   // middle-click
      else if (e.button === 0) open(path);
    });
    strip.append(tab);
  }
  strip.parentElement?.classList.toggle('has-tabs', order.length > 0);
  tabNode(active)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export const openTabs = () => [...order];
export const activeTab = () => active;

/** Restore a previous session's tabs, skipping any file that has since gone. */
export async function restore(paths, activePath) {
  for (const path of paths) await open(path);
  if (activePath && order.includes(activePath)) await open(activePath);
}
