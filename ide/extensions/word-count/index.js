/**
 * Word Count -- the reference extension.
 *
 * Exercises four contribution points at once: a status bar item that tracks the
 * active document, a command registered against the manifest's declaration, a
 * keybinding, and a panel built from plain DOM.
 */

let item;

const count = (text) => ({
  words: (text.match(/\S+/g) || []).length,
  chars: text.length,
  lines: text ? text.split('\n').length : 0,
  sentences: (text.match(/[.!?]+(\s|$)/g) || []).length,
});

export function activate(ide, context) {
  item = ide.window.createStatusBarItem({ align: 'left', priority: 50 });
  item.command = 'wordCount.showDetails';
  item.tooltip = 'Word count — click for details';

  const update = () => {
    const path = ide.editor.activePath;
    if (!path) return item.hide();
    const { words, chars } = count(ide.editor.getText());
    item.text = `${words} words, ${chars} chars`;
    item.show();
  };

  ide.workspace.onDidChangeActiveDocument(update);
  ide.workspace.onDidSaveDocument(update);

  // Poll while typing: the API deliberately does not expose a per-keystroke
  // content event, and one cheap read a second is enough for a counter.
  const timer = setInterval(update, 1000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  ide.commands.register('wordCount.showDetails', () => {
    const path = ide.editor.activePath;
    if (!path) return ide.window.showMessage('No file open.', 'warn');

    const stats = count(ide.editor.getText());
    const panel = ide.window.createPanel('Word Count');
    const rows = [
      ['Words', stats.words],
      ['Characters', stats.chars],
      ['Lines', stats.lines],
      ['Sentences', stats.sentences],
      ['Avg. words / sentence', stats.sentences ? (stats.words / stats.sentences).toFixed(1) : '—'],
    ];
    panel.content.replaceChildren(
      ide.el('p', { className: 'prose', textContent: path }),
      ...rows.map(([label, value]) =>
        ide.el('div', { className: 'hit' },
          ide.el('span', { className: 'where', textContent: label }),
          ide.el('span', { className: 'text', textContent: String(value) }))),
    );
  }, { title: 'Word Count: Show Details', category: 'Word Count' });

  update();
}

export function deactivate() {
  item?.dispose();
}
