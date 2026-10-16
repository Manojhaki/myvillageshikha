import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the actual scroll controller with scene measurements, rather than
// duplicating its easing or foam equations. This covers scheduling and reversible
// geometry; the rendered cardboard artwork still needs a visual browser check.
const siteRoot = new URL(existsSync(new URL('../dist/scenery-scroll.js', import.meta.url)) ? '../dist/' : '../docs/', import.meta.url);
const source = await readFile(new URL('scenery-scroll.js', siteRoot), 'utf8');
const markup = await readFile(new URL('index.html', siteRoot), 'utf8');
const foamTags = [...markup.matchAll(/<div\b[^>]*\bdata-waterfall-foam\b[^>]*>/g)].map(match => match[0]);
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

class Element {
  constructor(name, dataset = {}) {
    this.name = name;
    this.dataset = dataset;
    this.listeners = new Map();
    this.properties = new Map();
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
    };
    this.writes = 0;
    this.style = { setProperty: (name, value) => { this.properties.set(name, String(value)); this.writes++; } };
  }
  addEventListener(type, callback, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ callback, options });
    this.listeners.set(type, listeners);
  }
  dispatch(type) { for (const listener of this.listeners.get(type) || []) listener.callback({ type }); }
  value(name) {
    assert.ok(this.properties.has(name), `${this.name} has a ${name} value`);
    const value = Number.parseFloat(this.properties.get(name));
    assert.ok(Number.isFinite(value), `${this.name} ${name} is finite`);
    return value;
  }
}

function harness({ width = 1440, height = 900, stageWidth = width - 48, travelerWidth = 190, reduced = false } = {}) {
  const root = new Element('root');
  const document = new Element('document');
  document.hidden = false;
  document.documentElement = root;
  const window = new Element('window');
  window.innerWidth = width;
  window.innerHeight = height;
  const media = new Element('media');
  media.matches = reduced;
  window.matchMedia = () => media;
  const scene = new Element('scene');
  const stage = new Element('crossing stage');
  stage.clientWidth = stageWidth;
  const traveler = new Element('crossing animal');
  traveler.offsetWidth = travelerWidth;
  const animal = new Element('peeking animal');
  const layer = new Element('depth layer', { depth: '.6' });
  const water = new Element('water');
  const foam = foamTags.map((tag, index) => new Element(`foam ${index + 1}`, {
    foamPhase: attribute(tag, 'data-foam-phase'),
    foamDepth: attribute(tag, 'data-foam-depth'),
  }));
  let progress = 0;
  scene.getBoundingClientRect = () => {
    const sceneHeight = 280;
    const top = window.innerHeight - progress * (window.innerHeight + sceneHeight);
    return { top, bottom: top + sceneHeight, height: sceneHeight, width: stage.clientWidth };
  };
  scene.querySelector = selector => selector === '.crossing-stage' ? stage : null;
  scene.querySelectorAll = selector => ({
    '[data-peek-animal]': [animal],
    '[data-crossing-animal]': [traveler],
    '[data-waterfall-foam]': foam,
    '[data-water-flow]': [water],
    '[data-depth]': [layer],
  }[selector] || []);
  const background = new Element('background', { backgroundDepth: '.5' });
  background.closest = () => scene;
  document.querySelectorAll = selector => ({
    '[data-peek-scene]': [scene],
    '[data-background-depth]': [background],
  }[selector] || []);
  let nextFrame = 0;
  const frames = new Map();
  window.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  vm.runInNewContext(source, { document, window }, { filename: 'scenery-scroll.js' });
  function flush() {
    const pending = [...frames];
    for (const [id, callback] of pending) { frames.delete(id); callback(); }
  }
  function at(nextProgress) { progress = nextProgress; window.dispatch('scroll'); flush(); }
  return { root, document, window, media, scene, stage, traveler, animal, layer, water, foam, background, frames, flush, at };
}

let passed = 0;
function test(name, check) { check(); passed++; console.log(`PASS ${name}`); }

test('scroll events batch into one frame and stop requesting frames while idle', () => {
  const h = harness();
  assert.equal(h.frames.size, 1, 'initial rendering is scheduled once');
  for (let index = 0; index < 40; index++) h.window.dispatch('scroll');
  h.window.dispatch('resize');
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.equal(h.frames.size, 0, 'a frame never starts a permanent animation loop');
  const writes = h.traveler.writes;
  h.window.dispatch('scroll');
  h.flush();
  assert.equal(h.traveler.writes, writes, 'unchanged positions do not repeat inline writes');
  assert.equal(h.frames.size, 0);
  assert.equal(h.window.listeners.get('scroll')[0].options.passive, true);
});

test('the forest animal travels sideways monotonically and reverses exactly when scrolling back', () => {
  const h = harness();
  const positions = [0, .18, .3, .45, .6, .75, .9, 1];
  const snapshots = positions.map(progress => {
    h.at(progress);
    return ['--crossing-x', '--crossing-y', '--crossing-tilt'].map(property => h.traveler.value(property));
  });
  assert.ok(snapshots[0][0] < 0 && snapshots.at(-1)[0] > 0, 'the animal crosses both sides of the band');
  assert.ok(snapshots.at(-1)[0] - snapshots[0][0] > h.stage.clientWidth, 'the animal crosses the entire scene');
  snapshots.slice(1).forEach((snapshot, index) => assert.ok(snapshot[0] >= snapshots[index][0], 'sideways travel never jumps backward'));
  [...positions.keys()].reverse().forEach(index => {
    h.at(positions[index]);
    assert.deepEqual(['--crossing-x', '--crossing-y', '--crossing-tilt'].map(property => h.traveler.value(property)), snapshots[index]);
  });
});

