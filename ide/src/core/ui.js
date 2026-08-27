/**
 * Shared overlay surfaces: the quick-pick list (used by the command palette,
 * quick open, and extension quick picks alike), input prompts, confirms,
 * toasts and the context menu.
 *
 * One implementation serves core and extensions, so anything an extension puts
 * on screen inherits the same bezel language for free.
 */
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const k of kids) node.append(k);
  return node;
};

/* --- fuzzy matching ------------------------------------------------------ */

/**
 * Subsequence match with a light score: consecutive hits and word-boundary
 * hits rank higher, so "qo" finds "quickopen.js" above "queue_output".
 * Returns null when the needle does not match at all.
 */
export function fuzzy(needle, haystack) {
  if (!needle) return { score: 0, hits: [] };
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  const hits = [];
  let score = 0;
  let hi = 0;
  let streak = 0;
  for (const ch of n) {
    const found = h.indexOf(ch, hi);
    if (found === -1) return null;
    const boundary = found === 0 || /[^a-z0-9]/.test(h[found - 1]);
    streak = found === hi ? streak + 1 : 0;
    score += 1 + streak * 2 + (boundary ? 3 : 0);
    hits.push(found);
    hi = found + 1;
  }
  // Prefer shorter haystacks when scores tie.
  return { score: score - haystack.length * 0.01, hits };
}

/** Wrap matched characters in <mark>, escaping everything else. */
export function highlight(text, hits) {
  const set = new Set(hits);
  const frag = document.createDocumentFragment();
  let buf = '';
  const flush = () => { if (buf) { frag.append(buf); buf = ''; } };
  for (let i = 0; i < text.length; i++) {
    if (set.has(i)) { flush(); frag.append(el('mark', { textContent: text[i] })); }
    else buf += text[i];
  }
  flush();
  return frag;
}

/* --- quick pick ---------------------------------------------------------- */

let overlay = null;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = el('div', { className: 'overlay', hidden: true });
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  return overlay;
}

let onClose = null;

export function close() {
  if (overlay) { overlay.hidden = true; overlay.replaceChildren(); }
  const fn = onClose;
  onClose = null;
  if (fn) fn(null);
}

export const isOverlayOpen = () => !!overlay && !overlay.hidden;

/**
 * @param {object} opts
 * @param {string} opts.placeholder
 * @param {Array|Function} opts.items  Array of {label, description, detail, value}
 *        or a function(query) -> Promise<items> for async sources like file search.
 * @returns {Promise<any|null>} the chosen item's `value` (or the item), null if dismissed.
 */
export function quickPick({ placeholder = '', items = [], initial = '' } = {}) {
  const root = ensureOverlay();
  root.replaceChildren();
  root.hidden = false;

  const input = el('input', { placeholder, value: initial, spellcheck: false });
  const list = el('ul');
  const panel = el('div', { className: 'palette' }, input, list);
  root.append(panel);

  let shown = [];
  let index = 0;

  return new Promise((resolve) => {
    onClose = resolve;

    const finish = (value) => { onClose = null; close(); resolve(value); };

    const render = () => {
      list.replaceChildren();
      if (!shown.length) {
        list.append(el('li', { className: 'empty', textContent: 'No matching results.' }));
        return;
      }
      shown.forEach((entry, i) => {
        const { item, hits = [] } = entry;
        const li = el('li');
        li.setAttribute('aria-selected', String(i === index));
        const label = el('span', { className: 'name' });
        label.append(highlight(item.label, hits));
        li.append(label);
        if (item.description) li.append(el('span', { className: 'path', textContent: item.description }));
        if (item.detail) li.append(el('span', { className: 'hint', textContent: item.detail }));
        li.addEventListener('mousedown', (e) => { e.preventDefault(); finish(item.value ?? item); });
        li.addEventListener('mousemove', () => {
          if (index === i) return;
          index = i;
          [...list.children].forEach((c, ci) => c.setAttribute('aria-selected', String(ci === i)));
        });
        list.append(li);
      });
      list.children[index]?.scrollIntoView({ block: 'nearest' });
    };

    let seq = 0;
    const refresh = async () => {
      const q = input.value.trim();
      const mine = ++seq;
      const source = typeof items === 'function' ? await items(q) : items;
      if (mine !== seq) return;   // a newer keystroke already superseded us
      shown = source
        .map((item) => {
          const m = fuzzy(q, item.label);
          return m && { item, hits: m.hits, score: m.score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 200);
      index = 0;
      render();
    };

    input.addEventListener('input', refresh);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
        index = Math.min(index + 1, shown.length - 1); render();
      } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
        index = Math.max(index - 1, 0); render();
      } else if (e.key === 'Enter') {
        const chosen = shown[index]?.item;
        if (chosen) finish(chosen.value ?? chosen);
      } else if (e.key === 'Escape') {
        finish(null);
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    });

    refresh();
    input.focus();
    input.select();
  });
}

