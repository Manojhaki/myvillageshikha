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
const crossingStyles = await readFile(new URL('forest-crossing.css', siteRoot), 'utf8');
const foamTags = [...markup.matchAll(/<div\b[^>]*\bdata-waterfall-foam\b[^>]*>/g)].map(match => match[0]);
const cubTags = [...markup.matchAll(/<[a-z][^>]*\bdata-fox-cub\b[^>]*>/g)].map(match => match[0]);
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const gaitProperties = ['--gait-a-angle', '--gait-b-angle', '--gait-a-lift', '--gait-b-lift'];
const owlProperties = ['--owl-left-angle', '--owl-right-angle', '--owl-wing-scale'];

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
  const owl = new Element('owl puppet');
  const cubs = cubTags.map((tag, index) => new Element(`fox cub ${index + 1}`, { peekOffset: attribute(tag, 'data-peek-offset') }));
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
    '[data-peek-animal]': [animal, owl, ...cubs],
    '[data-owl-puppet]': [owl],
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
  return { root, document, window, media, scene, stage, traveler, animal, owl, cubs, layer, water, foam, background, frames, flush, at };
}

let passed = 0;
function test(name, check) { check(); passed++; console.log(`PASS ${name}`); }

function gaitSnapshot(h) {
  return gaitProperties.map(property => h.traveler.value(property));
}

function owlSnapshot(h) {
  return owlProperties.map(property => h.owl.value(property));
}

// Select a traveled distance using the controller's actual rendered position.
// This lets responsive checks exercise its easing without reimplementing it.
function atTravelDistance(h, distance) {
  h.at(0);
  const start = h.traveler.value('--crossing-x');
  let low = 0;
  let high = 1;
  for (let index = 0; index < 32; index++) {
    const progress = (low + high) / 2;
    h.at(progress);
    if (h.traveler.value('--crossing-x') - start < distance) low = progress;
    else high = progress;
  }
  h.at((low + high) / 2);
  assert.ok(Math.abs(h.traveler.value('--crossing-x') - start - distance) < .002, 'the controller reached the requested measured distance');
  return gaitSnapshot(h);
}

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

test('the owl wings flap in opposite directions with reversible scroll and rest when idle', () => {
  assert.ok(/<svg\b[^>]*\bdata-owl-puppet\b/.test(markup), 'the visible owl uses the scroll-controlled cardboard wing rig');
  const h = harness();
  const positions = [.31, .36, .43, .48, .55, .6, .72, .8];
  const snapshots = positions.map(progress => {
    h.at(progress);
    const values = owlSnapshot(h);
    assert.ok(Math.abs(values[0] + values[1]) < .002, 'left and right paper shoulders flap together in mirrored directions');
    assert.ok(Math.abs(values[0]) <= 24.001, 'the wingbeat stays within a gentle cardboard shoulder range');
    assert.ok(values[2] >= .84 && values[2] <= 1, 'wing foreshortening remains subtle and bounded');
    return values;
  });
  assert.ok(snapshots.some(values => values[0] < -10) && snapshots.some(values => values[0] > 10), 'scrolling produces both halves of a full wingbeat');
  assert.ok(new Set(snapshots.map(values => values.join(','))).size > 5, 'the wing joints change through the owl parallax passage');
  [...positions.keys()].reverse().forEach(index => {
    h.at(positions[index]);
    assert.deepEqual(owlSnapshot(h), snapshots[index], 'reverse scrolling restores the same exact wing pose');
  });
  const frozen = [...h.owl.properties];
  const writes = h.owl.writes;
  h.window.dispatch('scroll');
  h.flush();
  assert.deepEqual([...h.owl.properties], frozen, 'the owl holds its wing pose while the page is still');
  assert.equal(h.owl.writes, writes, 'idle scroll frames do not write a new wing pose');
  assert.equal(h.frames.size, 0, 'flapping never starts a clock-driven animation loop');
});

test('owl wingbeats soften behind the cover and return to a neutral hidden pose', () => {
  const h = harness();
  h.at(.174375);
  const emerging = Math.abs(h.owl.value('--owl-left-angle'));
  h.at(.351875);
  assert.ok(Math.abs(h.owl.value('--owl-left-angle')) > 20, 'a fully emerged owl has a visible wingbeat');
  assert.ok(emerging < 6, 'the same wingbeat is softened while most of the owl is hidden');
  for (const progress of [0, .1, .13, .84, .9, 1]) {
    h.at(progress);
    assert.deepEqual(owlSnapshot(h), [0, 0, 1], `the hidden owl rests at scene progress ${progress}`);
  }
});

