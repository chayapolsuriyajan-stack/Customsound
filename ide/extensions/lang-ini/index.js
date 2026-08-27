/**
 * A complete language in ~40 lines: a Monarch grammar plus a language config.
 * This is the same shape Monaco's own built-in definitions use, which is why a
 * contributed language resolves through the normal extension->language map and
 * appears in the "Change Language Mode" picker alongside the built-ins.
 */
export function activate(ide) {
  ide.languages.register({
    id: 'ini-plus',
    extensions: ['.ini', '.cfg', '.conf', '.properties'],
    aliases: ['INI', 'ini'],

    grammar: {
      tokenizer: {
        root: [
          [/^\s*[#;].*$/, 'comment'],
          [/^\s*\[[^\]]*\]/, 'type.identifier'],          // [section]
          [/^\s*[\w.\-$]+(?=\s*[=:])/, 'attribute.name'], // key
          [/[=:]/, 'operator'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/'([^'\\]|\\.)*'/, 'string'],
          [/\b(true|false|yes|no|on|off|null)\b/i, 'constant'],
          [/\b\d+(\.\d+)?\b/, 'number'],
          [/\$\{[^}]*\}/, 'variable.predefined'],         // ${interpolation}
        ],
      },
    },

    configuration: {
      comments: { lineComment: '#' },
      brackets: [['[', ']']],
      autoClosingPairs: [
        { open: '[', close: ']' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
    },
  });
}
