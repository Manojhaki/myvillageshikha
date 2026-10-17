import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Run the actual controller with independently controlled network and decode
// completion. This verifies whole-scene readiness, races and recovery; artwork
// placement and real browser rendering still need a visual check.
const siteRoot = new URL(existsSync(new URL('../dist/night-mode.js', import.meta.url)) ? '../dist/' : '../docs/', import.meta.url);
const source = await readFile(new URL('night-mode.js', siteRoot), 'utf8');
const markup = await readFile(new URL('index.html', siteRoot), 'utf8');
const about = await readFile(new URL('about/index.html', siteRoot), 'utf8');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class Element {
  constructor(tag = 'div', attributes = {}) {
    this.localName = tag;
    this.attributes = new Map(Object.entries(attributes));
    this.listeners = new Map();
    this.hidden = true;
    this.textContent = '';
    this.style = { backgroundImage: '' };
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      contains: name => this.classes.has(name),
    };
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, callback, options = {}) {
    const list = this.listeners.get(type) || [];
    list.push({ callback, options });
    this.listeners.set(type, list);
  }
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.callback !== callback));
  }
  dispatchEvent(event) {
    for (const { callback, options } of [...this.listeners.get(event.type) || []]) {
      callback(event);
      if (options.once) this.removeEventListener(event.type, callback);
    }
  }
}

function harness({ saved = null, deniedStorage = false, missingControl = false, loadingDocument = false,
  reduced = false, baseURI = 'https://example.test/myvillageshikha/', assetPrefix = './', cached = false } = {}) {
  const document = new Element('document');
  const root = new Element('html');
  const window = new Element('window');
  const control = new Element();
  const button = new Element('button', { 'aria-checked': 'false', 'aria-label': 'Night mode' });
  const status = new Element('p');
  button.closest = () => control;
  const mouse = new Element('img', { src: './assets/day-mouse.png', 'data-night-src': `${assetPrefix}assets/night-porcupine.png` });
  const civet = new Element('image', { href: './assets/day-panda.png', 'data-night-src': `${assetPrefix}assets/night-civet.png` });
  const forest = new Element('div', { 'data-night-src': `${assetPrefix}assets/night-forest.png` });
  const bhumi = new Element('img', { 'data-night-src': `${assetPrefix}assets/night-bhumi.png` });
  const repeated = new Element('image', { href: './assets/day-mouse.png', 'data-night-src': `${assetPrefix}assets/night-porcupine.png` });
  const hero = new Element('div', { 'aria-label': 'Day friends', 'data-day-label': 'Day friends', 'data-night-label': 'Bhumi in the moonlit forest' });
  const targets = [mouse, civet, forest, bhumi, repeated];
  document.documentElement = root;
  document.baseURI = baseURI;
  document.readyState = loadingDocument ? 'loading' : 'interactive';
  document.getElementById = id => ({ 'world-mode-toggle': missingControl ? null : button, 'world-mode-status': status })[id] || null;
  document.querySelectorAll = selector => selector === '[data-night-src]' ? targets : [hero];
  const createdImages = [];
  class FakeImage extends Element {
    constructor() {
      super('img');
      this.complete = false;
      this.naturalWidth = 0;
      this.decoded = deferred();
      createdImages.push(this);
    }
    set src(value) {
      this.url = value;
      if (cached) { this.complete = true; this.naturalWidth = 800; this.decoded.resolve(); }
    }
    get src() { return this.url; }
    decode() { this.decodeCalled = true; return this.decoded.promise; }
  }
  const stored = new Map(saved === null ? [] : [['shikha-world-mode', saved]]);
  const writes = [];
  const storage = {
    getItem(key) { if (deniedStorage) throw new Error('storage denied'); return stored.get(key) ?? null; },
    setItem(key, value) { if (deniedStorage) throw new Error('storage denied'); stored.set(key, value); writes.push([key, value]); },
  };
  let timerId = 0;
  const timers = new Map();
  let resizeCount = 0;
  window.matchMedia = () => ({ matches: reduced });
  window.addEventListener('resize', () => { resizeCount++; });
  const preserved = { hash: '#forest-crossing', scrollY: 1870, music: 'playing', drawing: 'completed' };
  for (const name of ['scrollY', 'location']) Object.defineProperty(window, name, { get: () => name === 'scrollY' ? preserved.scrollY : { hash: preserved.hash }, set() { throw new Error('Navigation changed'); } });
  window.scrollTo = () => { throw new Error('Scroll position changed'); };
  const context = {
    window, document, localStorage: storage, Image: FakeImage, URL,
    Event: class Event { constructor(type) { this.type = type; } },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(source, context, { filename: 'night-mode.js' });
  let initialReady = false;
  window.shikhaThemeReady.then(() => { initialReady = true; });
  async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
  function image(part) {
    const match = createdImages.filter(item => item.url.includes(part)).at(-1);
    assert.ok(match, `Preloader exists for ${part}`);
    return match;
  }
  function load(part) {
    const item = image(part);
    item.complete = true; item.naturalWidth = 800;
    item.dispatchEvent({ type: 'load' });
  }
  function loadAll() { for (const item of createdImages) { item.complete = true; item.naturalWidth = 800; item.dispatchEvent({ type: 'load' }); } }
  function decodeAll() { for (const item of createdImages) item.decoded.resolve(); }
  async function readyAll() { loadAll(); decodeAll(); await settle(); }
  async function click() { button.dispatchEvent({ type: 'click' }); await settle(); }
  async function expire(delay) {
    for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.callback(); }
    await settle();
  }
  async function domReady() { document.readyState = 'interactive'; document.dispatchEvent({ type: 'DOMContentLoaded' }); await settle(); }
  return { root, window, button, control, status, targets, mouse, civet, forest, bhumi, hero,
    images: createdImages, writes, stored, timers, preserved, settle, load, image, loadAll, decodeAll, readyAll, click, expire, domReady,
    get initialReady() { return initialReady; }, get resizeCount() { return resizeCount; } };
}

