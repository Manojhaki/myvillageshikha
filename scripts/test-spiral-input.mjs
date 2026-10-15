import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { recognizeSpiral } from '../docs/spiral-recognition.js';

// Run the real input controller against a small DOM, without browser packages.
// This checks gesture ownership and cancellation; physical phone behavior still
// needs a browser/device check because a VM cannot reproduce native scrolling.
const source = (await readFile(new URL('../docs/spiral-drawing.js', import.meta.url), 'utf8'))
  .replace(/^import\s+\{\s*recognizeSpiral\s*\}\s+from\s+['"].*?['"];?\s*/m, '');
const styles = await readFile(new URL('../docs/spiral-drawing.css', import.meta.url), 'utf8');
const markup = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8');

class Element {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.children = [];
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name),
    };
    this.style = { setProperty() {} };
    this.focusCalls = 0;
    this.captured = new Set();
  }
  addEventListener(type, callback, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ callback, options });
    this.listeners.set(type, listeners);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  focus() { this.focusCalls++; }
  scrollIntoView() {}
  getBoundingClientRect() { return { top: 100, bottom: 460 }; }
  setPointerCapture(id) {
    if (this.captureFails) throw new Error('Pointer capture is unavailable');
    this.captured.add(id);
  }
  hasPointerCapture(id) {
    if (this.captureQueryFails) throw new Error('Pointer capture query failed');
    return this.captured.has(id);
  }
  releasePointerCapture(id) {
    if (this.captureReleaseFails) throw new Error('Pointer capture release failed');
    this.captured.delete(id);
  }
}

function harness({ touch = true, reducedMotion = false, captureFails = false } = {}) {
  const window = new Element('window');
  window.innerHeight = 844;
  if (touch) window.ontouchstart = null;
  const document = new Element('document', window);
  document.hidden = false;
  const paper = new Element('paper', document);
  paper.captureFails = captureFails;
  const surface = new Element('surface', paper);
  surface.closest = selector => selector === '.spiral-paper' ? paper : null;
  surface.getScreenCTM = () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) });
  const elements = { paper, surface };
  for (const name of ['ink', 'cursor', 'status', 'reset', 'leaves']) elements[name] = new Element(name, paper);
  const selectors = {
    '#spiral-drawing': surface, '#spiral-ink': elements.ink,
    '#spiral-cursor': elements.cursor, '#spiral-status': elements.status,
    '#spiral-reset': elements.reset, '#spiral-leaves': elements.leaves,
  };
  document.querySelector = selector => selectors[selector] || null;
  document.createElementNS = (_namespace, tag) => new Element(tag);
  const media = new Element('media');
  media.matches = reducedMotion;
  let nextId = 0;
  const frames = new Map();
  const timers = new Map();
  class DOMPoint {
    constructor(x, y) { this.x = x; this.y = y; }
    matrixTransform(matrix) {
      return { x: matrix.a * this.x + matrix.c * this.y + matrix.e,
        y: matrix.b * this.x + matrix.d * this.y + matrix.f };
    }
  }
  vm.runInNewContext(source, {
    document, window, DOMPoint, recognizeSpiral,
    matchMedia: () => media,
    requestAnimationFrame: callback => { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: callback => { const id = ++nextId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
  }, { filename: 'spiral-drawing.js' });

  function dispatch(target, type, properties = {}) {
    let passive = false;
    const event = {
      type, target, cancelable: true, defaultPrevented: false,
      isPrimary: true, button: 0, pointerType: 'mouse', pointerId: 1,
      ...properties,
      preventDefault() { if (this.cancelable && !passive) this.defaultPrevented = true; },
    };
    for (let current = target; current; current = current.parent) {
      event.currentTarget = current;
      for (const listener of current.listeners.get(type) || []) {
        passive = listener.options?.passive === true;
        listener.callback(event);
      }
    }
    return event;
  }
  function flushFrames() {
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(); }
  }
  return { ...elements, window, document, media, dispatch, flushFrames, timers };
}

const spiral = Array.from({ length: 181 }, (_, index) => {
  const fraction = index / 180;
  const radius = 8 + 134 * fraction;
  return { x: 180 + radius * Math.cos(4 * Math.PI * fraction), y: 180 + radius * Math.sin(4 * Math.PI * fraction) };
});
const finger = (point, identifier = 42) => ({ identifier, clientX: point.x, clientY: point.y });
const touchEvent = (point, identifier = 42) => ({ changedTouches: [finger(point, identifier)], touches: [finger(point, identifier)] });
const pointerEvent = (point, properties = {}) => ({ clientX: point.x, clientY: point.y, ...properties });

