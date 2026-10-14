import { recognizeSpiral } from './spiral-recognition.js';

/*
 * DRAWING STORYBOARD
 * Pointer / keyboard starts   clear the previous attempt and follow the new line
 * Stroke ends                 recognize its turns and growth
 * Complete                    green paper glow + 14 falling leaves
 * Incomplete                  red paper glow + a gentle hint
 * 3000ms after success        remove falling leaves; keep the green connection
 */
const TIMING = { leafCleanup: 3000, leafStagger: 30, leafFall: 1950 };
const DRAWING = { center: 180, edge: 8, size: 360, minSample: 2, maxPoints: 3000, keyStep: 10, fineStep: 6 };
const LEAVES = {
  count: 14,
  reducedCount: 6,
  colors: ['#80976b', '#a4b681', '#cfb966', '#64805c'],
  positions: [9, 74, 34, 91, 52, 20, 64, 43, 83, 27, 57, 13, 70, 39],
};
const HINTS = {
  short: 'Keep going around the center in one continuous line.',
  size: 'Give your spiral a little more room to grow.',
  turns: 'Curl around the center about twice, growing outward.',
  shape: 'Follow a gentle curl around the center, growing outward.',
};

const surface = document.querySelector('#spiral-drawing');
const paper = surface?.closest('.spiral-paper');
const ink = document.querySelector('#spiral-ink');
const cursor = document.querySelector('#spiral-cursor');
const status = document.querySelector('#spiral-status');
const resetButton = document.querySelector('#spiral-reset');
const leafLayer = document.querySelector('#spiral-leaves');