const checks = [];
function test(name, run) { checks.push({ name, run }); }

test('day startup is immediate and does not download optional night artwork', async () => {
  const h = harness(); await h.settle();
  assert.equal(h.initialReady, true);
  assert.equal(h.images.length, 0);
  assert.equal(h.control.hidden, false);
  assert.equal(h.root.getAttribute('data-theme'), 'day');
  assert.equal(h.button.getAttribute('aria-checked'), 'false');
  assert.equal(h.writes.length, 0);
});
test('missing controls and denied storage leave the site usable', async () => {
  const missing = harness({ missingControl: true }); await missing.settle();
  assert.equal(missing.initialReady, true);
  const denied = harness({ deniedStorage: true }); await denied.click(); await denied.readyAll();
  assert.equal(denied.root.getAttribute('data-theme'), 'night');
  assert.equal(denied.initialReady, true);
});
test('exposes the readiness promise synchronously even before DOMContentLoaded', async () => {
  const h = harness({ saved: 'night', loadingDocument: true }); await h.settle();
  assert.equal(h.initialReady, false);
  assert.equal(h.images.length, 0);
  await h.domReady();
  assert.equal(h.images.length, 4);
  assert.equal(h.initialReady, false);
  await h.readyAll();
  assert.equal(h.initialReady, true);
  assert.equal(h.root.getAttribute('data-theme'), 'night');
});
test('all image load and decode promises must finish before night appears', async () => {
  const h = harness(); await h.click();
  assert.equal(h.images.length, 4, 'Duplicate texture URLs share one retained preloader');
  assert.equal(h.root.getAttribute('data-theme'), 'day');
  assert.equal(h.root.getAttribute('data-theme-loading'), 'night');
  assert.equal(h.status.getAttribute('data-state'), 'loading');
  h.loadAll(); await h.settle();
  assert.equal(h.root.getAttribute('data-theme'), 'day', 'Network completion is not image decoding');
  for (const image of h.images.slice(0, -1)) image.decoded.resolve();
  await h.settle();
  assert.equal(h.root.getAttribute('data-theme'), 'day', 'Final character is still decoding');
  h.images.at(-1).decoded.resolve(); await h.settle();
  assert.equal(h.root.getAttribute('data-theme'), 'night');
  assert.equal(h.button.getAttribute('aria-checked'), 'true');
  assert.equal(h.button.getAttribute('aria-busy'), 'false');
  assert.equal(h.root.getAttribute('data-theme-loading'), null);
  assert.equal(h.hero.getAttribute('aria-label'), 'Bhumi in the moonlit forest');
  assert.equal(h.resizeCount, 1);
});
test('saved night waits behind the readiness promise and does not rewrite preference', async () => {
  const h = harness({ saved: 'night' }); await h.settle();
  assert.equal(h.initialReady, false);
  await h.readyAll();
  assert.equal(h.initialReady, true);
  assert.equal(h.root.getAttribute('data-theme'), 'night');
  assert.equal(h.writes.length, 0);
});
test('day restores exact original sources, missing sources and inline background', async () => {
  const h = harness(); await h.click(); await h.readyAll(); await h.click();
  assert.equal(h.mouse.getAttribute('src'), './assets/day-mouse.png');
  assert.equal(h.civet.getAttribute('href'), './assets/day-panda.png');
  assert.equal(h.bhumi.getAttribute('src'), null, 'Night-only art has no empty src request');
  assert.equal(h.forest.style.backgroundImage, '');
  assert.equal(h.hero.getAttribute('aria-label'), 'Day friends');
  assert.equal(h.button.getAttribute('aria-checked'), 'false');
  assert.equal(h.resizeCount, 2);
  assert.equal(h.stored.get('shikha-world-mode'), 'day');
});
test('relative artwork URLs resolve correctly from nested pages and subpath hosting', async () => {
  const h = harness({ baseURI: 'https://example.test/myvillageshikha/about/', assetPrefix: '../' });
  await h.click(); await h.readyAll();
  assert.equal(h.civet.getAttribute('href'), 'https://example.test/myvillageshikha/assets/night-civet.png');
  assert.equal(h.mouse.getAttribute('src'), 'https://example.test/myvillageshikha/assets/night-porcupine.png');
  assert.equal(h.forest.style.backgroundImage, 'url("https://example.test/myvillageshikha/assets/night-forest.png")');
});
test('a failed night image keeps day visible and another Night selection retries', async () => {
  const h = harness(); await h.click();
  h.image('porcupine').dispatchEvent({ type: 'error' }); await h.settle();
  assert.equal(h.root.getAttribute('data-theme'), 'day');
  assert.equal(h.status.getAttribute('data-state'), 'error');
  assert.match(h.status.textContent, /retry/);
  assert.equal(h.writes.length, 0, 'A failed choice is not persisted');
  await h.click();
  assert.equal(h.images.length, 5, 'Only the failed URL is downloaded again');
  await h.readyAll();
  assert.equal(h.root.getAttribute('data-theme'), 'night');
  assert.equal(h.stored.get('shikha-world-mode'), 'night');
});
test('a decode failure is recoverable and never applies half a night scene', async () => {
  const h = harness(); await h.click(); h.loadAll();
  h.image('civet').decoded.reject(new Error('Decode failed')); await h.settle();
  assert.equal(h.root.getAttribute('data-theme'), 'day');
  assert.equal(h.mouse.getAttribute('src'), './assets/day-mouse.png');
  await h.click(); await h.readyAll();
  assert.equal(h.root.getAttribute('data-theme'), 'night');
});
test('a saved night timeout releases the loading gate with a visible retry path', async () => {
  const h = harness({ saved: 'night' }); await h.settle(); await h.expire(15000);
  assert.equal(h.initialReady, true);
  assert.equal(h.root.getAttribute('data-theme'), 'day');
  assert.equal(h.button.getAttribute('aria-busy'), 'false');
  assert.equal(h.status.getAttribute('data-state'), 'error');
  assert.equal(h.stored.get('shikha-world-mode'), 'night', 'Transient network failure does not erase the saved choice');
  await h.click(); await h.readyAll();
  assert.equal(h.root.getAttribute('data-theme'), 'night');
});
test('a second selection cancels pending night and stale completion cannot change day', async () => {
  const h = harness(); await h.click(); await h.click();
  assert.equal(h.root.getAttribute('data-theme'), 'day');
  assert.equal(h.stored.get('shikha-world-mode'), 'day');
  await h.readyAll();
  assert.equal(h.root.getAttribute('data-theme'), 'day');
  assert.equal(h.button.getAttribute('aria-checked'), 'false');
  assert.equal(h.writes.length, 1);
});
test('rapid day night day night chooses only the latest intent and reuses decoded art', async () => {
  const h = harness(); await h.click(); await h.click(); await h.click(); await h.readyAll();
  assert.equal(h.root.getAttribute('data-theme'), 'night');
  assert.equal(h.images.length, 4);
  assert.equal(h.writes.length, 2, 'Only day cancellation and final night are persisted');
  await h.click(); await h.click();
  assert.equal(h.root.getAttribute('data-theme'), 'night');
  assert.equal(h.images.length, 4, 'Successful preload cache survives later switches');
});
test('cached images work and reduced motion skips the transition class', async () => {
  const h = harness({ cached: true, reduced: true }); await h.click();
  assert.equal(h.root.getAttribute('data-theme'), 'night');
  assert.equal(h.root.classList.contains('theme-changing'), false);
  assert.equal([...h.timers.values()].some(timer => timer.delay === 650), false);
});
test('color transition ends and the switch never changes navigation, music or drawings', async () => {
  const h = harness(); await h.click(); await h.readyAll();
  assert.equal(h.root.classList.contains('theme-changing'), true);
  await h.expire(650);
  assert.equal(h.root.classList.contains('theme-changing'), false);
  assert.deepEqual(h.preserved, { hash: '#forest-crossing', scrollY: 1870, music: 'playing', drawing: 'completed' });
  assert.equal(h.window.location.hash, '#forest-crossing');
  assert.equal(h.window.scrollY, 1870);
});
test('both pages load the theme controller before the resource readiness gate', () => {
  for (const html of [markup, about]) {
    assert.ok(html.includes('night-mode.js'), 'Theme controller is present');
    assert.ok(html.indexOf('night-mode.js') < html.indexOf('site-loader.js'), 'Initial theme promise is available to loader');
    assert.match(html, /id="world-mode-toggle"[^>]*role="switch"/);
  }
});

for (const { name, run } of checks) {
  await run();
  console.log(`PASS ${name}`);
}
console.log(`${checks.length} night-mode checks passed.`);