function drawTouch(h, points = spiral, identifier = 42) {
  assert.equal(h.dispatch(h.paper, 'touchstart', touchEvent(points[0], identifier)).defaultPrevented, true);
  for (const point of points.slice(1)) {
    assert.equal(h.dispatch(h.paper, 'touchmove', touchEvent(point, identifier)).defaultPrevented, true);
  }
  assert.equal(h.dispatch(h.paper, 'touchend', { ...touchEvent(points.at(-1), identifier), touches: [] }).defaultPrevented, true);
}

function drawPointer(h, properties = {}) {
  h.dispatch(h.paper, 'pointerdown', pointerEvent(spiral[0], properties));
  assert.equal(h.paper.dataset.state, 'drawing');
  for (const point of spiral.slice(1)) h.dispatch(h.window, 'pointermove', pointerEvent(point, properties));
  h.dispatch(h.window, 'pointerup', pointerEvent(spiral.at(-1), properties));
}

let passed = 0;
function test(name, check) {
  check();
  passed++;
  console.log(`PASS ${name}`);
}

test('the entire paper declares native gesture ownership before input begins', () => {
  const paperRule = styles.match(/\.spiral-paper\s*\{([^}]+)\}/)?.[1];
  assert.match(paperRule || '', /(?:^|;)\s*touch-action\s*:\s*none\s*(?:;|$)/);
  assert.match(styles, /\.spiral-hit-area\s*\{[^}]*pointer-events\s*:\s*all\b/);
  assert.match(markup, /<rect\b[^>]*class="spiral-hit-area"[^>]*width="360"[^>]*height="360"/);
});

test('only the drawing pad owns nonpassive touch gestures', () => {
  const h = harness();
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    assert.ok(h.paper.listeners.get(type)?.length, `${type} is attached to the HTML pad`);
    for (const listener of h.paper.listeners.get(type)) assert.equal(listener.options.passive, false, `${type} can prevent native scrolling`);
    assert.equal(h.document.listeners.has(type), false, `document must not block ${type}`);
    assert.equal(h.window.listeners.has(type), false, `window must not block ${type}`);
    assert.equal(h.dispatch(h.document, type, touchEvent(spiral[0])).defaultPrevented, false);
  }
  assert.ok(h.paper.listeners.has('pointerdown'), 'paper padding accepts pointer input');
});

test('a complete touch spiral prevents scrolling and restores the forest', () => {
  const h = harness();
  drawTouch(h);
  assert.equal(h.paper.dataset.state, 'success');
  assert.match(h.status.textContent, /Connection restored/);
  assert.equal(h.leaves.children.length, 14);
  assert.ok(h.ink.getAttribute('d').split('L').length > 100, 'the real ink path follows touch input');
  assert.equal(h.surface.focusCalls, 0, 'touch drawing does not focus/scroll the SVG');
});

test('secondary fingers and compatibility pointer events cannot take over a touch stroke', () => {
  const h = harness();
  h.dispatch(h.paper, 'pointerdown', pointerEvent(spiral[0], { pointerType: 'touch' }));
  assert.equal(h.paper.dataset.state, 'ready', 'TouchEvents exclusively own touch input');
  h.dispatch(h.paper, 'touchstart', touchEvent(spiral[0]));
  h.flushFrames();
  const initialInk = h.ink.getAttribute('d');
  h.dispatch(h.paper, 'touchstart', { changedTouches: [finger({ x: 2, y: 2 }, 77)], touches: [finger(spiral[0]), finger({ x: 2, y: 2 }, 77)] });
  h.dispatch(h.paper, 'touchmove', { changedTouches: [finger({ x: 355, y: 355 }, 77)], touches: [finger(spiral[0]), finger({ x: 355, y: 355 }, 77)] });
  h.dispatch(h.paper, 'touchend', { changedTouches: [finger({ x: 355, y: 355 }, 77)], touches: [finger(spiral[0])] });
  h.flushFrames();
  assert.equal(h.paper.dataset.state, 'drawing');
  assert.equal(h.ink.getAttribute('d'), initialInk, 'only the tracked finger contributes ink');
  h.dispatch(h.surface, 'keydown', { key: 'Enter' });
  assert.equal(h.paper.dataset.state, 'drawing', 'keyboard cannot finish an active touch');
  for (const point of spiral.slice(1)) h.dispatch(h.paper, 'touchmove', touchEvent(point));
  h.dispatch(h.paper, 'touchend', { ...touchEvent(spiral.at(-1)), touches: [] });
  assert.equal(h.paper.dataset.state, 'success');
});

