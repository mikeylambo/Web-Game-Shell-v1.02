import assert from 'node:assert/strict';
import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const budgets = {
  javascriptBytes: 3_500_000,
  cssBytes: 500_000,
  totalBytes: 4_250_000,
};

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const files = await walk(dist);
const rel = (file) => path.relative(dist, file).replaceAll('\\', '/');
assert.ok(files.some((file) => rel(file) === 'index.html'), 'production dist must include index.html');
assert.ok(files.some((file) => file.endsWith('.js')), 'production dist must include JavaScript');
assert.equal(files.some((file) => file.endsWith('.map')), false, 'release dist must not expose source maps by default');

let javascriptBytes = 0;
let cssBytes = 0;
let totalBytes = 0;
for (const file of files) {
  const size = (await stat(file)).size;
  totalBytes += size;
  if (file.endsWith('.js')) javascriptBytes += size;
  if (file.endsWith('.css')) cssBytes += size;
}

assert.ok(javascriptBytes <= budgets.javascriptBytes,
  `JavaScript bundle ${javascriptBytes} exceeds ${budgets.javascriptBytes} byte budget`);
assert.ok(cssBytes <= budgets.cssBytes,
  `CSS bundle ${cssBytes} exceeds ${budgets.cssBytes} byte budget`);
assert.ok(totalBytes <= budgets.totalBytes,
  `total dist ${totalBytes} exceeds ${budgets.totalBytes} byte budget`);

const html = await readFile(path.join(dist, 'index.html'), 'utf8');
assert.ok(/INKSTONE/i.test(html), 'release HTML must identify Inkstone');

console.log('INKSTONE V0.5 BUILD CERTIFICATION PASS');
console.log(JSON.stringify({ files: files.length, javascriptBytes, cssBytes, totalBytes, budgets }, null, 2));
