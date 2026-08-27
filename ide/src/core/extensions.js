/**
 * The extension host.
 *
 * Two sources, one lifecycle:
 *   - bundled  -- ide/extensions/<id>/, discovered at build time by vite's glob
 *   - user     -- ~/.minicode/extensions/<id>/, read off disk at runtime and
 *                 evaluated from a blob URL, so dropping in a folder installs
 *                 an extension with no rebuild
 *
 * Contributions (commands, keybindings, languages, themes) are registered
 * eagerly because they are only declarations and cost almost nothing. The
 * extension's own code is imported lazily, the first time one of its
 * activationEvents fires -- so a dozen installed extensions do not mean a
 * dozen modules parsed at startup.
 */
import { registerCommand, executeCommand, isStub } from './commands.js';
import { bindKey } from './keymap.js';
import { emitter } from './events.js';
import { makeApi } from './api.js';
import { fsapi } from './fsapi.js';
import { toast } from './ui.js';

// Vite resolves these globs at build time; each main is its own lazy chunk.
const bundledManifests = import.meta.glob('../../extensions/*/extension.json', { eager: true, import: 'default' });
const bundledMains = import.meta.glob('../../extensions/*/*.js');

/**
 * Optional extensions are compiled in only when MINICODE_OPTIONAL=1 is set at
 * build time (`npm run build:full`). Right now that means the TypeScript
 * language service: ~8 MB of worker, nearly three times the entire rest of the
 * app. Bundling it by default would make every install pay for a feature most
 * sessions never touch, so the default build leaves it out entirely.
 *
 * __WITH_OPTIONAL__ is replaced with a literal at build time, so when it is
 * false the bundler drops the glob and everything it reaches.
 */
const optionalManifests = __WITH_OPTIONAL__
  ? import.meta.glob('../../extensions-optional/*/extension.json', { eager: true, import: 'default' })
  : {};
const optionalMains = __WITH_OPTIONAL__
  ? import.meta.glob('../../extensions-optional/*/*.js')
  : {};

/** id -> { manifest, dir, load, state, api, subscriptions, module } */
const registry = new Map();

// Outside the workspace on purpose: extensions belong to the user, not to
// whichever folder happens to be open. Both backends resolve a leading ~/.
const USER_DIR = '~/.minicode/extensions';

export function listExtensions() {
  return [...registry.values()].map((e) => ({
    id: e.manifest.id,
    name: e.manifest.name,
    version: e.manifest.version,
    description: e.manifest.description || '',
    source: e.source,
    active: e.state === 'active',
  }));
}

/* --- discovery ----------------------------------------------------------- */

function discoverBundled() {
  const manifests = { ...bundledManifests, ...optionalManifests };
  const mains = { ...bundledMains, ...optionalMains };

  for (const [path, manifest] of Object.entries(manifests)) {
    const dir = path.replace(/\/extension\.json$/, '');
    const mainPath = `${dir}/${manifest.main || 'index.js'}`;
    const load = mains[mainPath];
    if (!load) {
      console.warn(`[minicode] ${manifest.id}: main "${manifest.main}" not found at ${mainPath}`);
      continue;
    }
    register(manifest, load, 'bundled');
  }
}

/**
 * User extensions live outside the bundle, so their source is read as text and
 * turned into a module via a blob URL. Relative imports inside such a module
 * cannot resolve, which is the documented constraint: a user extension is a
 * single self-contained file.
 */