test('touch cancellation reports an incomplete stroke and allows a new attempt', () => {
  const h = harness();
  h.dispatch(h.paper, 'touchstart', touchEvent(spiral[0]));
  h.dispatch(h.paper, 'touchmove', touchEvent(spiral[1]));
  h.dispatch(h.paper, 'touchcancel', { changedTouches: [finger(spiral[1], 77)], touches: [finger(spiral[1])] });
  assert.equal(h.paper.dataset.state, 'drawing', 'unrelated finger cancellation does not cancel the stroke');
  h.dispatch(h.paper, 'touchcancel', { ...touchEvent(spiral[1]), touches: [] });
  assert.equal(h.paper.dataset.state, 'incomplete');
  assert.equal(h.leaves.children.length, 0);
  drawTouch(h);
  assert.equal(h.paper.dataset.state, 'success');
  h.dispatch(h.reset, 'click');
  assert.equal(h.paper.dataset.state, 'ready');
  assert.equal(h.ink.getAttribute('d'), '');
  assert.equal(h.leaves.children.length, 0);
});

test('window pointer tracking completes a stroke even when capture is unavailable', () => {
  const h = harness({ touch: false, captureFails: true });
  drawPointer(h);
  assert.equal(h.paper.dataset.state, 'success');
  assert.equal(h.leaves.children.length, 14);
  assert.equal(h.dispatch(h.window, 'pointermove', pointerEvent(spiral[0])).defaultPrevented, false, 'idle pointer moves retain normal page behavior');
});

test('pointer-only touch devices and pens remain drawable', () => {
  const touch = harness({ touch: false });
  drawPointer(touch, { pointerType: 'touch' });
  assert.equal(touch.paper.dataset.state, 'success');
  const pen = harness({ touch: true });
  drawPointer(pen, { pointerType: 'pen' });
  assert.equal(pen.paper.dataset.state, 'success');
});

test('unexpected pointer cancellation is incomplete and capture cleanup errors are harmless', () => {
  const h = harness({ touch: false });
  h.dispatch(h.paper, 'pointerdown', pointerEvent(spiral[0]));
  h.dispatch(h.window, 'pointercancel', pointerEvent(spiral[1]));
  assert.equal(h.paper.dataset.state, 'incomplete');
  for (const property of ['captureQueryFails', 'captureReleaseFails']) {
    const failedCleanup = harness({ touch: false });
    failedCleanup.paper[property] = true;
    drawPointer(failedCleanup);
    assert.equal(failedCleanup.paper.dataset.state, 'success');
  }
});

test('keyboard drawing still recognizes a spiral and respects reduced motion', () => {
  const h = harness({ reducedMotion: true });
  h.dispatch(h.surface, 'keydown', { key: 'Enter' });
  assert.equal(h.paper.dataset.state, 'drawing');
  assert.equal(h.cursor.getAttribute('visibility'), 'visible');
  let position = { x: 180, y: 180 };
  for (const point of spiral) {
    const target = { x: Math.round(point.x / 10) * 10, y: Math.round(point.y / 10) * 10 };
    for (const axis of ['x', 'y']) {
      while (position[axis] !== target[axis]) {
        const direction = Math.sign(target[axis] - position[axis]);
        const key = axis === 'x' ? direction > 0 ? 'ArrowRight' : 'ArrowLeft' : direction > 0 ? 'ArrowDown' : 'ArrowUp';
        assert.equal(h.dispatch(h.surface, 'keydown', { key }).defaultPrevented, true);
        position[axis] += direction * 10;
      }
    }
  }
  h.dispatch(h.surface, 'keydown', { key: ' ' });
  assert.equal(h.paper.dataset.state, 'success');
  assert.equal(h.leaves.children.length, 6);
  assert.equal(h.leaves.classes.has('is-static'), true);
  assert.equal(h.cursor.getAttribute('visibility'), 'hidden');
  assert.equal(h.dispatch(h.document, 'keydown', { key: 'ArrowDown' }).defaultPrevented, false, 'keyboard scrolling works outside the pad');
});

console.log(`Verified ${passed} spiral input regressions using the actual drawing controller and recognizer.`);
