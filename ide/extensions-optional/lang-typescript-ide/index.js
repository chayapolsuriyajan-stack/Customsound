/**
 * TypeScript IntelliSense, as an opt-in extension.
 *
 * This exists to keep the base app small. Monaco's TypeScript language service
 * plus its worker is ~5 MB -- more than the editor core, the chrome, the fonts
 * and every grammar put together. Making it an extension means the default
 * install pays nothing for it, and turning it on is one command.
 *
 * The dynamic import below is the whole trick: vite emits the TS service as its
 * own chunk, reachable only through this line, so it is downloaded the first
 * time someone actually asks for IntelliSense.
 */

const PREF_KEY = 'enabled';
let enabled = false;
let item;

async function enable(ide) {
  if (enabled) return true;

  // Pull the worker constructor and the language service together. Monaco's
  // getWorker hook must return a Worker synchronously, so the constructor has
  // to be in hand before the label is claimed.
  const [{ default: TsWorker }, service] = await Promise.all([
    import('monaco-editor/languages/features/typescript/ts.worker.js?worker'),
    import('monaco-editor/languages/features/typescript/register.js'),
  ]);

  ide.languages.registerWorker('typescript', () => new TsWorker());
  ide.languages.registerWorker('javascript', () => new TsWorker());

  const { typescriptDefaults, javascriptDefaults } = service;

  const compilerOptions = {
    target: 99,              // ESNext
    allowNonTsExtensions: true,
    moduleResolution: 2,     // Node
    module: 99,              // ESNext
    allowJs: true,
    checkJs: false,
    jsx: 1,                  // Preserve
    strict: false,
  };
  typescriptDefaults?.setCompilerOptions(compilerOptions);
  javascriptDefaults?.setCompilerOptions(compilerOptions);

  // Without the real files on disk in the worker, unresolved imports would
  // paint the editor red for every `import x from './y'`.
  const lax = { noSemanticValidation: true, noSyntaxValidation: false };
  typescriptDefaults?.setDiagnosticsOptions(lax);
  javascriptDefaults?.setDiagnosticsOptions(lax);

  enabled = true;
  return true;
}

export async function activate(ide, context) {
  item = ide.window.createStatusBarItem({ align: 'right', priority: 5 });
  item.command = 'typescript.enable';

  const refresh = () => {
    const lang = ide.editor.activePath?.match(/\.[mc]?[jt]sx?$/i);
    if (!lang) return item.hide();
    item.text = enabled ? 'TS ●' : 'TS ○';
    item.tooltip = enabled
      ? 'TypeScript IntelliSense is on'
      : 'TypeScript IntelliSense is off — click to enable (~5 MB download)';
    item.accent = enabled;
    item.show();
  };

  ide.workspace.onDidChangeActiveDocument(refresh);

  ide.commands.register('typescript.enable', async () => {
    if (enabled) return ide.window.showMessage('TypeScript IntelliSense is already on.');
    ide.window.showMessage('Loading the TypeScript language service...');
    try {
      await enable(ide);
      ide.storage.set(PREF_KEY, true);
      refresh();
      ide.window.showMessage('TypeScript IntelliSense enabled. Reopen a .ts file to see completions.');
    } catch (err) {
      ide.window.showMessage(`Could not load the TypeScript service: ${err.message}`, 'error');
    }
  }, { title: 'TypeScript: Enable IntelliSense', category: 'TypeScript' });

  ide.commands.register('typescript.status', () => {
    ide.window.showMessage(
      enabled
        ? 'TypeScript IntelliSense: on.'
        : 'TypeScript IntelliSense: off. The ~5 MB service has not been downloaded.',
    );
  }, { title: 'TypeScript: IntelliSense Status', category: 'TypeScript' });

  // Honour a previous session's opt-in without asking again.
  if (ide.storage.get(PREF_KEY, false)) {
    await enable(ide).catch(() => {});
  }
  refresh();

  context.subscriptions.push({ dispose: () => { enabled = false; } });
}

export function deactivate() {
  item?.dispose();
}