async function discoverUser() {
  // Having no user extension directory is the normal case, so probe for it
  // rather than letting a failed listing surface as an error.
  if (!(await fsapi.exists(USER_DIR).catch(() => false))) return;

  let dirs;
  try {
    dirs = await fsapi.readDir(USER_DIR);
  } catch (err) {
    console.warn('[minicode] could not read user extensions:', err.message);
    return;
  }

  for (const entry of dirs.filter((d) => d.isDir)) {
    try {
      const manifest = JSON.parse(await fsapi.readFile(`${entry.path}/extension.json`));
      const mainFile = `${entry.path}/${manifest.main || 'index.js'}`;
      const load = async () => {
        const source = await fsapi.readFile(mainFile);
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          return await import(/* @vite-ignore */ url);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      register(manifest, load, 'user');
    } catch (err) {
      console.warn(`[minicode] skipping user extension ${entry.name}:`, err.message);
    }
  }
}

function register(manifest, load, source) {
  if (!manifest?.id) return;
  if (registry.has(manifest.id)) {
    console.warn(`[minicode] duplicate extension id "${manifest.id}" ignored`);
    return;
  }
  registry.set(manifest.id, { manifest, load, source, state: 'registered', subscriptions: [] });
}

/* --- contributions ------------------------------------------------------- */

/**
 * Declarations are wired before any extension code runs. A contributed command
 * gets a stub that activates its extension and then re-dispatches, which is how
 * "onCommand:" activation works without the palette knowing anything about it.
 */
function applyContributions(entry) {
  const { contributes = {} } = entry.manifest;

  for (const cmd of contributes.commands || []) {
    registerCommand(cmd.command, async (...args) => {
      await activate(entry.manifest.id);
      // Activation should have replaced this stub with the real handler. If it
      // did not, the manifest promises a command the code never registers --
      // say so rather than re-entering the stub forever.
      if (isStub(cmd.command)) {
        throw new Error(`${entry.manifest.id} declares "${cmd.command}" but never registered it`);
      }
      return executeCommand(cmd.command, ...args);
    }, { title: cmd.title, category: cmd.category || entry.manifest.name, stub: true });
  }

  for (const kb of contributes.keybindings || []) {
    bindKey(kb.key, kb.command);
  }
}

/* --- activation ---------------------------------------------------------- */

export async function activate(id) {
  const entry = registry.get(id);
  if (!entry) throw new Error(`unknown extension: ${id}`);
  if (entry.state === 'active') return entry.module;
  if (entry.activating) return entry.activating;

  entry.activating = (async () => {
    try {
      const module = await entry.load();
      const api = makeApi(id, entry.subscriptions);
      const context = { subscriptions: entry.subscriptions, extensionId: id, manifest: entry.manifest };
      await module.activate?.(api, context);
      entry.module = module;
      entry.api = api;
      entry.state = 'active';
      emitter.emit('extensionActivated', id);
      return module;
    } catch (err) {
      entry.state = 'failed';
      console.error(`[minicode] activating ${id} failed:`, err);
      toast(`Extension "${entry.manifest.name}" failed to load.`, 'error');
      throw err;
    } finally {
      entry.activating = null;
    }
  })();

  return entry.activating;
}

export async function deactivate(id) {
  const entry = registry.get(id);
  if (!entry || entry.state !== 'active') return;
  try {
    await entry.module?.deactivate?.();
  } catch (err) {
    console.error(`[minicode] deactivating ${id} threw:`, err);
  }
  // Dispose in reverse so later registrations unwind before earlier ones.
  for (const d of entry.subscriptions.reverse()) {
    try { d?.dispose?.(); } catch (err) { console.error(err); }
  }
  entry.subscriptions.length = 0;
  entry.state = 'registered';
  emitter.emit('extensionDeactivated', id);
}

/* --- activation events --------------------------------------------------- */

function eventsFor(entry) {
  return entry.manifest.activationEvents || [];
}

async function fire(event) {
  for (const entry of registry.values()) {
    if (entry.state !== 'registered') continue;
    if (eventsFor(entry).includes(event) || eventsFor(entry).includes('*')) {
      activate(entry.manifest.id).catch(() => { /* already reported */ });
    }
  }
}

export async function initExtensions() {
  discoverBundled();
  await discoverUser();

  for (const entry of registry.values()) applyContributions(entry);

  // onLanguage:<id> fires when a document of that language is first opened.
  emitter.on('documentOpened', ({ model }) => {
    fire(`onLanguage:${model.getLanguageId()}`);
  });
  emitter.on('activeChanged', ({ model }) => {
    if (model) fire(`onLanguage:${model.getLanguageId()}`);
  });

  await fire('onStartup');

  // workspaceContains:<file> -- a cheap existence check, not a glob walk.
  for (const entry of registry.values()) {
    for (const ev of eventsFor(entry)) {
      if (!ev.startsWith('workspaceContains:')) continue;
      const file = ev.slice('workspaceContains:'.length);
      if (await fsapi.exists(file).catch(() => false)) {
        activate(entry.manifest.id).catch(() => {});
      }
    }
  }

  return { list: listExtensions, activate, deactivate };
}

export const extensionCount = () => registry.size;