test('phone, tablet and desktop travel stays bounded by the measured cardboard stage', () => {
  for (const width of [320, 390, 639, 768, 1440]) {
    const h = harness({ width, stageWidth: width - 32, travelerWidth: width <= 639 ? 116 : 190 });
    const edge = (h.stage.clientWidth + h.traveler.offsetWidth) / 2;
    for (const progress of [0, .1, .25, .5, .7, .9, 1]) {
      h.at(progress);
      assert.ok(Math.abs(h.traveler.value('--crossing-x')) <= edge + .001, `travel is bounded at ${width}px`);
      assert.ok(Math.abs(h.traveler.value('--crossing-y')) <= (width <= 639 ? 3 : 5) + .001, `paper stepping is subtle at ${width}px`);
    }
    h.at(0);
    assert.ok(Math.abs(h.traveler.value('--crossing-x') + edge) < .001, 'entry starts just outside the stage');
    h.at(1);
    assert.ok(Math.abs(h.traveler.value('--crossing-x') - edge) < .001, 'exit finishes just outside the stage');
  }
});

test('resizing recalculates sideways travel from the new stage and character width', () => {
  const h = harness({ width: 390, stageWidth: 358, travelerWidth: 116 });
  h.at(1);
  const oldEnd = h.traveler.value('--crossing-x');
  h.window.innerWidth = 1280;
  h.stage.clientWidth = 1160;
  h.traveler.offsetWidth = 190;
  h.window.dispatch('resize');
  h.flush();
  assert.ok(h.traveler.value('--crossing-x') > oldEnd);
  assert.equal(h.traveler.value('--crossing-x'), (1160 + 190) / 2);
});

test('fifteen differently phased foam patches keep forming on every scroll in either direction', () => {
  assert.ok(foamTags.length >= 15, 'the page includes the added foam layers');
  assert.ok(new Set(foamTags.map(tag => attribute(tag, 'data-foam-phase'))).size >= 12, 'foam phases remain staggered');
  const h = harness();
  h.at(.41);
  const snapshot = h.foam.map(patch => [...patch.properties]);
  assert.ok(new Set(h.foam.map(patch => patch.value('--foam-scale'))).size > 4, 'patches form independently');
  const oldFlow = h.water.value('--water-flow');
  h.at(.412);
  assert.ok(h.water.value('--water-flow') > oldFlow);
  h.foam.forEach((patch, index) => {
    assert.notDeepEqual([...patch.properties], snapshot[index], 'small scrolls advance each foam patch');
    assert.ok(patch.value('--foam-alpha') >= .5 && patch.value('--foam-alpha') <= 1, 'foam remains visible between surges');
    assert.ok(patch.value('--foam-scale') >= .72 && patch.value('--foam-scale') <= 1.18);
  });
  h.at(.41);
  assert.deepEqual(h.foam.map(patch => [...patch.properties]), snapshot, 'reverse scroll returns foam to the same state');
});

test('reduced motion centers the new animal and restores a fully visible still waterfall', () => {
  const h = harness();
  h.at(.75);
  assert.equal(h.root.classes.has('scenery-ready'), true);
  h.media.matches = true;
  h.media.dispatch('change');
  h.flush();
  assert.equal(h.root.classes.has('scenery-ready'), false);
  for (const property of ['--crossing-x', '--crossing-y', '--crossing-tilt']) assert.equal(h.traveler.value(property), 0);
  assert.equal(h.scene.value('--scene-shift'), 0);
  assert.equal(h.animal.value('--reveal'), 1);
  assert.equal(h.layer.value('--depth-y'), 0);
  assert.equal(h.water.value('--water-flow'), 0);
  assert.equal(h.background.value('--background-y'), 0);
  h.foam.forEach(patch => {
    assert.equal(patch.value('--foam-x'), 0);
    assert.equal(patch.value('--foam-y'), 0);
    assert.equal(patch.value('--foam-scale'), 1);
    assert.equal(patch.value('--foam-alpha'), 1);
  });
  h.at(.9);
  assert.equal(h.traveler.value('--crossing-x'), 0, 'scrolling cannot animate reduced-motion artwork');
  h.media.matches = false;
  h.media.dispatch('change');
  h.flush();
  assert.ok(h.traveler.value('--crossing-x') > 0, 'restoring motion resumes from the actual scroll position');
});

test('an initially reduced-motion page shows the animal without waiting for interaction', () => {
  const h = harness({ reduced: true });
  h.flush();
  assert.equal(h.traveler.value('--crossing-x'), 0);
  assert.equal(h.root.classes.has('scenery-ready'), false);
  assert.equal(h.frames.size, 0);
});

test('hidden pages and page exits cancel pending work, and returning resumes with one frame', () => {
  const h = harness();
  h.document.hidden = true;
  h.document.dispatch('visibilitychange');
  assert.equal(h.frames.size, 0);
  h.window.dispatch('scroll');
  assert.equal(h.frames.size, 0);
  h.document.hidden = false;
  h.document.dispatch('visibilitychange');
  assert.equal(h.frames.size, 1);
  h.window.dispatch('pagehide');
  assert.equal(h.frames.size, 0);
  h.window.dispatch('pageshow');
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.equal(h.frames.size, 0);
});

console.log(`Verified ${passed} scroll regressions using the actual scenery controller and page foam metadata.`);
