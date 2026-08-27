/**
 * The `ide` object handed to each extension's activate(context).
 *
 * Everything here returns a disposable, and the host collects them on
 * context.subscriptions, so deactivating an extension genuinely removes its
 * commands, keybindings, panels and status items rather than leaving them
 * wired to a dead module.
 */
import { registerCommand, executeCommand } from './commands.js';
import { bindKey } from './keymap.js';
import { quickPick, showInputBox, toast, el } from './ui.js';
import { emitter } from './events.js';
import { fsapi } from './fsapi.js';
import { monaco, invalidateLanguageMaps } from './langs.js';
import { registerTheme, applyTheme } from './theme.js';
import { addItem } from './statusbar.js';
import * as ed from './editor.js';
import { workspaceRoot } from './explorer.js';
import { openPanel } from './panel.js';

/**
 * @param {string} extId   used to namespace storage and to attribute errors
 * @param {object} subs    the subscriptions array from the activation context
 */
export function makeApi(extId, subs) {
  const track = (d) => { subs.push(d); return d; };

  return {
    version: '0.1.0',

    commands: {
      register: (id, run, meta) => track(registerCommand(id, run, meta)),
      execute: (id, ...args) => executeCommand(id, ...args),
    },

    keybindings: {
      bind: (chord, commandId) => track(bindKey(chord, commandId)),
    },

    window: {
      showMessage: (msg, kind = 'info') => toast(msg, kind),
      showInputBox: (opts) => showInputBox(opts),
      showQuickPick: (items, opts = {}) =>
        quickPick({ ...opts, items: items.map((i) => (typeof i === 'string' ? { label: i, value: i } : i)) }),

      /**
       * Opens the bottom panel and hands back a plain element to render into.
       * Deliberately a raw DOM node, not a component system -- an extension
       * that wants structure can build it, and one that wants a line of text
       * writes textContent.
       */
      createPanel: (title) => {
        const handle = openPanel(title);
        return track(handle);
      },

      createStatusBarItem: (opts = {}) => track(addItem({ id: `${extId}.status`, ...opts })),
    },

    workspace: {
      get rootPath() { return workspaceRoot(); },
      fs: fsapi,
      onDidSaveDocument: (fn) => track(emitter.on('documentSaved', fn)),
      onDidOpenDocument: (fn) => track(emitter.on('documentOpened', fn)),
      onDidChangeActiveDocument: (fn) => track(emitter.on('activeChanged', fn)),
    },

    editor: {
      get activePath() { return ed.activePath(); },
      get monaco() { return monaco; },
      getText: (path = ed.activePath()) => ed.modelFor(path)?.getValue() ?? '',
      setText: (text, path = ed.activePath()) => ed.modelFor(path)?.setValue(text),
      insert: (text) => {
        const editor = ed.getEditor();
        if (!editor) return;
        editor.executeEdits('extension', [{ range: editor.getSelection(), text, forceMoveMarkers: true }]);
      },
      get selection() {
        const editor = ed.getEditor();
        const model = editor?.getModel();
        const sel = editor?.getSelection();
        return model && sel ? model.getValueInRange(sel) : '';
      },
      save: () => ed.save(),
    },

    languages: {
      /**
       * Register a language the same way Monaco's own definitions do: an id
       * with extensions, a Monarch grammar, and an optional language config.
       * After this, files matching the extensions resolve to it automatically.
       */
      register({ id, extensions = [], aliases = [], grammar, configuration }) {
        monaco.languages.register({ id, extensions, aliases });
        if (grammar) monaco.languages.setMonarchTokensProvider(id, grammar);
        if (configuration) monaco.languages.setLanguageConfiguration(id, configuration);
        invalidateLanguageMaps();
        return track({ dispose: () => invalidateLanguageMaps() });
      },
      registerCompletionProvider: (languageId, provider) =>
        track(monaco.languages.registerCompletionItemProvider(languageId, provider)),
      registerHoverProvider: (languageId, provider) =>
        track(monaco.languages.registerHoverProvider(languageId, provider)),

      /**
       * Claim Monaco's worker label for a language service. The factory runs
       * inside the extension's own lazy chunk, so a heavyweight worker is only
       * fetched once that extension activates.
       */
      registerWorker: (label, factory) => track(ed.registerWorkerFactory(label, factory)),
    },

    themes: {
      register: (name, theme) => track(registerTheme(name, theme)),
      apply: (name) => applyTheme(name),
    },

    /**
     * Per-extension key/value store, persisted to localStorage. Namespaced by
     * extension id so two extensions cannot collide on a key name.
     */
    storage: {
      get(key, fallback = null) {
        try {
          const raw = localStorage.getItem(`minicode.ext.${extId}.${key}`);
          return raw === null ? fallback : JSON.parse(raw);
        } catch { return fallback; }
      },
      set(key, value) {
        try { localStorage.setItem(`minicode.ext.${extId}.${key}`, JSON.stringify(value)); } catch { /* quota */ }
      },
    },

    /** Escape hatch for building panel content without importing internals. */
    el,
  };
}