if (surface && paper && ink && cursor && status && resetButton && leafLayer) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const svgNamespace = 'http://www.w3.org/2000/svg';
  let gesture = null;
  let points = [];
  let renderFrame = 0;
  let leafTimer = 0;
  let cursorPoint = { x: DRAWING.center, y: DRAWING.center };

  function setState(state, message) {
    paper.dataset.state = state;
    status.textContent = message;
  }

  function clearLeaves() {
    clearTimeout(leafTimer);
    leafTimer = 0;
    leafLayer.replaceChildren();
    leafLayer.classList.remove('is-static');
  }

  function createLeaf(index, stationary) {
    const leaf = document.createElementNS(svgNamespace, 'svg');
    leaf.classList.add('forest-leaf');
    leaf.setAttribute('viewBox', '0 0 38 52');
    leaf.setAttribute('width', '32');
    leaf.setAttribute('height', '44');
    leaf.setAttribute('aria-hidden', 'true');
    leaf.setAttribute('focusable', 'false');
    leaf.style.setProperty('--leaf-x', `${stationary ? 28 + index * 8 : LEAVES.positions[index]}%`);
    leaf.style.setProperty('--leaf-static-y', `${22 + (index % 3) * 18}%`);
    leaf.style.setProperty('--leaf-sway', `${(index % 2 ? 1 : -1) * (24 + index * 3)}px`);
    leaf.style.setProperty('--leaf-delay', `${index * TIMING.leafStagger}ms`);
    leaf.style.setProperty('--leaf-duration', `${TIMING.leafFall + (index % 4) * 90}ms`);
    leaf.style.setProperty('--leaf-turn', `${(index % 2 ? 1 : -1) * (80 + index * 17)}deg`);
    const shape = document.createElementNS(svgNamespace, 'path');
    shape.setAttribute('d', 'M18 47C4 38 3 27 9 17L30 4 32 25C31 37 26 42 18 47Z');
    shape.setAttribute('fill', LEAVES.colors[index % LEAVES.colors.length]);
    shape.setAttribute('stroke', '#756846');
    shape.setAttribute('stroke-width', '1.5');
    const vein = document.createElementNS(svgNamespace, 'path');
    vein.setAttribute('d', 'M16 50 28 10M20 36 11 30M23 27 29 24M25 20 18 18');
    vein.setAttribute('fill', 'none');
    vein.setAttribute('stroke', '#e1d2a0');
    vein.setAttribute('stroke-width', '1.5');
    leaf.append(shape, vein);
    return leaf;
  }

  function celebrate() {
    clearLeaves();
    const stationary = reducedMotion.matches;
    leafLayer.classList.toggle('is-static', stationary);
    const count = stationary ? LEAVES.reducedCount : LEAVES.count;
    const leaves = Array.from({ length: count }, (_, index) => createLeaf(index, stationary));
    leafLayer.append(...leaves);
    if (!stationary) leafTimer = setTimeout(clearLeaves, TIMING.leafCleanup);
  }

  function renderInk() {
    renderFrame = 0;
    ink.setAttribute('d', points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' '));
  }

  function queueInk() {
    if (!renderFrame) renderFrame = requestAnimationFrame(renderInk);
  }

  function flushInk() {
    if (renderFrame) cancelAnimationFrame(renderFrame);
    renderInk();
  }

  function showCursor(show) {
    cursor.setAttribute('visibility', show ? 'visible' : 'hidden');
    cursor.setAttribute('cx', String(cursorPoint.x));
    cursor.setAttribute('cy', String(cursorPoint.y));
  }

  function appendPoint(point, force = false) {
    if (!point || points.length >= DRAWING.maxPoints) return;
    const previous = points.at(-1);
    const distance = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : Infinity;
    if (distance < (force ? 0.25 : DRAWING.minSample)) return;
    points.push(point);
    queueInk();
  }

  function eventPoint(event) {
    const matrix = surface.getScreenCTM();
    if (!matrix) return null;
    try {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      return { x: Math.max(0, Math.min(DRAWING.size, point.x)), y: Math.max(0, Math.min(DRAWING.size, point.y)) };
    } catch {
      return null;
    }
  }

  function releasePointer(previousGesture) {
    if (previousGesture?.kind === 'pointer' && surface.hasPointerCapture(previousGesture.id)) {
      surface.releasePointerCapture(previousGesture.id);
    }
  }

  function beginGesture(nextGesture, firstPoint) {
    clearLeaves();
    points = [];
    gesture = nextGesture;
    ink.removeAttribute('d');
    setState('drawing', nextGesture.kind === 'keyboard'
      ? 'Drawing. Use the arrow keys; press Space or Enter to finish.'
      : 'Keep your line flowing around the center.');
    appendPoint(firstPoint);
    showCursor(nextGesture.kind === 'keyboard');
  }

  function cancelGesture(message) {
    const previousGesture = gesture;
    gesture = null;
    releasePointer(previousGesture);
    flushInk();
    showCursor(false);
    clearLeaves();
    setState('incomplete', `Connection incomplete. ${message}`);
  }

  function finishGesture() {
    const previousGesture = gesture;
    if (!previousGesture) return;
    gesture = null;
    releasePointer(previousGesture);
    flushInk();
    showCursor(false);
    const result = recognizeSpiral(points);
    if (result.success) {
      setState('success', 'Connection restored. The forest answers.');
      celebrate();
    } else {
      const hint = HINTS[result.reason] || HINTS.shape;
      setState('incomplete', `Connection incomplete. ${hint}`);
    }
  }

  function resetDrawing(focusSurface = false) {
    const previousGesture = gesture;
    gesture = null;
    releasePointer(previousGesture);
    points = [];
    flushInk();
    clearLeaves();
    cursorPoint = { x: DRAWING.center, y: DRAWING.center };
    showCursor(false);
    setState('ready', 'Draw a spiral to invite the forest to answer.');
    if (focusSurface) {
      surface.focus({ preventScroll: true });
      const bounds = surface.getBoundingClientRect();
      if (bounds.top < 24 || bounds.bottom > window.innerHeight - 24) {
        surface.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
    }
  }

  surface.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || gesture) return;
    const point = eventPoint(event);
    if (!point) return;
    event.preventDefault();
    surface.focus({ preventScroll: true });
    beginGesture({ kind: 'pointer', id: event.pointerId }, point);
    try {
      surface.setPointerCapture(event.pointerId);
    } catch {
      cancelGesture('Your line was interrupted. Try again in one continuous stroke.');
    }
  });

  surface.addEventListener('pointermove', event => {
    if (gesture?.kind !== 'pointer' || event.pointerId !== gesture.id) return;
    event.preventDefault();
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) appendPoint(eventPoint(sample));
  });

  surface.addEventListener('pointerup', event => {
    if (gesture?.kind !== 'pointer' || event.pointerId !== gesture.id) return;
    event.preventDefault();
    appendPoint(eventPoint(event), true);
    finishGesture();
  });

  for (const eventName of ['pointercancel', 'lostpointercapture']) {
    surface.addEventListener(eventName, event => {
      if (gesture?.kind === 'pointer' && event.pointerId === gesture.id) {
        cancelGesture('Your line was interrupted. Try again in one continuous stroke.');
      }
    });
  }

  surface.addEventListener('keydown', event => {
    const startOrFinish = event.key === ' ' || event.key === 'Enter';
    const arrow = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(event.key);
    if (!startOrFinish && !arrow && event.key !== 'Escape') return;
    event.preventDefault();
    if (event.key === 'Escape') {
      resetDrawing();
      return;
    }
    if (gesture?.kind === 'pointer') return;
    if (startOrFinish) {
      if (event.repeat) return;
      if (gesture?.kind === 'keyboard') finishGesture();
      else {
        cursorPoint = { x: DRAWING.center, y: DRAWING.center };
        beginGesture({ kind: 'keyboard' }, { ...cursorPoint });
      }
      return;
    }
    if (gesture?.kind !== 'keyboard') {
      status.textContent = 'Press Space or Enter to start. Then draw with the arrow keys.';
      return;
    }
    const step = event.shiftKey ? DRAWING.fineStep : DRAWING.keyStep;
    const movement = {
      ArrowUp: { x: 0, y: -step }, ArrowRight: { x: step, y: 0 },
      ArrowDown: { x: 0, y: step }, ArrowLeft: { x: -step, y: 0 },
    }[event.key];
    cursorPoint = {
      x: Math.max(DRAWING.edge, Math.min(DRAWING.size - DRAWING.edge, cursorPoint.x + movement.x)),
      y: Math.max(DRAWING.edge, Math.min(DRAWING.size - DRAWING.edge, cursorPoint.y + movement.y)),
    };
    appendPoint({ ...cursorPoint });
    showCursor(true);
  });

  surface.addEventListener('blur', () => {
    if (gesture?.kind === 'keyboard') cancelGesture('Your line was paused. Start a new spiral when you are ready.');
  });
  resetButton.addEventListener('click', () => resetDrawing(true));
  reducedMotion.addEventListener('change', () => {
    if (paper.dataset.state === 'success') celebrate();
    else clearLeaves();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gesture) cancelGesture('Your line was paused. Try again when you return.');
  });
  window.addEventListener('pagehide', () => {
    if (gesture) cancelGesture('Try again when you return.');
    clearLeaves();
  });
  resetDrawing();
}
