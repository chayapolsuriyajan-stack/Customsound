/**
 * Ctrl+P. Walks the workspace once, caches the file list, and fuzzy-matches
 * against it. The cache is invalidated by any filesystem mutation the explorer
 * broadcasts, so it never goes stale without a manual refresh.
 */
import { fsapi, p } from './fsapi.js';
import { quickPick } from './ui.js';
import { emitter } from './events.js';

let cache = null;
let building = null;

emitter.on('pathRenamed', () => { cache = null; });
emitter.on('pathRemoved', () => { cache = null; });
emitter.on('workspaceChanged', () => { cache = null; });

const MAX_FILES = 20000;

async function walk(dir, out) {
  if (out.length >= MAX_FILES) return;
  let entries;
  try { entries = await fsapi.readDir(dir); } catch { return; }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (entry.isDir) await walk(entry.path, out);
    else out.push(entry.path);
  }
}

export async function fileList() {
  if (cache) return cache;
  if (!building) {
    building = (async () => {
      const out = [];
      await walk('', out);
      cache = out;
      building = null;
      return out;
    })();
  }
  return building;
}

export async function quickOpen() {
  const files = await fileList();
  const items = files.map((path) => ({
    label: p.base(path),
    description: p.dir(path) || '',
    value: path,
  }));
  const chosen = await quickPick({ placeholder: 'Go to file...', items });
  if (chosen) emitter.emit('openFile', chosen);
}

export const invalidateFileList = () => { cache = null; };
