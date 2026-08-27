/**
 * The Skeuomorphic Clean theme, for Monaco's interior.
 *
 * Syntax colours are the source's own Spectrum Chroma strip -- the same ramp
 * the chrome uses for status marks -- rather than a ported VS Code palette.
 * That is what makes the code area read as part of this system instead of an
 * editor dropped into it.
 */
import { monaco } from './langs.js';

export const CHROMA = {
  green: '5EBD3E',
  yellow: 'FFB900',
  orange: 'F78200',
  red: 'E23838',
  purple: '973999',
  blue: '009CDF',
};

const BG = '000000';
const SURFACE = '521111';
const TEXT = 'FFFFFF';
const DIM = 'A1A1AA';

export const SKEUO_THEME = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: TEXT, background: BG },
    { token: 'comment', foreground: '7A5C5C', fontStyle: 'italic' },
    { token: 'keyword', foreground: CHROMA.orange },
    { token: 'keyword.control', foreground: CHROMA.orange },
    { token: 'string', foreground: CHROMA.green },
    { token: 'string.escape', foreground: CHROMA.yellow },
    { token: 'number', foreground: CHROMA.purple },
    { token: 'constant', foreground: CHROMA.purple },
    { token: 'regexp', foreground: CHROMA.red },
    { token: 'type', foreground: CHROMA.yellow },
    { token: 'type.identifier', foreground: CHROMA.yellow },
    { token: 'identifier', foreground: TEXT },
    { token: 'variable', foreground: TEXT },
    { token: 'variable.predefined', foreground: CHROMA.blue },
    { token: 'function', foreground: CHROMA.blue },
    { token: 'operator', foreground: DIM },
    { token: 'delimiter', foreground: DIM },
    { token: 'tag', foreground: CHROMA.orange },
    { token: 'attribute.name', foreground: CHROMA.yellow },
    { token: 'attribute.value', foreground: CHROMA.green },
    { token: 'metatag', foreground: CHROMA.purple },
    { token: 'annotation', foreground: CHROMA.purple },
    { token: 'invalid', foreground: CHROMA.red },
  ],
  colors: {
    'editor.background': '#' + BG,
    'editor.foreground': '#' + TEXT,
    'editorLineNumber.foreground': '#4A3333',
    'editorLineNumber.activeForeground': '#' + CHROMA.yellow,
    'editorCursor.foreground': '#' + CHROMA.yellow,
    'editor.selectionBackground': '#FFB90040',
    'editor.inactiveSelectionBackground': '#FFB90020',
    'editor.lineHighlightBackground': '#12080899',
    'editor.lineHighlightBorder': '#00000000',
    'editorIndentGuide.background1': '#2A1A1A',
    'editorIndentGuide.activeBackground1': '#5A3A3A',
    'editorWhitespace.foreground': '#3A2626',
    'editorBracketMatch.background': '#F7820033',
    'editorBracketMatch.border': '#' + CHROMA.orange,
    'editor.findMatchBackground': '#F7820066',
    'editor.findMatchHighlightBackground': '#F7820033',
    'editorGutter.background': '#' + BG,
    'editorWidget.background': '#' + SURFACE,
    'editorWidget.border': '#A3A3A366',
    'editorSuggestWidget.background': '#' + SURFACE,
    'editorSuggestWidget.border': '#A3A3A366',
    'editorSuggestWidget.selectedBackground': '#3D0D0D',
    'editorHoverWidget.background': '#' + SURFACE,
    'editorHoverWidget.border': '#A3A3A366',
    'input.background': '#' + BG,
    'input.border': '#A3A3A366',
    'focusBorder': '#' + CHROMA.yellow,
    'scrollbarSlider.background': '#52111199',
    'scrollbarSlider.hoverBackground': '#6B1A1ACC',
    'scrollbarSlider.activeBackground': '#' + CHROMA.orange,
    'minimap.background': '#' + BG,
    'editorOverviewRuler.border': '#00000000',
    'editorError.foreground': '#' + CHROMA.red,
    'editorWarning.foreground': '#' + CHROMA.orange,
    'editorInfo.foreground': '#' + CHROMA.blue,
  },
};

/**
 * Chrome tokens for the default theme. A theme extension supplies the same
 * shape and we write each entry onto :root, so one contribution restyles the
 * whole IDE -- panes, tabs and status bar -- not just the code area.
 */
export const SKEUO_TOKENS = {
  '--primary': '#FFB900',
  '--secondary': '#000000',
  '--accent': '#F78200',
  '--bg': '#000000',
  '--surface': '#521111',
  '--text': '#FFFFFF',
  '--text-dim': '#A1A1AA',
  '--border': '#A3A3A3',
};

const themes = new Map();
let active = 'Skeuomorphic Clean';

/**
 * Monaco only accepts /^[a-z0-9-]+$/i as a theme id, so a human label like
 * "Classic Dark" is slugified for Monaco while the label stays the key users
 * and the picker see.
 */
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function registerTheme(name, { monaco: monacoTheme, tokens } = {}) {
  const id = slug(name);
  themes.set(name, { id, monacoTheme, tokens });
  if (monacoTheme) monaco.editor.defineTheme(id, monacoTheme);
  return { dispose: () => themes.delete(name) };
}

export function applyTheme(name) {
  const t = themes.get(name);
  if (!t) return false;
  if (t.monacoTheme) monaco.editor.setTheme(t.id);
  // Clear the previous theme's overrides before applying the new ones, so
  // switching back to default restores tokens.css rather than leaving residue.
  const root = document.documentElement;
  for (const key of Object.keys(SKEUO_TOKENS)) root.style.removeProperty(key);
  for (const [key, value] of Object.entries(t.tokens || {})) root.style.setProperty(key, value);
  active = name;
  return true;
}

export const activeTheme = () => active;
export const themeNames = () => [...themes.keys()];

export function initThemes() {
  registerTheme('Skeuomorphic Clean', { monaco: SKEUO_THEME, tokens: SKEUO_TOKENS });
  monaco.editor.setTheme('skeuomorphic-clean');
}
