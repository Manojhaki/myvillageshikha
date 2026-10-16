import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Run the real loading controller with controllable resource promises. These
// checks exercise the readiness gate, not a second version of its algorithm;
// visual presentation and genuine network behavior still need a browser check.
const siteRoot = new URL(existsSync(new URL('../dist/site-loader.js', import.meta.url)) ? '../dist/' : '../docs/', import.meta.url);
const source = await readFile(new URL('site-loader.js', siteRoot), 'utf8');
const markup = await readFile(new URL('index.html', siteRoot), 'utf8');
const aboutMarkup = await readFile(new URL('about/index.html', siteRoot), 'utf8');
const styles = markup.match(/<style\b[^>]*id="site-loader-styles"[^>]*>([\s\S]*?)<\/style>/i)?.[1] || '';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback, options = {}) {
    const entries = this.listeners.get(type) || [];
    entries.push({ callback, options });
    this.listeners.set(type, entries);
  }
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.callback !== callback));
  }
  dispatchEvent(event) {
    event.target ??= this;
    event.currentTarget = this;
    for (const entry of [...this.listeners.get(event.type) || []]) {
      entry.callback(event);
      if (entry.options.once) this.removeEventListener(event.type, entry.callback);
    }
    return !event.defaultPrevented;
  }
  emit(type, properties = {}) { return this.dispatchEvent({ type, ...properties }); }
}

