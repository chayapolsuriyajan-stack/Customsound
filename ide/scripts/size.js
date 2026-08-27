/**
 * Size report.
 *
 * Size is the project's headline constraint, so this distinguishes the two
 * numbers that actually matter and are easy to conflate:
 *
 *   base     what a cold start downloads and parses before you can type
 *   lazy     what sits on disk waiting to be fetched only if you need it
 *
 * A build can be large on disk and still start fast, which is exactly the
 * trade MiniCode makes with its ~84 language grammars.
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

if (!existsSync(DIST)) {
  console.error('No dist/. Run `npm run build` first.');
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const size = (n) => (n >= 1024 * 1024 ? mb(n) : kb(n));

/** Everything the entry HTML pulls in synchronously counts as base. */
const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
const entryNames = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1]);

const files = [];
const walk = (dir, prefix = '') => {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, rel);
    else files.push({ rel, bytes: st.size, abs });
  }
};
walk(DIST);

// The entry chunk statically imports the editor core and its CSS; grammars and
// extension mains are reached only through dynamic import.
const BASE_PATTERNS = [
  /^assets\/index-.*\.(js|css)$/,
  /^assets\/editor\.api-.*\.js$/,
  /^assets\/editor-.*\.css$/,
  /^assets\/editor\.worker-.*\.js$/,
  /\.woff2$/,
  /\.ttf$/,
  /^index\.html$/,
];
const isBase = (rel) => BASE_PATTERNS.some((re) => re.test(rel)) || entryNames.includes(rel);

const base = files.filter((f) => isBase(f.rel));
const lazy = files.filter((f) => !isBase(f.rel));

const sum = (list) => list.reduce((a, f) => a + f.bytes, 0);
const gz = (list) => list.reduce((a, f) => a + gzipSync(readFileSync(f.abs)).length, 0);

console.log('\n  MiniCode size report\n  ' + '-'.repeat(52));
console.log(`  base (loaded at startup)   ${size(sum(base)).padStart(10)}   ${size(gz(base)).padStart(10)} gzipped`);
console.log(`  lazy (fetched on demand)   ${size(sum(lazy)).padStart(10)}   ${lazy.length} files`);
console.log(`  total on disk              ${size(sum(files)).padStart(10)}`);

console.log('\n  base breakdown');
for (const f of base.sort((a, b) => b.bytes - a.bytes)) {
  console.log(`    ${f.rel.replace('assets/', '').padEnd(40)} ${size(f.bytes).padStart(10)}`);
}

const grammars = lazy.filter((f) => /^assets\/[a-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js$/.test(f.rel));
console.log(`\n  ${grammars.length} language grammars, largest first`);
for (const f of grammars.sort((a, b) => b.bytes - a.bytes).slice(0, 5)) {
  console.log(`    ${f.rel.replace('assets/', '').padEnd(40) } ${size(f.bytes).padStart(10)}`);
}
const avg = grammars.length ? sum(grammars) / grammars.length : 0;
console.log(`    ${'(average)'.padEnd(40)} ${size(avg).padStart(10)}`);

const ts = files.find((f) => /ts\.worker/.test(f.rel));
console.log('\n  TypeScript IntelliSense    ' +
  (ts ? `${size(ts.bytes)} — included (built with MINICODE_OPTIONAL=1)` : 'not built in (default)'));
console.log();