/* --- prompt / confirm ---------------------------------------------------- */

/** Single-line text prompt. Resolves null on Escape. */
export function showInputBox({ placeholder = '', value = '', prompt = '', validate } = {}) {
  const root = ensureOverlay();
  root.replaceChildren();
  root.hidden = false;

  const input = el('input', { placeholder, value, spellcheck: false });
  const list = el('ul');
  const panel = el('div', { className: 'palette' }, input, list);
  root.append(panel);

  const note = el('li', { className: 'empty', textContent: prompt });
  if (prompt) list.append(note);

  return new Promise((resolve) => {
    onClose = resolve;
    const finish = (v) => { onClose = null; close(); resolve(v); };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = input.value.trim();
        const err = validate ? validate(v) : null;
        if (err) { note.textContent = err; if (!note.isConnected) list.append(note); return; }
        finish(v || null);
      } else if (e.key === 'Escape') {
        finish(null);
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    });

    input.focus();
    // Pre-select the basename so renaming "app.js" -> "main.js" does not
    // require clearing the extension by hand.
    const dot = value.lastIndexOf('.');
    if (dot > 0) input.setSelectionRange(0, dot); else input.select();
  });
}

export async function confirm(message, confirmLabel = 'Delete') {
  const choice = await quickPick({
    placeholder: message,
    items: [
      { label: confirmLabel, detail: 'Enter', value: true },
      { label: 'Cancel', detail: 'Esc', value: false },
    ],
  });
  return choice === true;
}

/* --- toasts -------------------------------------------------------------- */

let toastHost = null;

export function toast(message, kind = 'info', ms = 3200) {
  if (!toastHost) {
    toastHost = el('div', { className: 'toasts' });
    document.body.append(toastHost);
  }
  const node = el('div', { className: `toast ${kind}`, textContent: message });
  toastHost.append(node);
  setTimeout(() => node.remove(), ms);
  return { dispose: () => node.remove() };
}

/* --- context menu -------------------------------------------------------- */

let menu = null;

/** @param {Array<{label,hint,run,danger}|'-'>} entries */
export function contextMenu(x, y, entries) {
  hideMenu();
  menu = el('div', { className: 'menu' });
  for (const entry of entries) {
    if (entry === '-') { menu.append(el('hr')); continue; }
    const btn = el('button', { className: entry.danger ? 'danger' : '' },
      el('span', { textContent: entry.label }));
    if (entry.hint) btn.append(el('span', { className: 'hint', textContent: entry.hint }));
    btn.addEventListener('click', () => { hideMenu(); entry.run(); });
    menu.append(btn);
  }
  document.body.append(menu);

  // Flip the menu back inside the viewport when opened near an edge.
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;

  const dismiss = (e) => {
    if (menu && !menu.contains(e.target)) hideMenu();
  };
  setTimeout(() => {
    window.addEventListener('mousedown', dismiss, { once: true });
    window.addEventListener('blur', hideMenu, { once: true });
  }, 0);
}

export function hideMenu() {
  menu?.remove();
  menu = null;
}

export { el };