class Element extends Events {
  constructor(tagName, attributes = {}) {
    super();
    this.tagName = tagName.toUpperCase();
    this.localName = tagName.toLowerCase();
    this.attributes = new Map(Object.entries(attributes));
    this.children = [];
    this.parentElement = null;
    this.nodeType = 1;
    this.dataset = {};
    this.hidden = false;
    this.textContent = '';
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      contains: name => this.classes.has(name),
      toggle: (name, force) => {
        const enabled = force ?? !this.classes.has(name);
        if (enabled) this.classes.add(name); else this.classes.delete(name);
        return enabled;
      },
    };
    this.style = { setProperty() {}, removeProperty() {} };
    this.computed = {};
    this.before = {};
    this.after = {};
  }
  get id() { return this.getAttribute('id') || ''; }
  get inert() { return this.hasAttribute('inert'); }
  set inert(value) { if (value) this.setAttribute('inert', ''); else this.removeAttribute('inert'); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  getAttributeNS(_namespace, name) { return this.getAttribute(name) ?? this.getAttribute(`xlink:${name}`); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  toggleAttribute(name, force) {
    const on = force ?? !this.hasAttribute(name);
    if (on) this.setAttribute(name, ''); else this.removeAttribute(name);
    return on;
  }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  appendChild(child) { this.append(child); return child; }
  cloneNode() {
    const clone = new Element(this.localName, Object.fromEntries(this.attributes));
    if (this.href) clone.href = this.href;
    if (this.rel) clone.rel = this.rel;
    return clone;
  }
  replaceWith(replacement) {
    const parent = this.parentElement;
    replacement.parentElement = parent;
    if (parent) parent.children[parent.children.indexOf(this)] = replacement;
    this.parentElement = null;
  }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  contains(element) { return element === this || this.children.some(child => child.contains(element)); }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 }; }
  getClientRects() { return [this.getBoundingClientRect()]; }
  matches(selector) {
    if (selector === '*') return true;
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classes.has(selector.slice(1));
    const tag = selector.match(/^([a-z]+)/i)?.[1];
    if (tag && this.localName !== tag.toLowerCase()) return false;
    for (const match of selector.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
      if (!this.hasAttribute(match[1])) return false;
      if (match[2] !== undefined && this.getAttribute(match[1]) !== match[2]) return false;
    }
    return Boolean(tag || selector.startsWith('['));
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(part => part.trim());
    const matches = (element, part) => {
      const chain = part.split(/\s+/);
      if (!element.matches(chain.pop())) return false;
      let ancestor = element.parentElement;
      while (chain.length) {
        const expected = chain.pop();
        while (ancestor && !ancestor.matches(expected)) ancestor = ancestor.parentElement;
        if (!ancestor) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    };
    const found = [];
    const visit = element => {
      for (const child of element.children) {
        if (selectors.some(part => matches(child, part))) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  focus() { this.focused = true; }
}

function harness({ stylesheetPending = false, bootClass = true, readyState = 'loading', reducedMotion = false } = {}) {
  const document = new Events();
  const window = new Events();
  const root = new Element('html');
  if (bootClass) root.classList.add('site-loading');
  const head = new Element('head');
  const body = new Element('body');
  root.append(head, body);
  const elements = {};
  for (const name of ['site-loader', 'site-loader-status', 'site-loader-progress', 'site-loader-actions', 'site-loader-retry', 'site-loader-continue']) {
    elements[name] = new Element(name.endsWith('retry') || name.endsWith('continue') ? 'button' : 'div', { id: name });
  }
  const overlay = elements['site-loader'];
  overlay.hidden = false;
  overlay.append(elements['site-loader-status'], elements['site-loader-progress'], elements['site-loader-actions']);
  elements['site-loader-actions'].append(elements['site-loader-retry'], elements['site-loader-continue']);
  elements['site-loader-actions'].hidden = true;
  elements['site-loader-retry'].hidden = true;
  elements['site-loader-continue'].hidden = false;
  const header = new Element('header');
  const main = new Element('main', { id: 'main', 'aria-busy': 'false' });
  const alreadyInert = new Element('aside', { inert: '' });
  alreadyInert.inert = true;
  const audio = new Element('audio', { src: './assets/music.mp3' });
  audio.readyState = 0;
  body.append(overlay, header, main, alreadyInert, audio);
  document.documentElement = root;
  document.head = head;
  document.body = body;
  document.baseURI = 'https://shikha.example/myvillageshikha/#connection';
  document.readyState = readyState;
  document.hidden = false;
  document.getElementById = id => root.querySelector(`#${id}`);
  document.querySelector = selector => selector === 'html' ? root : root.querySelector(selector);
  document.querySelectorAll = selector => root.querySelectorAll(selector);
  document.createElement = tag => new Element(tag);
  const resources = new Map();
  const preloads = [];
  let eagerWrites = 0;

  function resource(url) {
    const key = new URL(url, document.baseURI).href;
    if (!resources.has(key)) resources.set(key, { url: key, images: [], decoded: deferred() });
    return resources.get(key);
  }
  class ImageElement extends Element {
    constructor(attributes = {}, native = false) {
      super('img', attributes);
      this.native = native;
      this.complete = false;
      this.naturalWidth = 0;
      this._loading = attributes.loading || 'eager';
      this.decodeCalls = 0;
      if (attributes.src) this.src = attributes.src;
    }
    get src() { return this._src || ''; }
    set src(value) {
      this._src = new URL(value, document.baseURI).href;
      this.complete = false;
      this.naturalWidth = 0;
      this.setAttribute('src', value);
      resource(this._src).images.push(this);
    }
    get currentSrc() { return this.src; }
    get loading() { return this._loading; }
    set loading(value) { this._loading = value; if (this.native && value === 'eager') eagerWrites++; }
    decode() { this.decodeCalls++; return resource(this.src).decoded.promise; }
  }
  window.Image = class extends ImageElement {
    constructor() { super(); preloads.push(this); }
  };
  const lazy = new ImageElement({ src: './assets/lazy.png', loading: 'lazy' }, true);
  main.append(lazy);
  Object.defineProperty(document, 'images', { get: () => root.querySelectorAll('img') });
  const svg = new Element('svg');
  const svgImage = new Element('image', { href: './assets/svg-character.png' });
  svgImage.href = { baseVal: './assets/svg-character.png' };
  svg.append(svgImage);
  main.append(svg);
  const background = new Element('div');
  background.computed = { backgroundImage: 'url("https://shikha.example/myvillageshikha/assets/background.png")', maskImage: 'url("https://shikha.example/myvillageshikha/assets/mask.svg")' };
  background.before = { backgroundImage: 'url("https://shikha.example/myvillageshikha/assets/background.png"), url("https://shikha.example/myvillageshikha/assets/paper.png")' };
  background.after = { webkitMaskImage: 'url("https://shikha.example/myvillageshikha/assets/mask.svg")' };
  main.append(background);
  const stylesheet = new Element('link', { rel: 'stylesheet', href: './style.css' });
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./style.css', document.baseURI).href;
  const markerSheet = { cssRules: [{ type: 5, style: { getPropertyValue: property => property === 'font-family' ? 'Marker' : '' } }] };
  stylesheet.sheet = stylesheetPending ? null : markerSheet;
  head.append(stylesheet);
  const fontsReady = deferred();
  const fontLoads = [];
  document.fonts = {
    status: 'loading',
    ready: fontsReady.promise,
    load: descriptor => { const gate = deferred(); fontLoads.push({ descriptor, ...gate }); return gate.promise; },
    check: () => false,
    [Symbol.iterator]: function* () { yield { family: 'Marker', status: 'unloaded', style: 'normal', weight: '400' }; },
  };
  let nextId = 0;
  let time = 0;
  const frames = new Map();
  const timers = new Map();
  const mutations = [];
  class MutationObserver {
    constructor(callback) { this.callback = callback; mutations.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const computedStyle = (element, pseudo) => {
    const properties = pseudo === '::before' ? element.before : pseudo === '::after' ? element.after : element.computed;
    return new Proxy({
      display: 'block', visibility: 'visible', backgroundImage: 'none', maskImage: 'none',
      webkitMaskImage: 'none', fontFamily: 'Marker, sans-serif', ...properties,
      getPropertyValue: key => ({ 'background-image': properties.backgroundImage, 'mask-image': properties.maskImage, '-webkit-mask-image': properties.webkitMaskImage, 'font-family': 'Marker, sans-serif' }[key] || 'none'),
    }, { get: (target, property) => target[property] ?? '' });
  };
  const raf = callback => { const id = ++nextId; frames.set(id, callback); return id; };
  const timer = (callback, delay = 0) => { const id = ++nextId; timers.set(id, { callback, at: time + delay }); return id; };
  window.location = new URL(document.baseURI);
  window.scrollX = 0;
  window.scrollY = 734;
  window.scrollTo = () => { throw new Error('The loading gate must preserve scroll position'); };
  window.requestAnimationFrame = raf;
  window.cancelAnimationFrame = id => frames.delete(id);
  window.setTimeout = timer;
  window.clearTimeout = id => timers.delete(id);
  window.getComputedStyle = computedStyle;
  window.matchMedia = () => ({ matches: reducedMotion, addEventListener() {} });
  const errors = [];
  const context = vm.createContext({ document, window, Image: window.Image, MutationObserver,
    URL, Promise, Map, Set, WeakMap, Error, AggregateError, Array, Number, String, Object, Math,
    location: window.location,
    HTMLElement: Element, HTMLImageElement: ImageElement,
    getComputedStyle: computedStyle, matchMedia: window.matchMedia,
    requestAnimationFrame: raf, cancelAnimationFrame: window.cancelAnimationFrame,
    setTimeout: timer, clearTimeout: window.clearTimeout,
    console: { log() {}, warn: (...args) => errors.push(args), error: (...args) => errors.push(args) },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } },
    Event: class { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } },
  });
  vm.runInContext(source, context, { filename: 'site-loader.js' });
  async function settle() { for (let index = 0; index < 40; index++) await Promise.resolve(); }
  async function frame() {
    const pending = [...frames];
    for (const [id, callback] of pending) { frames.delete(id); callback(time); }
    await settle();
  }
  async function advance(milliseconds) {
    time += milliseconds;
    let pending;
    do {
      pending = [...timers].filter(([, entry]) => entry.at <= time);
      for (const [id, entry] of pending) { timers.delete(id); entry.callback(); }
      await settle();
    } while (pending.length);
  }
  function loaded(url) {
    const entry = resource(url);
    for (const image of entry.images) { image.complete = true; image.naturalWidth = 256; image.emit('load'); }
  }
  function decoded(url) { resource(url).decoded.resolve(); }
  function failed(url) {
    const entry = resource(url);
    for (const image of entry.images) { image.complete = true; image.naturalWidth = 0; image.emit('error'); }
  }
  async function allVisuals(except = '') {
    await settle();
    for (let round = 0; round < 4; round++) {
      for (const entry of resources.values()) if (!entry.url.endsWith(except) || !except) { loaded(entry.url); decoded(entry.url); }
      for (const font of fontLoads) font.resolve([{ family: 'Marker', status: 'loaded' }]);
      document.fonts.status = 'loaded';
      fontsReady.resolve();
      await settle();
    }
  }
  async function domLoaded() { document.readyState = 'interactive'; document.emit('DOMContentLoaded'); await settle(); }
  async function windowLoaded() { document.readyState = 'complete'; window.emit('load'); await settle(); }
  async function sheetLoaded() { stylesheet.sheet = markerSheet; stylesheet.emit('load'); await settle(); }
  const active = () => root.classList.contains('site-loading');
  return { root, body, main, header, alreadyInert, overlay, elements, document, window, lazy,
    stylesheet, resources, preloads, fontLoads, fontsReady, errors, mutations, timers, frames,
    settle, frame, advance, loaded, decoded, failed, allVisuals, domLoaded, windowLoaded, sheetLoaded, active,
    get eagerWrites() { return eagerWrites; },
  };
}

let passed = 0;
async function test(name, check) {
  await check();
  passed++;
  console.log(`PASS ${name}`);
}

await test('pages remain visible without JavaScript and bootstrap the gate before styles', async () => {
  for (const page of [markup, aboutMarkup]) {
    assert.doesNotMatch(page.match(/<html\b[^>]*>/i)?.[0] || '', /\bsite-loading\b/);
    assert.doesNotMatch(page.match(/<body\b[^>]*>/i)?.[0] || '', /\b(?:inert|hidden)\b/);
    const bootstrap = page.indexOf("classList.add('site-loading')");
    const stylesheet = page.indexOf('rel="stylesheet"');
    assert.ok(bootstrap > 0 && bootstrap < stylesheet, 'the early bootstrap precedes the first stylesheet');
    assert.match(page, /id="site-loader"/);
    assert.match(page, /site-loader\.js/);
    assert.match(page, /id="site-loader-styles"/);
    const script = [...page.matchAll(/<script\b[^>]*>/gi)].map(match => match[0]).find(tag => /src=["'][^"']*site-loader\.js/.test(tag));
    assert.match(script || '', /onerror=["'][^"']*classList\.remove/, 'a blocked controller script restores the static page');
  }
  assert.match(styles, /prefers-reduced-motion/);
});

await test('a missing bootstrap leaves static content usable without starting a hidden gate', async () => {
  const h = harness({ bootClass: false });
  await h.settle();
  assert.equal(h.header.inert, false);
  assert.equal(h.main.inert, false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.frames.size, 0);
});

await test('the loading gate immediately makes the background inert and promotes lazy images', async () => {
  const h = harness();
  await h.settle();
  assert.equal(h.active(), true);
  assert.equal(h.overlay.hidden, false);
  assert.equal(h.header.inert, true);
  assert.equal(h.main.inert, true);
  assert.equal(h.overlay.inert, false);
  assert.equal(h.main.getAttribute('aria-busy'), 'true');
  assert.equal(h.lazy.loading, 'eager');
  assert.ok(h.eagerWrites >= 1, 'offscreen native images begin fetching before reveal');
});

await test('stylesheets finish before CSS background, mask and pseudo-element assets are collected once', async () => {
  const h = harness({ stylesheetPending: true });
  await h.settle();
  assert.equal(h.active(), true);
  assert.equal(h.preloads.some(image => image.src.endsWith('/background.png')), false, 'computed image styles are not read before their stylesheet arrives');
  await h.sheetLoaded();
  await h.domLoaded();
  const required = ['svg-character.png', 'background.png', 'mask.svg', 'paper.png'];
  for (const suffix of required) {
    assert.equal(h.preloads.filter(image => image.src.endsWith(`/${suffix}`)).length, 1, `${suffix} is fetched exactly once across HTML/SVG/CSS appearances`);
  }
  assert.ok(h.fontLoads.length > 0, 'custom font requests are explicitly activated');
  await h.allVisuals();
  await h.windowLoaded();
  await h.frame();
  assert.equal(h.active(), true, 'the first paint turn still keeps the page covered');
  await h.frame();
  assert.equal(h.active(), false, 'two paint turns release fully prepared artwork');
});

await test('a missed stylesheet error offers recovery without waiting for media or window load', async () => {
  const h = harness({ stylesheetPending: true });
  await h.settle();
  await h.domLoaded();
  assert.equal(h.document.readyState, 'interactive');
  assert.equal(h.active(), true, 'failed styles must not expose an unfinished page');
  assert.equal(h.elements['site-loader-actions'].hidden, false);
  assert.equal(h.elements['site-loader-retry'].hidden, false, 'a stylesheet error missed before controller startup is recoverable');
});

await test('a loaded image must also decode before any page is revealed', async () => {
  const h = harness();
  await h.domLoaded();
  await h.allVisuals('lazy.png');
  await h.windowLoaded();
  h.loaded('./assets/lazy.png');
  await h.settle();
  await h.frame();
  await h.frame();
  assert.ok(h.lazy.decodeCalls > 0, 'the actual native image decoder is awaited');
  assert.equal(h.active(), true, 'network completion alone does not reveal an undecoded image');
  h.decoded('./assets/lazy.png');
  await h.settle();
  await h.frame();
  await h.frame();
  assert.equal(h.active(), false);
});

await test('the last decorative SVG/CSS image keeps the gate closed', async () => {
  for (const suffix of ['svg-character.png', 'background.png', 'mask.svg', 'paper.png']) {
    const h = harness();
    await h.domLoaded();
    await h.allVisuals(suffix);
    await h.windowLoaded();
    await h.frame();
    await h.frame();
    assert.equal(h.active(), true, `${suffix} remains part of the visual gate`);
    h.loaded(`./assets/${suffix}`);
    h.decoded(`./assets/${suffix}`);
    await h.settle();
    await h.frame();
    await h.frame();
    assert.equal(h.active(), false, `${suffix} completing allows a prepared page to reveal`);
  }
});

await test('custom font readiness and deferred/module initialization must both finish', async () => {
  const h = harness();
  await h.settle();
  for (let round = 0; round < 4; round++) {
    for (const entry of h.resources.values()) { h.loaded(entry.url); h.decoded(entry.url); }
    await h.settle();
  }
  await h.frame();
  await h.frame();
  assert.equal(h.active(), true, 'a page still initializing scripts stays covered');
  await h.domLoaded();
  await h.windowLoaded();
  for (const entry of h.resources.values()) { h.loaded(entry.url); h.decoded(entry.url); }
  await h.settle();
  await h.frame();
  await h.frame();
  assert.equal(h.active(), true, 'fonts have not resolved');
  for (const font of h.fontLoads) font.resolve([{ family: 'Marker', status: 'loaded' }]);
  await h.settle();
  await h.frame();
  await h.frame();
  assert.equal(h.active(), true, 'font load requests alone do not replace document.fonts.ready');
  h.fontsReady.resolve();
  await h.settle();
  await h.frame();
  await h.frame();
  assert.equal(h.active(), false);
});

await test('visual readiness does not wait for audio to finish delaying window load', async () => {
  const h = harness();
  await h.domLoaded();
  await h.allVisuals();
  await h.frame();
  await h.frame();
  assert.equal(h.document.readyState, 'interactive', 'window.load has not fired');
  assert.equal(h.active(), false, 'explicitly prepared visual resources and initialized scripts are sufficient');
});

await test('completed visual assets cannot bypass deferred and module script initialization', async () => {
  const h = harness();
  await h.allVisuals();
  await h.frame();
  await h.frame();
  assert.equal(h.active(), true, 'DOMContentLoaded has not completed script initialization');
  await h.domLoaded();
  await h.frame();
  await h.frame();
  assert.equal(h.active(), false);
});

await test('successful release preserves the hash and scroll, restores inert states, and ignores audio buffering', async () => {
  const h = harness();
  await h.domLoaded();
  await h.allVisuals();
  await h.windowLoaded();
  await h.frame();
  await h.frame();
  assert.equal(h.active(), false);
  assert.equal(h.root.classList.contains('site-revealing'), true);
  assert.equal(h.main.inert, false);
  assert.equal(h.header.inert, false);
  assert.equal(h.alreadyInert.inert, true, 'pre-existing inert regions are preserved');
  assert.notEqual(h.main.getAttribute('aria-busy'), 'true');
  assert.equal(h.window.location.hash, '#connection');
  assert.equal(h.window.scrollY, 734);
  assert.equal(h.preloads.some(image => image.src.endsWith('.mp3')), false, 'music does not enter the visual readiness gate');
  await h.advance(1000);
  assert.equal(h.overlay.hidden, true, 'the fade cannot leave an invisible interactive overlay behind');
});

await test('a stalled connection offers an explicit escape without revealing partial artwork automatically', async () => {
  const h = harness();
  await h.domLoaded();
  await h.advance(60_000);
  assert.equal(h.active(), true, 'a timeout must not silently show an incomplete scene');
  assert.equal(h.elements['site-loader-actions'].hidden, false);
  assert.equal(h.elements['site-loader-continue'].hidden, false, 'visitors are never trapped by a stalled resource');
  h.elements['site-loader-continue'].emit('click');
  await h.settle();
  await h.frame();
  await h.frame();
  await h.advance(1000);
  assert.equal(h.overlay.hidden, true);
  assert.equal(h.main.inert, false);
});

await test('resource failures expose retry and continue controls instead of an endless spinner', async () => {
  const h = harness();
  await h.domLoaded();
  await h.allVisuals('lazy.png');
  await h.windowLoaded();
  h.failed('./assets/lazy.png');
  await h.settle();
  assert.equal(h.active(), true);
  assert.equal(h.elements['site-loader-actions'].hidden, false);
  assert.equal(h.elements['site-loader-retry'].hidden, false);
  assert.equal(h.elements['site-loader-continue'].hidden, false);
  assert.match(h.elements['site-loader-status'].textContent, /(?:load|connect|retry|again|art|reach)/i);
  h.elements['site-loader-continue'].emit('click');
  await h.settle();
  await h.frame();
  await h.frame();
  await h.advance(1000);
  assert.equal(h.active(), false);
  assert.equal(h.overlay.hidden, true);
});

await test('Retry can recover a failed image and finish the same visit', async () => {
  const h = harness();
  await h.domLoaded();
  await h.allVisuals('lazy.png');
  await h.windowLoaded();
  h.failed('./assets/lazy.png');
  await h.settle();
  assert.equal(h.active(), true);
  h.elements['site-loader-retry'].emit('click');
  await h.settle();
  h.loaded('./assets/lazy.png');
  h.decoded('./assets/lazy.png');
  await h.settle();
  await h.frame();
  await h.frame();
  assert.equal(h.active(), false, 'a successful retry releases the already prepared page');
});

await test('Retry recreates a failed font face instead of trusting its cached error', async () => {
  const h = harness();
  await h.domLoaded();
  await h.windowLoaded();
  for (const entry of h.resources.values()) { h.loaded(entry.url); h.decoded(entry.url); }
  h.fontsReady.resolve();
  await h.settle();
  assert.ok(h.fontLoads.length > 0);
  h.fontLoads[0].reject(new Error('The font request was offline'));
  await h.settle();
  assert.equal(h.active(), true);
  assert.equal(h.elements['site-loader-retry'].hidden, false);
  h.elements['site-loader-retry'].emit('click');
  await h.settle();
  const replacement = h.document.head.querySelector('link[rel="stylesheet"]');
  assert.notEqual(replacement, h.stylesheet, 'the declaring stylesheet is refreshed to recreate the failed FontFace');
  assert.equal(h.active(), true, 'a new stylesheet waits for its own load after window.load');
  replacement.sheet = h.stylesheet.sheet;
  replacement.emit('load');
  await h.settle();
  assert.ok(h.fontLoads.length > 1, 'the custom font load is attempted again');
  h.fontLoads.at(-1).resolve([{ family: 'Marker', status: 'loaded' }]);
  await h.settle();
  await h.frame();
  await h.frame();
  assert.equal(h.active(), false);
});

await test('restoring a page from the back-forward cache never traps its content behind a stale overlay', async () => {
  const h = harness();
  await h.settle();
  h.window.emit('pageshow', { persisted: true });
  await h.settle();
  assert.equal(h.active(), false);
  assert.equal(h.overlay.hidden, true);
  assert.equal(h.main.inert, false);
  assert.equal(h.alreadyInert.inert, true);
});

await test('already-loaded pages and reduced-motion visitors do not wait for nonexistent future events or a fade', async () => {
  const h = harness({ readyState: 'complete', reducedMotion: true });
  await h.allVisuals();
  await h.frame();
  await h.frame();
  assert.equal(h.active(), false);
  assert.equal(h.overlay.hidden, true);
  assert.equal(h.root.classList.contains('site-revealing'), false);
});

console.log(`Verified ${passed} loading-gate regression checks`);

