/**
 * A theme contribution has two halves: `monaco` restyles the code area, and
 * `tokens` overrides the CSS custom properties the chrome is built from. Both
 * come from one registration, so switching themes never leaves a maroon status
 * bar under a blue editor.
 */
export function activate(ide) {
  ide.themes.register('Classic Dark', {
    monaco: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'C586C0' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'type', foreground: '4EC9B0' },
        { token: 'function', foreground: 'DCDCAA' },
      ],
      colors: {
        'editor.background': '#1E1E1E',
        'editor.foreground': '#D4D4D4',
        'editorLineNumber.foreground': '#555555',
        'editorCursor.foreground': '#AEAFAD',
        'editor.lineHighlightBackground': '#2A2A2A',
        'editor.selectionBackground': '#264F78',
      },
    },
    tokens: {
      '--bg': '#1E1E1E',
      '--surface': '#252526',
      '--primary': '#0098FF',
      '--accent': '#0098FF',
      '--text': '#D4D4D4',
      '--text-dim': '#858585',
      '--border': '#3C3C3C',
    },
  });
}
