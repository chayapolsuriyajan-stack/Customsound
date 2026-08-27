/**
 * Language resolution and the lazy-loading strategy.
 *
 * The base bundle imports `editor.api` (the editor with *no* languages) plus
 * the basic-languages contribution -- 20 KB of pure registration data covering
 * ~84 languages. Each registration carries its file extensions and a
 * `loader: () => import('./rust.js')`, so Monaco fetches a grammar only when a
 * model of that language is first created. Opening one .rs file pulls one
 * ~12 KB chunk; the other 83 grammars are never requested.
 *
 * Extensions add to this same registry through ide.languages.register(), so a
 * language shipped as an extension is indistinguishable from a built-in one.
 */
import * as monaco from 'monaco-editor/editor/editor.api.js';
// NOT `languages/register.all.js` -- in 0.56 that entry also pulls in the
// css/html/json/typescript *language services* and their workers, about 8 MB.
// This entry registers the grammars and nothing else.
import 'monaco-editor/basic-languages/monaco.contribution.js';

export { monaco };

/** extension (no dot) -> language id, built from Monaco's own registry. */
let extMap = null;
/** exact filename -> language id, e.g. "Dockerfile", "Makefile". */
let nameMap = null;

function buildMaps() {
  extMap = new Map();
  nameMap = new Map();
  for (const lang of monaco.languages.getLanguages()) {
    for (const e of lang.extensions || []) {
      extMap.set(e.replace(/^\./, '').toLowerCase(), lang.id);
    }
    for (const f of lang.filenames || []) nameMap.set(f.toLowerCase(), lang.id);
    for (const f of lang.filenamePatterns || []) nameMap.set(f.toLowerCase(), lang.id);
  }
}

/** Invalidated when an extension registers a new language. */
export function invalidateLanguageMaps() { extMap = null; }

/**
 * Resolve a workspace path to a Monaco language id.
 * Falls back to 'plaintext' -- an unknown extension still opens and edits.
 */
export function languageFor(path) {
  if (!extMap) buildMaps();
  const base = path.split('/').pop().toLowerCase();
  if (nameMap.has(base)) return nameMap.get(base);

  // Longest-suffix wins so ".d.ts" beats ".ts" when both are registered.
  let best = null;
  for (const [ext, id] of extMap) {
    if (base.endsWith('.' + ext) && (!best || ext.length > best.ext.length)) best = { ext, id };
  }
  return best ? best.id : 'plaintext';
}

/** Human label for the status bar. */
export function languageLabel(id) {
  const lang = monaco.languages.getLanguages().find((l) => l.id === id);
  return lang?.aliases?.[0] || id;
}

/** Every registered language id, for the "Select Language Mode" quick pick. */
export function allLanguages() {
  return monaco.languages.getLanguages()
    .map((l) => ({ id: l.id, label: l.aliases?.[0] || l.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Files we refuse to open in the editor. Monaco will happily try to tokenise a
 * 40 MB binary and lock the UI thread; the explorer shows a notice instead.
 */
const BINARY = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'tiff',
  'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac',
  'mp4', 'mov', 'avi', 'mkv', 'webm',
  'zip', 'gz', 'tar', 'bz2', 'xz', '7z', 'rar',
  'pdf', 'woff', 'woff2', 'ttf', 'otf', 'eot',
  'exe', 'dll', 'so', 'dylib', 'bin', 'wasm', 'class', 'o', 'a',
]);

export const isBinary = (path) => BINARY.has((path.split('.').pop() || '').toLowerCase());

/** Max bytes we will load into a model. Beyond this the editor degrades badly. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
