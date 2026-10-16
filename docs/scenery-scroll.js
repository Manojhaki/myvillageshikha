/* ─────────────────────────────────────────────────────────
 * SCROLL STORYBOARD
 *
 * Progress runs from scene entering below to leaving above.
 *   0–13%   animal waits behind its cardboard cover
 *  13–34%   animal rises into view, reveal 0 → 1
 *  34–64%   animal rests while scenery shifts at different depths
 *  64–84%   animal tucks behind the cover, reveal 1 → 0
 * 84–100%   only the bushes and cardboard opening remain
 *
 * FOREST CROSSING
 *   0–14%   a red panda waits behind the left paper bushes
 *  14–86%   the cutout walks left → right across the forest path
 * 86–100%   the red panda disappears behind the right bushes
 *           each small paper step follows scroll, never a clock
 *
 * WATERFALL AND FOAM
 *   0–100%  paper water advances down the side-view fall on every scroll
 *   0–100%  staggered foam layers swell, separate and drift downstream
 *           through the whole scene; some foam always remains visible
 *
 * Scrolling backward reverses the same sequence. Reduced motion
 * and a script failure leave the decorative animals and foam visible.
 * ───────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const PHASE = {
    appearStart: 0.13, // First glimpse as the scenic band enters.
    appearEnd:   0.34, // Fully emerged before the band reaches the center.
    tuckStart:   0.64, // Begin retreating after the band passes the center.
    tuckEnd:     0.84  // Hidden before the band leaves the viewport.
  };

  const FOAM = {
    cycles:       3.25, // Repeated forming across the entire visible scroll span.
    minimumScale: 0.72, // Smaller foam between surges remains visible.
    maximumScale: 1.18, // A newly formed cluster briefly swells.
    minimumAlpha: 0.5,  // Fifteen staggered patches never all disappear.
    maximumAlpha: 1,    // Strongest paper highlight at the crest of a surge.
    surgeTravel:  0.12, // A small lateral wave on top of the parallax drift.
    minimumLift:  0.6  // Even near-impact patches lift slightly as they form.
  };

  const CROSSING = {
    start:       0.14, // Begin behind the left bushes as the scene enters.
    end:         0.86, // Reach the right bushes before the scene leaves.
    steps:       8,    // Small cutout steps across one complete crossing.
    bob:         { desktop: 5, mobile: 3 }, // Lift above the path, px.
    tilt:        1.4,  // Gentle paper rocking at each step, degrees.
    neutral:     0.5  // Centered, still fallback for reduced motion.
  };

  const MOTION = {
    mobileBreakpoint: 639, // Matches the site's phone layout.
    scene:      { desktop: 18, mobile: 10 }, // Overall cardboard drift, px.
    depth:      { desktop: 28, mobile: 16 }, // Maximum relative layer drift, px.
    background: { desktop: 40, mobile: 20 }, // Overscanned hero background, px.
    foam:       { desktop: 64, mobile: 36 }, // Downstream foam travel, px.
    foamLift:   { desktop: 7, mobile: 4 }, // Surface foam rises and settles, px.
    waterFlow:  { desktop: 240, mobile: 180 }, // Repeated paper bars move down, px.
    precision:  3 // Cache rounded values to avoid redundant style writes.
  };

  const root = document.documentElement;
  const scenes = Array.from(document.querySelectorAll('[data-peek-scene]'), element => ({
    element,
    animals: Array.from(element.querySelectorAll('[data-peek-animal]')),
    crossingStage: element.querySelector('.crossing-stage'),
    travelers: Array.from(element.querySelectorAll('[data-crossing-animal]')),
    foam: Array.from(element.querySelectorAll('[data-waterfall-foam]'), patch => ({
      element: patch,
      phase: numericFoamValue(patch.dataset.foamPhase, 0),
      depth: numericFoamValue(patch.dataset.foamDepth, 0.6)
    })),
    water: Array.from(element.querySelectorAll('[data-water-flow]')),
    layers: Array.from(element.querySelectorAll('[data-depth]'), layer => ({
      element: layer,
      depth: numericDepth(layer.dataset.depth, 0)
    }))
  }));
  const backgrounds = Array.from(document.querySelectorAll('[data-background-depth]'), element => ({
    element,
    anchor: element.closest('.hero') || element.parentElement || element,
    depth: numericDepth(element.dataset.backgroundDepth, 1)
  }));

  if (!scenes.length && !backgrounds.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const previousValues = new WeakMap();
  let frame = 0;
  let failed = false;

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function numericDepth(value, fallback) {
    if (value === undefined || value.trim() === '') return fallback;
    const depth = Number(value);
    return Number.isFinite(depth) ? clamp(depth, -1, 1) : fallback;
  }

  function numericFoamValue(value, fallback) {
    if (value === undefined || value.trim() === '') return fallback;
    const amount = Number(value);
    return Number.isFinite(amount) ? clamp(amount) : fallback;
  }

  function smoothStep(start, end, progress) {
    const amount = clamp((progress - start) / (end - start));
    return amount * amount * (3 - 2 * amount);
  }

  function revealAt(progress) {
    const emerging = smoothStep(PHASE.appearStart, PHASE.appearEnd, progress);
    const retreating = smoothStep(PHASE.tuckStart, PHASE.tuckEnd, progress);
    return emerging * (1 - retreating);
  }

  function foamAt(progress, phase, depth, travelDistance, liftDistance) {
    const angle = (progress * FOAM.cycles + phase) * Math.PI * 2;
    const wave = Math.sin(angle);
    const surge = (wave + 1) / 2;
    const direction = progress * 2 - 1;
    return {
      x: (direction + wave * FOAM.surgeTravel) * travelDistance * depth,
      y: Math.cos(angle) * liftDistance * (FOAM.minimumLift + (1 - FOAM.minimumLift) * depth),
      scale: FOAM.minimumScale + (FOAM.maximumScale - FOAM.minimumScale) * surge,
      alpha: FOAM.minimumAlpha + (FOAM.maximumAlpha - FOAM.minimumAlpha) * surge
    };
  }

  function progressAt(rect, viewportHeight) {
    return clamp((viewportHeight - rect.top) / (viewportHeight + rect.height));
  }

  function crossingAt(progress, stageWidth, animalWidth, size) {
    const amount = progress === null ? CROSSING.neutral : smoothStep(CROSSING.start, CROSSING.end, progress);
    const stride = amount * CROSSING.steps * Math.PI;
    const moving = progress !== null && amount > 0 && amount < 1;
    return {
      // Half a cutout beyond either stage edge keeps the entrances covered.
      x: (amount - CROSSING.neutral) * (stageWidth + animalWidth),
      y: moving ? -Math.abs(Math.sin(stride)) * CROSSING.bob[size] : 0,
      tilt: moving ? Math.sin(stride) * CROSSING.tilt : 0
    };
  }

  function write(element, property, value, unit = '') {
    const formatted = `${Number(value.toFixed(MOTION.precision))}${unit}`;
    let cache = previousValues.get(element);
    if (!cache) {
      cache = new Map();
      previousValues.set(element, cache);
    }
    if (cache.get(property) === formatted) return;
    element.style.setProperty(property, formatted);
    cache.set(property, formatted);
  }

  function writeScene(scene, reveal, shift, depthShift) {
    write(scene.element, '--reveal', reveal);
    write(scene.element, '--scene-shift', shift, 'px');
    scene.animals.forEach(animal => write(animal, '--reveal', reveal));
    scene.layers.forEach(layer => write(layer.element, '--depth-y', depthShift * layer.depth, 'px'));
  }

  function writeWaterfall(scene, progress, size) {
    scene.foam.forEach(patch => {
      const values = progress === null
        ? { x: 0, y: 0, scale: 1, alpha: 1 }
        : foamAt(progress, patch.phase, patch.depth, MOTION.foam[size], MOTION.foamLift[size]);
      write(patch.element, '--foam-x', values.x, 'px');
      write(patch.element, '--foam-y', values.y, 'px');
      write(patch.element, '--foam-scale', values.scale);
      write(patch.element, '--foam-alpha', values.alpha);
    });
    scene.water.forEach(water => write(water, '--water-flow', progress === null ? 0 : progress * MOTION.waterFlow[size], 'px'));
  }

  function writeCrossing(scene, progress, crossing, size) {
    scene.travelers.forEach((animal, index) => {
      const values = crossingAt(progress, crossing?.width || 0, crossing?.animalWidths[index] || 0, size);
      write(animal, '--crossing-x', values.x, 'px');
      write(animal, '--crossing-y', values.y, 'px');
      write(animal, '--crossing-tilt', values.tilt, 'deg');
    });
  }

  function restoreStaticScenery() {
    root.classList.remove('scenery-ready');
    scenes.forEach(scene => {
      writeScene(scene, 1, 0, 0);
      writeWaterfall(scene, null);
      writeCrossing(scene, null);
    });
    backgrounds.forEach(background => write(background.element, '--background-y', 0, 'px'));
  }

  function update() {
    frame = 0;
    if (failed || document.hidden) return;

    try {
      if (reducedMotion.matches) {
        restoreStaticScenery();
        return;
      }

      const viewportHeight = Math.max(1, window.innerHeight);
      const size = window.innerWidth <= MOTION.mobileBreakpoint ? 'mobile' : 'desktop';

      // Measure static scene anchors together before writing any transforms.
      const scenePositions = scenes.map(scene => ({
        scene,
        rect: scene.element.getBoundingClientRect(),
        crossing: scene.crossingStage ? {
          width: scene.crossingStage.clientWidth,
          animalWidths: scene.travelers.map(animal => animal.offsetWidth)
        } : null
      }));
      const backgroundPositions = backgrounds.map(background => ({ background, rect: background.anchor.getBoundingClientRect() }));

      scenePositions.forEach(({ scene, rect, crossing }) => {
        const progress = progressAt(rect, viewportHeight);
        const direction = progress * 2 - 1;
        writeScene(scene, revealAt(progress), direction * MOTION.scene[size], direction * MOTION.depth[size]);
        writeWaterfall(scene, progress, size);
        writeCrossing(scene, progress, crossing, size);
      });
      backgroundPositions.forEach(({ background, rect }) => {
        const direction = progressAt(rect, viewportHeight) * 2 - 1;
        write(background.element, '--background-y', direction * MOTION.background[size] * background.depth, 'px');
      });

      // Until all variables are valid, the stylesheet's static artwork is the fallback.
      root.classList.add('scenery-ready');
    } catch {
      failed = true;
      restoreStaticScenery();
    }
  }

  function requestUpdate() {
    if (!frame && !failed && !document.hidden) frame = window.requestAnimationFrame(update);
  }

  function cancelPendingFrame() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
  window.addEventListener('pageshow', requestUpdate, { passive: true });
  window.addEventListener('pagehide', cancelPendingFrame);
  document.addEventListener('load', requestUpdate, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelPendingFrame();
    else requestUpdate();
  });
  if (typeof reducedMotion.addEventListener === 'function') reducedMotion.addEventListener('change', requestUpdate);
  else reducedMotion.addListener(requestUpdate);

  requestUpdate();
})();
