import { defineConfig } from 'vite';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Dev-only filesystem backend.
 *
 * In the shipped app the frontend talks to Rust via Tauri's `invoke`. This
 * middleware implements the exact same verb set over HTTP so the entire UI can
 * be developed and tested in a plain browser. It lives in the vite config and
 * is never part of a production bundle.
 */
function devFsPlugin() {
  const ROOT = path.resolve(process.env.MINICODE_ROOT || path.join(process.cwd(), '..'));

  // Mirrors the guard in src-tauri/src/main.rs. A path is legal only inside the
  // workspace root, or inside ~/.minicode (where user extensions live, which is
  // by definition outside the workspace). Anything else -- notably a stray `..`
  // from the frontend -- is rejected before it touches the disk.
  const MINICODE_DIR = path.join(os.homedir(), '.minicode');
  const resolve = (p) => {
    const raw = p || '.';
    const abs = raw.startsWith('~/')
      ? path.join(os.homedir(), raw.slice(2))
      : path.resolve(ROOT, raw);
    const inside = (base) => abs === base || abs.startsWith(base + path.sep);
    if (!inside(ROOT) && !inside(MINICODE_DIR)) {
      throw new Error('path escapes workspace root');
    }
    return abs;
  };

  const SKIP = new Set(['.git', 'node_modules', 'dist', 'target', '.DS_Store']);

  async function readDir(dir) {
    const abs = resolve(dir);
    const relativeTo = abs.startsWith(MINICODE_DIR) ? MINICODE_DIR : ROOT;
    const ents = await fs.readdir(abs, { withFileTypes: true });
    const out = [];
    for (const e of ents) {
      if (SKIP.has(e.name)) continue;
      let size = 0;
      if (e.isFile()) {
        try { size = (await fs.stat(path.join(abs, e.name))).size; } catch { /* raced */ }
      }
      const child = path.join(abs, e.name);
      out.push({
        name: e.name,
        // Paths stay in the same space they were asked for, so a ~/ listing
        // hands back ~/ paths the frontend can pass straight back in.
        path: relativeTo === MINICODE_DIR
          ? '~/' + path.relative(os.homedir(), child)
          : path.relative(ROOT, child) || e.name,
        isDir: e.isDirectory(),
        size,
      });
    }
    // Directories first, then case-insensitive by name -- same order as Rust.
    out.sort((a, b) => (a.isDir === b.isDir
      ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      : a.isDir ? -1 : 1));
    return out;
  }

  async function searchFiles(query, max = 200) {
    const needle = query.toLowerCase();
    const hits = [];
    const walk = async (dir) => {
      if (hits.length >= max) return;
      let ents;
      try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (hits.length >= max) return;
        if (SKIP.has(e.name)) continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) { await walk(abs); continue; }
        let text;
        try {
          const buf = await fs.readFile(abs);
          if (buf.includes(0)) continue;            // binary
          if (buf.length > 2_000_000) continue;     // too large to be worth it
          text = buf.toString('utf8');
        } catch { continue; }
        const lines = text.split('\n');
        for (let i = 0; i < lines.length && hits.length < max; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            hits.push({
              path: path.relative(ROOT, abs),
              line: i + 1,
              text: lines[i].slice(0, 200),
            });
          }
        }
      }
    };
    await walk(ROOT);
    return hits;
  }

  const handlers = {
    root: async () => ROOT,
    readDir: async ({ path: p }) => readDir(p),
    readFile: async ({ path: p }) => fs.readFile(resolve(p), 'utf8'),
    writeFile: async ({ path: p, content }) => { await fs.writeFile(resolve(p), content, 'utf8'); return true; },
    mkdir: async ({ path: p }) => { await fs.mkdir(resolve(p), { recursive: true }); return true; },
    createFile: async ({ path: p }) => { await fs.writeFile(resolve(p), '', { flag: 'wx' }); return true; },
    rename: async ({ from, to }) => { await fs.rename(resolve(from), resolve(to)); return true; },
    remove: async ({ path: p }) => { await fs.rm(resolve(p), { recursive: true, force: true }); return true; },
    copy: async ({ from, to }) => { await fs.cp(resolve(from), resolve(to), { recursive: true }); return true; },
    stat: async ({ path: p }) => {
      const s = await fs.stat(resolve(p));
      return { size: s.size, isDir: s.isDirectory(), modified: s.mtimeMs };
    },
    exists: async ({ path: p }) => {
      try { await fs.access(resolve(p)); return true; } catch { return false; }
    },
    search: async ({ query, max }) => searchFiles(query, max),
  };

  const middleware = async (req, res) => {
    const op = req.url.replace(/^\//, '').split('?')[0];
    const json = (code, body) => {
      res.statusCode = code;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };
    if (!handlers[op]) return json(404, { error: `unknown op ${op}` });
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const args = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      json(200, { ok: await handlers[op](args) });
    } catch (err) {
      json(400, { error: String(err.message || err) });
    }
  };

  return {
    name: 'minicode-dev-fs',
    configureServer: (server) => { server.middlewares.use('/__fs', middleware); },
    // `vite preview` serves the real build, which is the only place lazy
    // chunk loading can be measured honestly -- so it needs the backend too.
    configurePreviewServer: (server) => { server.middlewares.use('/__fs', middleware); },
  };
}

// Optional extensions are heavy enough to change the app's size class, so they
// are opt-in at build time rather than shipped and merely lazy-loaded.
const withOptional = process.env.MINICODE_OPTIONAL === '1';

export default defineConfig({
  plugins: [devFsPlugin()],
  base: './',
  define: {
    __WITH_OPTIONAL__: JSON.stringify(withOptional),
  },
  build: {
    target: 'es2022',
    // Each Monaco grammar is reached only through a dynamic `loader: () =>
    // import(...)` in its registration, so the bundler splits them into one
    // chunk per language on its own -- no manual chunking needed. Opening a
    // .rs file fetches the Rust grammar and nothing else.
    chunkSizeWarningLimit: 4000,
  },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: false },
  clearScreen: false,
});
