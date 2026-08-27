/**
 * Fetches the three self-hosted webfaces into src/fonts/.
 *
 * We take Google's *latin* subset only (U+0000-00FF plus the few arrows and
 * symbols the chrome uses) and skip latin-ext entirely -- that halves the byte
 * count and the IDE chrome has no latin-ext copy. Run once; the woff2 files are
 * committed so a build never needs the network.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'fonts');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

// DM Mono ships 300/400/500 only -- there is no 600 cut. We reuse 500 for the
// label weight and let the browser synthesise the heavier stroke, which keeps
// the download at two mono files instead of three.
const WANTED = [
  ['dm-mono-500.woff2', 'https://fonts.googleapis.com/css2?family=DM+Mono:wght@500'],
  ['instrument-serif-400.woff2', 'https://fonts.googleapis.com/css2?family=Instrument+Serif'],
];

const latinUrl = (css) => {
  // The last @font-face in Google's response is the `latin` subset.
  const blocks = css.split('@font-face').filter((b) => b.includes('U+0000-00FF'));
  const m = blocks.at(-1)?.match(/url\((https:[^)]+\.woff2)\)/);
  if (!m) throw new Error('no latin woff2 in css');
  return m[1];
};

await mkdir(OUT, { recursive: true });
for (const [file, cssUrl] of WANTED) {
  const css = await (await fetch(cssUrl, { headers: { 'user-agent': UA } })).text();
  const url = latinUrl(css);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await writeFile(path.join(OUT, file), buf);
  console.log(`${file.padEnd(30)} ${(buf.length / 1024).toFixed(1)} KB`);
}
