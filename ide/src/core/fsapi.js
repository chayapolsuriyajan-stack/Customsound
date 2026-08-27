/**
 * The one filesystem interface the rest of the app talks to.
 *
 * Two backends implement it identically:
 *   - Tauri   -> `invoke()` into the Rust commands in src-tauri/src/main.rs
 *   - Dev     -> POST /__fs/<op>, served by the middleware in vite.config.js
 *
 * Nothing outside this module knows which one is live. Paths are always
 * workspace-relative strings using forward slashes.
 */

const isTauri = typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);

let invoke = null;
if (isTauri) {
  ({ invoke } = await import('@tauri-apps/api/core'));
}

async function callDev(op, args = {}) {
  const res = await fetch(`/__fs/${op}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error || `fs ${op} failed`);
  return body.ok;
}

// Rust commands use snake_case; the dev server uses the camelCase op name.
const RUST_NAME = {
  readDir: 'read_dir', readFile: 'read_file', writeFile: 'write_file',
  createFile: 'create_file', mkdir: 'make_dir', rename: 'rename_path',
  remove: 'remove_path', copy: 'copy_path', stat: 'stat_path',
  exists: 'path_exists', search: 'search_files', root: 'workspace_root',
  setWorkspace: 'set_workspace',
};

const call = (op, args) => (isTauri ? invoke(RUST_NAME[op], args) : callDev(op, args));

export const fsapi = {
  isTauri,

  /** Absolute path of the currently opened workspace folder. */
  root: () => call('root', {}),

  /** @returns {Promise<Array<{name,path,isDir,size}>>} dirs first, then name-sorted. */
  readDir: (path) => call('readDir', { path }),

  readFile: (path) => call('readFile', { path }),
  writeFile: (path, content) => call('writeFile', { path, content }),

  /** Fails if the file already exists -- callers rely on that to avoid clobbering. */
  createFile: (path) => call('createFile', { path }),
  mkdir: (path) => call('mkdir', { path }),

  rename: (from, to) => call('rename', { from, to }),
  remove: (path) => call('remove', { path }),
  copy: (from, to) => call('copy', { from, to }),

  stat: (path) => call('stat', { path }),
  exists: (path) => call('exists', { path }),

  /** Recursive text search. Skips binaries, .git, node_modules. */
  search: (query, max = 200) => call('search', { query, max }),

  /**
   * Native folder picker, followed by pointing the backend at the result --
   * every later path is resolved relative to it, so the two must happen
   * together. Only meaningful under Tauri; in the browser the dev server pins
   * the workspace to MINICODE_ROOT, so there is nothing to choose.
   */
  async pickFolder() {
    if (!isTauri) return null;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const dir = await open({ directory: true, multiple: false });
    if (!dir) return null;
    return call('setWorkspace', { path: dir });
  },
};

/** Utilities shared by explorer/tabs -- path handling is pure string work. */
export const p = {
  base: (path) => path.split('/').filter(Boolean).pop() || path,
  dir: (path) => path.split('/').slice(0, -1).join('/'),
  ext: (path) => {
    const b = p.base(path);
    const i = b.lastIndexOf('.');
    return i > 0 ? b.slice(i + 1).toLowerCase() : '';
  },
  join: (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/'),
};
