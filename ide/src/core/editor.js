/**
 * Monaco wiring plus the model cache.
 *
 * One editor instance is reused across tabs; switching tabs swaps the model,
 * which is what preserves undo history, cursor position and scroll per file --
 * the same approach VS Code takes and much cheaper than an editor per tab.
 */
import { monaco, languageFor, isBinary, MAX_FILE_BYTES } from './langs.js';
import { initThemes } from './theme.js';
import { fsapi } from './fsapi.js';
import { emitter } from './events.js';
// Vite's ?worker suffix turns the module into a Worker constructor and bundles
// it as a separate file. This is the only worker in the base build.
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

/**
 * Monaco asks for a worker by label to run tokenisation, diffing and language
 * services off the main thread. Only the generic editor worker ships in the
 * base bundle -- no TypeScript/JSON/CSS/HTML language workers, which is where
 * the multi-megabyte savings come from.
 *
 * An extension can claim a label (see lang-typescript-ide), and because its
 * factory is defined inside the extension's own lazy chunk, the worker it
 * builds is only ever downloaded once that extension activates.
 */
const workerFactories = new Map();

export function registerWorkerFactory(label, factory) {
  workerFactories.set(label, factory);
  return { dispose: () => workerFactories.delete(label) };
}

self.MonacoEnvironment = {
  getWorker: (_moduleId, label) => {
    const factory = workerFactories.get(label);
    if (factory) return factory();
    return new EditorWorker();
  },
};

/** path -> { model, view: ICodeEditorViewState|null, saved: string } */
const cache = new Map();

let editor = null;
let currentPath = null;

export function createEditor(container) {
  initThemes();
  editor = monaco.editor.create(container, {
    theme: 'skeuomorphic-clean',
    automaticLayout: true,
    fontFamily: "'DM Mono', ui-monospace, Menlo, Consolas, monospace",
    fontSize: 13,
    lineHeight: 20,
    fontLigatures: false,
    minimap: { enabled: true, renderCharacters: false, maxColumn: 90 },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    renderLineHighlight: 'all',
    roundedSelection: false,
    padding: { top: 12, bottom: 12 },
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: false, indentation: true },
    tabSize: 2,
    detectIndentation: true,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
    overviewRulerBorder: false,
    fixedOverflowWidgets: true,
  });

  editor.onDidChangeCursorPosition((e) => emitter.emit('cursor', e.position));
  editor.onDidChangeModelContent(() => {
    if (!currentPath) return;
    emitter.emit('dirty', { path: currentPath, dirty: isDirty(currentPath) });
  });

  return editor;
}

export const getEditor = () => editor;
export const activePath = () => currentPath;

/** True when the model's text differs from what is on disk. */
export function isDirty(path) {
  const entry = cache.get(path);
  return !!entry && entry.model.getValue() !== entry.saved;
}

export function anyDirty() {
  return [...cache.keys()].filter(isDirty);
}

/**
 * Load a file into a model, reusing the cached one if present so an edited but
 * unsaved file keeps its content when you tab away and back.
 */
export async function openModel(path) {
  if (cache.has(path)) return cache.get(path);

  if (isBinary(path)) throw new Error(`${path.split('/').pop()} is a binary file`);
  const info = await fsapi.stat(path).catch(() => null);
  if (info && info.size > MAX_FILE_BYTES) {
    throw new Error(`${path.split('/').pop()} is too large to open (${(info.size / 1e6).toFixed(1)} MB)`);
  }

  const text = await fsapi.readFile(path);
  const model = monaco.editor.createModel(text, languageFor(path), monaco.Uri.file('/' + path));
  const entry = { model, view: null, saved: text };
  cache.set(path, entry);
  emitter.emit('documentOpened', { path, model });
  return entry;
}

/** Swap the visible model, remembering the outgoing file's scroll/cursor. */
export function showModel(path) {
  const entry = cache.get(path);
  if (!entry || !editor) return;

  if (currentPath && cache.has(currentPath)) {
    cache.get(currentPath).view = editor.saveViewState();
  }
  editor.setModel(entry.model);
  if (entry.view) editor.restoreViewState(entry.view);
  editor.focus();
  currentPath = path;
  emitter.emit('activeChanged', { path, model: entry.model });
}

export async function save(path = currentPath) {
  const entry = path && cache.get(path);
  if (!entry) return false;
  const text = entry.model.getValue();
  await fsapi.writeFile(path, text);
  entry.saved = text;
  emitter.emit('dirty', { path, dirty: false });
  emitter.emit('documentSaved', { path, text });
  return true;
}

/** Drop a model entirely. Called when a tab closes or its file is deleted. */
export function disposeModel(path) {
  const entry = cache.get(path);
  if (!entry) return;
  entry.model.dispose();
  cache.delete(path);
  if (currentPath === path) currentPath = null;
}

/** Follow a rename without losing the model's content or undo stack. */
export function renameModel(from, to) {
  const entry = cache.get(from);
  if (!entry) return;
  // A model's URI is immutable, so recreate it and carry the text across.
  const text = entry.model.getValue();
  const fresh = monaco.editor.createModel(text, languageFor(to), monaco.Uri.file('/' + to));
  entry.model.dispose();
  cache.delete(from);
  cache.set(to, { model: fresh, view: entry.view, saved: entry.saved });
  if (currentPath === from) {
    currentPath = to;
    editor.setModel(fresh);
  }
}

export function setLanguage(path, languageId) {
  const entry = cache.get(path);
  if (entry) monaco.editor.setModelLanguage(entry.model, languageId);
}

export const openPaths = () => [...cache.keys()];
export const modelFor = (path) => cache.get(path)?.model || null;
