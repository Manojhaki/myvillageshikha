import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Follow the actual entry pages, stylesheets, module imports and local assets.
// Testing both URL bases catches links that work locally but break on Pages.
const root = path.resolve(fileURLToPath(new URL('../docs/', import.meta.url)));
const entries = ['index.html', 'about/index.html'];
const origins = ['/', '/myvillageshikha/'];
const scripts = new Set();
const assets = new Set();
const assetRoot = path.join(root, 'assets');
let references = 0;

function extract(text, extension) {
  const found = [];
  if (extension === '.html' || extension === '.svg') {
    for (const match of text.matchAll(/\b(?:src|href|poster)\s*=\s*(['"])(.*?)\1/gi)) found.push(match[2]);
    for (const match of text.matchAll(/\bsrcset\s*=\s*(['"])(.*?)\1/gi)) {
      for (const candidate of match[2].split(',')) found.push(candidate.trim().split(/\s+/)[0]);
    }
  }
  if (extension === '.html' || extension === '.css' || extension === '.svg') {
    for (const match of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
      found.push(match[1] ?? match[2] ?? match[3].trim());
    }
    if (extension === '.css') {
      for (const match of text.matchAll(/@import\s+(['"])(.*?)\1/gi)) found.push(match[2]);
    }
  }
  if (extension === '.js' || extension === '.mjs') {
    for (const match of text.matchAll(/\b(?:import|export)\s+(?:[\s\S]*?\sfrom\s*)?(['"])([^'"]+)\1/g)) found.push(match[2]);
    for (const match of text.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) found.push(match[2]);
  }
  return found;
}

for (const base of origins) {
  const queue = entries.map(entry => new URL(base + entry, 'https://pages.example'));
  const visited = new Set();
  while (queue.length) {
    const url = queue.shift();
    if (!url.pathname.startsWith(base)) throw new Error(`Reference escapes site base ${base}: ${url.pathname}`);
    const relative = decodeURIComponent(url.pathname.slice(base.length));
    let filename = path.resolve(root, relative);
    if (filename !== root && !filename.startsWith(root + path.sep)) throw new Error(`Reference escapes docs: ${relative}`);
    let info;
    try { info = await stat(filename); }
    catch { throw new Error(`Missing local asset or page at ${base}${relative}`); }
    if (info.isDirectory()) {
      filename = path.join(filename, 'index.html');
      try { await stat(filename); }
      catch { throw new Error(`Directory has no index.html: ${relative}`); }
    }
    if (filename.startsWith(assetRoot + path.sep)) assets.add(filename);
    const extension = path.extname(filename);
    const isText = ['.html', '.css', '.js', '.mjs', '.svg'].includes(extension);
    const contents = isText ? await readFile(filename, 'utf8') : '';
    if (url.hash && (extension === '.html' || extension === '.svg')) {
      const fragment = decodeURIComponent(url.hash.slice(1));
      const ids = new Set([...contents.matchAll(/\bid\s*=\s*(['"])(.*?)\1/g)].map(match => match[2]));
      if (!ids.has(fragment)) throw new Error(`Missing #${fragment} in ${path.relative(root, filename)}`);
    }
    const key = url.pathname;
    if (visited.has(key)) continue;
    visited.add(key);
    if (!isText) continue;
    if (extension === '.js' || extension === '.mjs') scripts.add(filename);
    for (const reference of extract(contents, extension)) {
      if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) continue;
      if (reference.startsWith('/')) throw new Error(`Root-relative URL breaks repository hosting: ${reference}`);
      references++;
      queue.push(new URL(reference, url));
    }
  }
  console.log(`Verified ${visited.size} reachable pages and local assets under ${base}`);
}

for (const asset of await readdir(assetRoot)) {
  if (!assets.has(path.join(assetRoot, asset))) throw new Error(`Unused asset: assets/${asset}`);
}

for (const filename of scripts) {
  const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `JavaScript syntax check failed: ${filename}`);
}
console.log(`Checked ${references} local references, ${scripts.size} active JavaScript files and ${assets.size} assets. No unused assets remain.`);
