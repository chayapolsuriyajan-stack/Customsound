/**
 * The bottom panel, shared between find-in-files and extension panels.
 *
 * Only one panel is visible at a time; opening a second swaps the content and
 * keeps the first's node alive, so switching back is instant and an extension
 * does not have to rebuild its UI.
 */
import { el } from './ui.js';
import { emitter } from './events.js';

let panel = null;
let titleEl = null;
let bodyEl = null;
let searchField = null;
const owned = new Map();   // title -> content element
let current = null;

export function initPanel(panelEl) {
  panel = panelEl;
  titleEl = panel.querySelector('.panel-title');
  bodyEl = panel.querySelector('.panel-body');
  panel.querySelector('.panel-close').addEventListener('click', hidePanel);
}

/** @returns {{content: HTMLElement, show, hide, dispose}} */
export function openPanel(title) {
  searchField ??= panel.querySelector('.search-field');

  let content = owned.get(title);
  if (!content) {
    content = el('div', { className: 'panel-content' });
    owned.set(title, content);
  }

  const show = () => {
    panel.hidden = false;
    panel.dataset.mode = 'extension';
    if (searchField) searchField.hidden = true;
    titleEl.textContent = title;
    bodyEl.replaceChildren(content);
    current = title;
    emitter.emit('panelOpened', title);
  };
  show();

  return {
    content,
    show,
    hide: () => { if (current === title) hidePanel(); },
    dispose: () => {
      owned.delete(title);
      if (current === title) hidePanel();
    },
  };
}

export function hidePanel() {
  if (!panel) return;
  panel.hidden = true;
  current = null;
  emitter.emit('panelClosed');
}

export const isPanelOpen = () => panel && !panel.hidden;