test('two fox cubs follow the parent reveal with a short reversible stagger', () => {
  assert.equal(cubTags.length, 2, 'the page includes two baby fox cutouts');
  const offsets = cubTags.map(tag => Number(attribute(tag, 'data-peek-offset')));
  assert.ok(offsets[0] > 0 && offsets[1] > offsets[0] && offsets[1] <= .1, 'cub offsets are short, ordered and keep the family together');
  cubTags.forEach(tag => assert.match(tag, /\bdata-peek-animal\b/, 'each baby fox participates in the same scroll scene'));
  const h = harness();
  h.at(.26);
  const emerging = [h.animal, ...h.cubs].map(animal => animal.value('--reveal'));
  assert.ok(emerging[0] > emerging[1] && emerging[1] > emerging[2], 'the parent pops up before each cub');
  h.at(.5);
  assert.deepEqual([h.animal, ...h.cubs].map(animal => animal.value('--reveal')), [1, 1, 1], 'all three foxes share a fully visible central pose');
  h.at(.78);
  const retreating = [h.animal, ...h.cubs].map(animal => animal.value('--reveal'));
  assert.ok(retreating[0] < retreating[1] && retreating[1] < retreating[2], 'the cubs tuck behind their cover just after the parent');
  for (const progress of [0, 1]) {
    h.at(progress);
    assert.deepEqual([h.animal, ...h.cubs].map(animal => animal.value('--reveal')), [0, 0, 0], 'every fox is covered at the scene endpoints');
  }
  h.at(.78);
  assert.deepEqual([h.animal, ...h.cubs].map(animal => animal.value('--reveal')), retreating, 'reverse scrolling restores the same staggered family pose');
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

test('four separately clipped cardboard legs surround the body in a believable depth order', () => {
  const legGroups = [...markup.matchAll(/<g\b[^>]*class="([^"]*\bcrossing-leg\b[^"]*)"[^>]*>([\s\S]*?)<\/g>/g)];
  assert.equal(legGroups.length, 4, 'the panda has four separately moving leg groups');
  const clipIds = new Set([...markup.matchAll(/<clipPath\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]));
  const legNames = ['far-hind', 'far-fore', 'near-hind', 'near-fore'];
  const body = markup.match(/<image\b[^>]*class="crossing-body"[^>]*>/);
  assert.ok(body, 'the body is its own cardboard artwork layer');
  assert.match(body[0], /href="\.\/assets\/[^"/]*body[^"/]*\.png"/, 'the body references the dedicated leg-free artwork');
  const bodyFile = attribute(body[0], 'href');
  assert.ok(existsSync(new URL(bodyFile, siteRoot)), 'the body artwork ships with the site');
  for (const name of legNames) {
    const group = legGroups.find(match => match[1].split(/\s+/).includes(`crossing-leg-${name}`));
    assert.ok(group, `the ${name} leg is present`);
    const clip = group[2].match(/clip-path="url\(#([^)]*)\)"/)?.[1];
    assert.ok(clipIds.has(clip), `the ${name} leg uses a defined cardboard clipping path`);
    assert.match(group[2], /<use\b[^>]*href="#[^"]+"/, `the ${name} leg reuses the original textured artwork`);
    assert.ok(name.startsWith('far-') ? group.index < body.index : group.index > body.index, `the ${name} leg is on the correct side of the body`);
  }
});

test('leg styles connect each diagonal pair to its own gait and default to a still pose', () => {
  const rules = [...crossingStyles.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const ruleFor = selector => rules.find(match => match[1].trim().split(/\s*,\s*/).includes(selector))?.[2];
  for (const [pair, names] of [['a', ['far-hind', 'near-fore']], ['b', ['far-fore', 'near-hind']]]) {
    for (const name of names) {
      const rule = ruleFor(`.crossing-leg-${name}`);
      assert.ok(rule, `the ${name} leg has a gait binding`);
      assert.ok(rule.includes(`var(--gait-${pair}-angle, 0deg)`), `the ${name} leg swings with the correct diagonal and defaults to zero`);
      assert.ok(rule.includes(`var(--gait-${pair}-lift, 0px)`), `the ${name} leg lifts with the correct diagonal and defaults to zero`);
    }
  }
  const transform = ruleFor('.crossing-leg');
  assert.ok(transform.includes('var(--leg-lift, 0px)') && transform.includes('var(--leg-angle, 0deg)'), 'without a script, every paper joint rests in its original pose');
  assert.match(crossingStyles, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.crossing-leg\s*\{\s*transform:\s*none\s*!important;/, 'the stylesheet independently disables leg motion for reduced motion');
});

test('the diagonal leg pairs oppose one another, change while traveling and reverse exactly with scroll', () => {
  const h = harness();
  const positions = [.18, .22, .31, .45, .58, .71, .82];
  const snapshots = positions.map(progress => {
    h.at(progress);
    const values = gaitSnapshot(h);
    assert.ok(Math.abs(values[0] + values[1]) < .002, 'diagonal leg pairs swing in opposite directions');
    assert.ok(Math.abs(values[0]) <= 14.001 && Math.abs(values[1]) <= 14.001, 'paper joints keep a gentle bounded swing');
    assert.ok(values[2] <= 0 && values[3] <= 0, 'feet lift above the path');
    assert.ok(values[2] >= -18.001 && values[3] >= -18.001, 'paper feet keep a bounded lift');
    assert.ok(Math.max(values[2], values[3]) > -.002, 'the supporting diagonal remains planted');
    return values;
  });
  assert.ok(new Set(snapshots.map(values => values.join(','))).size > 4, 'sideways travel produces distinct walking poses');
  [...positions.keys()].reverse().forEach(index => {
    h.at(positions[index]);
    assert.deepEqual(gaitSnapshot(h), snapshots[index], 'reverse scrolling restores the same exact leg pose');
  });
  const frozen = [...h.traveler.properties];
  const writes = h.traveler.writes;
  h.window.dispatch('scroll');
  h.flush();
  assert.deepEqual([...h.traveler.properties], frozen, 'idle scrolling leaves the walking pose frozen');
  assert.equal(h.traveler.writes, writes, 'idle frames do not write another gait pose');
  assert.equal(h.frames.size, 0, 'walking never starts a clock-driven animation loop');
});

test('walking cadence follows traveled animal widths on both phone and desktop', () => {
  const snapshots = [];
  for (const [width, stageWidth, travelerWidth] of [[390, 358, 178], [1440, 1240, 270]]) {
    const h = harness({ width, stageWidth, travelerWidth });
    const stride = travelerWidth * .55;
    const quarter = atTravelDistance(h, stride * .25);
    const opposite = atTravelDistance(h, stride * .75);
    const repeat = atTravelDistance(h, stride * 1.25);
    assert.ok(Math.abs(quarter[0]) > 13.9, 'a quarter stride reaches a visible leg swing');
    assert.ok(quarter[0] * opposite[0] < 0, 'opposite halves of a step switch the advancing diagonal');
    quarter.forEach((value, index) => assert.ok(Math.abs(value - repeat[index]) < .01, 'one rendered stride returns to the same walking pose'));
    snapshots.push(quarter);
  }
  snapshots[0].forEach((value, index) => assert.ok(Math.abs(value - snapshots[1][index]) < .01, 'phone and desktop walking cover the same fraction of a character width per step'));
});

test('crossing endpoints leave every paper leg in a neutral resting pose', () => {
  const h = harness();
  for (const progress of [0, .1, .14, .86, .95, 1]) {
    h.at(progress);
    assert.deepEqual(gaitSnapshot(h), [0, 0, 0, 0], `legs rest outside the moving crossing at ${progress}`);
  }
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
  assert.deepEqual(gaitSnapshot(h), [0, 0, 0, 0], 'reduced motion resets every moving paper leg');
  assert.equal(h.scene.value('--scene-shift'), 0);
  assert.equal(h.animal.value('--reveal'), 1);
  h.cubs.forEach(cub => assert.equal(cub.value('--reveal'), 1, 'reduced motion leaves every cub visible'));
  assert.deepEqual(owlSnapshot(h), [0, 0, 1], 'reduced motion resets both paper wings');
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
  assert.deepEqual(gaitSnapshot(h), [0, 0, 0, 0], 'reduced motion keeps paper legs still on later scrolls');
  assert.deepEqual(owlSnapshot(h), [0, 0, 1], 'reduced motion keeps owl wings still on later scrolls');
  h.media.matches = false;
  h.media.dispatch('change');
  h.flush();
  assert.ok(h.traveler.value('--crossing-x') > 0, 'restoring motion resumes from the actual scroll position');
});

test('an initially reduced-motion page shows the animal without waiting for interaction', () => {
  const h = harness({ reduced: true });
  h.flush();
  assert.equal(h.traveler.value('--crossing-x'), 0);
  assert.deepEqual(gaitSnapshot(h), [0, 0, 0, 0]);
  assert.deepEqual(owlSnapshot(h), [0, 0, 1]);
  h.cubs.forEach(cub => assert.equal(cub.value('--reveal'), 1));
  assert.equal(h.root.classes.has('scenery-ready'), false);
  assert.equal(h.frames.size, 0);
});

test('a failed scene measurement restores neutral cardboard legs instead of stranding a walking pose', () => {
  const h = harness();
  h.at(.45);
  assert.ok(gaitSnapshot(h).some(value => value !== 0), 'the test starts from a walking pose');
  h.scene.getBoundingClientRect = () => { throw new Error('layout unavailable'); };
  h.window.dispatch('resize');
  h.flush();
  assert.deepEqual(gaitSnapshot(h), [0, 0, 0, 0], 'the error fallback resets all paper joints');
  assert.equal(h.traveler.value('--crossing-x'), 0, 'the still panda returns to the center');
  assert.deepEqual(owlSnapshot(h), [0, 0, 1], 'the error fallback resets the owl wing joints');
  h.cubs.forEach(cub => assert.equal(cub.value('--reveal'), 1, 'the error fallback leaves each fox cub visible'));
  assert.equal(h.root.classes.has('scenery-ready'), false);
  h.window.dispatch('scroll');
  assert.equal(h.frames.size, 0, 'a failed measurement never causes a retry loop');
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
