/* Reveal the village only after its artwork, type and deferred scripts are ready. */
(() => {
  'use strict';

  const root = document.documentElement;
  const loader = document.getElementById('site-loader');
  if (!root.classList.contains('site-loading')) return;
  if (!loader) {
    root.classList.remove('site-loading', 'site-revealing');
    return;
  }

  const status = document.getElementById('site-loader-status');
  const progress = document.getElementById('site-loader-progress');
  const actions = document.getElementById('site-loader-actions');
  const retryButton = document.getElementById('site-loader-retry');
  const continueButton = document.getElementById('site-loader-continue');
  const main = document.querySelector('main');
  const originalBusy = main?.getAttribute('aria-busy');
  const inertElements = new Map();
  const cleanups = new Set();
  const resources = new Map();
  const imagePromises = new Map();
  const preloadedImages = new Map();
  const nativeImages = new WeakMap();
  const stylesheets = [];
  let nativeImageId = 0;
  let attempt = 0;
  let finished = false;
  let stalled = false;
  let discoveryComplete = false;
  let stallTimer;
  let revealTimer;
  let observer;

  function protect(element) {
    if (element === loader || inertElements.has(element)) return;
    inertElements.set(element, element.getAttribute('inert'));
    element.setAttribute('inert', '');
  }

  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    const remove = () => target.removeEventListener(name, handler, options);
    cleanups.add(remove);
    return () => { remove(); cleanups.delete(remove); };
  }

  function absoluteImageUrl(value, base = document.baseURI) {
    if (!value || value.trim().startsWith('#') || /^(?:data|blob):/i.test(value.trim())) return null;
    try {
      const url = new URL(value, base);
      if (!/^https?:$/.test(url.protocol)) return null;
      // SVG paint-server references are not external artwork.
      if (url.hash && url.origin === location.origin && url.pathname === location.pathname && !url.search) return null;
      return url.href;
    } catch { return null; }
  }

  function addResource(key, load) {
    if (!resources.has(key)) resources.set(key, { key, load, state: 'pending' });
    return resources.get(key);
  }

  function updateProgress() {
    const values = [...resources.values()];
    const complete = values.filter(resource => resource.state === 'ready').length;
    const percent = values.length ? Math.floor(complete / values.length * 100) : 0;
    if (progress) {
      progress.max = 100;
      if (discoveryComplete) {
        progress.value = percent;
        progress.setAttribute('aria-valuenow', String(percent));
        progress.setAttribute('aria-valuetext', `${complete} of ${values.length} resources ready`);
      } else {
        progress.removeAttribute('value');
        progress.removeAttribute('aria-valuenow');
        progress.setAttribute('aria-valuetext', 'Discovering the forest artwork');
      }
    }
    const failed = values.some(resource => resource.state === 'failed');
    if (failed) {
      if (status) status.textContent = 'Some artwork could not load. Retry loading, or enter the village.';
      if (actions) actions.hidden = false;
      if (retryButton) retryButton.hidden = false;
    } else if (stalled) {
      if (status) status.textContent = 'The village is taking a little longer to load. You can keep waiting or enter now.';
      if (actions) actions.hidden = false;
      if (retryButton) retryButton.hidden = true;
    } else if (status) {
      status.textContent = discoveryComplete ? `Preparing the forest… ${percent}%` : 'Preparing the forest…';
    }
  }

  function waitForImage(image, start) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let decoding = false;
      const removeLoad = listen(image, 'load', loaded);
      const removeError = listen(image, 'error', failed);
      const cancel = () => settle(new Error('Loading cancelled'));
      cleanups.add(cancel);
      function settle(error) {
        if (settled) return;
        settled = true;
        removeLoad();
        removeError();
        cleanups.delete(cancel);
        if (error) reject(error); else resolve();
      }
      function loaded() {
        if (settled || decoding) return;
        if (!image.naturalWidth) { failed(); return; }
        decoding = true;
        if (typeof image.decode === 'function') {
          Promise.resolve().then(() => image.decode()).then(() => settle(), error => settle(error || new Error('An illustration could not be decoded')));
        } else settle();
      }
      function failed() { settle(new Error('An illustration could not load')); }
      try {
        if (start) start();
        if (image.complete) {
          if (image.naturalWidth) loaded(); else failed();
        }
      } catch (error) { settle(error); }
    });
  }

  function loadSharedImage(url) {
    if (!imagePromises.has(url)) {
      const image = new Image();
      image.decoding = 'async';
      preloadedImages.set(url, image);
      const promise = waitForImage(image, () => { image.src = url; });
      imagePromises.set(url, promise);
      // Failed requests must be tried again when the visitor chooses Retry.
      promise.catch(() => {
        if (imagePromises.get(url) === promise) {
          imagePromises.delete(url);
          preloadedImages.delete(url);
        }
      });
    }
    return imagePromises.get(url);
  }

  function addImageUrl(value) {
    const url = absoluteImageUrl(value);
    if (url) addResource(`image:${url}`, () => loadSharedImage(url));
  }

  function makeImagesEager() {
    for (const image of document.querySelectorAll('img')) image.loading = 'eager';
  }

  function discoverArtwork() {
    makeImagesEager();
    for (const image of document.querySelectorAll('img')) {
      const source = image.currentSrc || image.getAttribute('src');
      if (!source && !image.getAttribute('srcset')) continue;
      addImageUrl(source);
      if (!nativeImages.has(image)) {
        const id = ++nativeImageId;
        nativeImages.set(image, id);
        addResource(`element:${id}`, retry => waitForImage(image, () => {
          // Reassign only failed images; successful native decodes stay cached.
          if (retry && image.complete && !image.naturalWidth) {
            const src = image.getAttribute('src');
            if (src) image.src = src;
          }
        }));
      }
    }
    for (const image of document.querySelectorAll('svg image')) {
      addImageUrl(image.getAttribute('href') || image.getAttribute('xlink:href'));
    }
    // Computed values resolve relative URLs and include the active media queries.
    for (const element of document.querySelectorAll('body, body *')) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        for (const property of ['background-image', 'mask-image', '-webkit-mask-image', 'border-image-source', 'content']) {
          const value = style.getPropertyValue(property);
          const urls = /url\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^)]*))\s*\)/g;
          for (const match of value.matchAll(urls)) addImageUrl((match[1] || match[2] || match[3] || '').trim());
        }
      }
    }
  }

  function stylesheetReady(record, retry) {
    let link = record.link;
    if (link.sheet && !retry) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settled = false;
      let removeLoad = () => {};
      let removeError = () => {};
      let removeDocumentReady = () => {};
      const cancel = () => settle(new Error('Loading cancelled'));
      function settle(error) {
        if (settled) return;
        settled = true;
        removeLoad(); removeError(); removeDocumentReady();
        cleanups.delete(cancel);
        if (error) reject(error); else resolve();
      }
      const loaded = () => settle();
      const failed = () => settle(new Error('A stylesheet could not load'));
      if (retry) {
        const replacement = link.cloneNode();
        removeLoad = listen(replacement, 'load', loaded);
        removeError = listen(replacement, 'error', failed);
        link.replaceWith(replacement);
        record.link = link = replacement;
      } else {
        removeLoad = listen(link, 'load', loaded);
        removeError = listen(link, 'error', failed);
      }
      cleanups.add(cancel);
      const check = () => { if (link.sheet) loaded(); else failed(); };
      // A failed stylesheet's error may predate this deferred script. Our
      // preceding stylesheets have settled by DOMContentLoaded, so check then
      // instead of waiting for window.load, which background audio can delay.
      if (!retry && document.readyState === 'complete') check();
      else if (!retry) removeDocumentReady = listen(document, 'DOMContentLoaded', check, { once: true });
    });
  }

  function documentReady() {
    if (document.readyState === 'complete') return Promise.resolve();
    return new Promise(resolve => {
      let removeDOMContentLoaded;
      let removeReadyState;
      const done = () => { removeDOMContentLoaded(); removeReadyState(); resolve(); };
      removeDOMContentLoaded = listen(document, 'DOMContentLoaded', done, { once: true });
      removeReadyState = listen(document, 'readystatechange', () => {
        if (document.readyState === 'complete') done();
      });
    });
  }

  function declaresMarker(record) {
    if (record.markerSource) return true;
    try {
      record.markerSource = [...record.link.sheet.cssRules].some(rule =>
        rule.type === 5 && rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim() === 'Marker');
    } catch { /* Cross-origin stylesheet rules may be private. */ }
    return Boolean(record.markerSource);
  }

  function nextPaint() {
    return new Promise(resolve => {
      const cancel = () => { cancelAnimationFrame(frame); cleanups.delete(cancel); resolve(); };
      const frame = requestAnimationFrame(() => { cleanups.delete(cancel); resolve(); });
      cleanups.add(cancel);
    });
  }

  function finishReveal() {
    clearTimeout(revealTimer);
    loader.hidden = true;
    root.classList.remove('site-revealing');
    for (const cleanup of [...cleanups]) cleanup();
    cleanups.clear();
    preloadedImages.clear();
  }

  function release(immediate = false) {
    if (finished) { if (immediate) finishReveal(); return; }
    finished = true;
    attempt += 1;
    clearTimeout(stallTimer);
    observer?.disconnect();
    for (const [element, original] of inertElements) {
      if (original === null) element.removeAttribute('inert');
      else element.setAttribute('inert', original);
    }
    inertElements.clear();
    if (main) {
      if (originalBusy === null) main.removeAttribute('aria-busy');
      else main.setAttribute('aria-busy', originalBusy);
    }
    loader.setAttribute('aria-busy', 'false');
    root.classList.remove('site-loading');
    if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) finishReveal();
    else {
      root.classList.add('site-revealing');
      // The fallback also completes when transitionend is not delivered.
      listen(loader, 'transitionend', event => { if (event.target === loader) finishReveal(); });
      revealTimer = setTimeout(finishReveal, 300);
    }
  }

  async function runResource(resource, token) {
    if (resource.state === 'ready') return;
    const retry = resource.state === 'failed';
    resource.state = 'pending';
    try {
      await resource.load(retry);
      if (token === attempt && !finished) resource.state = 'ready';
    } catch {
      if (token === attempt && !finished) resource.state = 'failed';
    }
    if (token === attempt && !finished) updateProgress();
  }

  async function start() {
    const token = ++attempt;
    stalled = false;
    clearTimeout(stallTimer);
    if (actions) actions.hidden = true;
    if (retryButton) retryButton.hidden = true;
    stallTimer = setTimeout(() => {
      if (finished || token !== attempt) return;
      stalled = true;
      updateProgress();
    }, 20000);
    await Promise.all(stylesheets.map(record => runResource(record.resource, token)));
    if (finished || token !== attempt) return;
    // A saved night preference swaps native image sources after decoding its
    // artwork. Discover the committed world, so day-source decode promises are
    // never captured while that initial swap is still pending. The theme
    // controller falls back to day on failure; a rejected optional promise must
    // likewise leave the normal visual loading gate usable.
    try { await window.shikhaThemeReady; } catch { /* Keep the current world. */ }
    if (finished || token !== attempt) return;
    discoverArtwork();
    discoveryComplete = true;
    updateProgress();
    const stylesheetResources = new Set(stylesheets.map(record => record.resource));
    await Promise.all([...resources.values()]
      .filter(resource => !stylesheetResources.has(resource))
      .map(resource => runResource(resource, token)));
    if (finished || token !== attempt) return;
    if ([...resources.values()].some(resource => resource.state !== 'ready')) {
      updateProgress();
      return;
    }
    // Let the existing parallax code measure the completed artwork before paint.
    window.dispatchEvent(new Event('resize'));
    await nextPaint();
    await nextPaint();
    if (!finished && token === attempt) release();
  }

  try {
    for (const child of document.body.children) protect(child);
    main?.setAttribute('aria-busy', 'true');
    if (typeof MutationObserver === 'function') {
      observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType === 1 && node.parentElement === document.body) protect(node);
        }
      });
      observer.observe(document.body, { childList: true });
    }
    makeImagesEager();
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      const record = { link };
      record.resource = addResource(`stylesheet:${link.href}`, retry => stylesheetReady(record, retry));
      stylesheets.push(record);
    }
    // DOMContentLoaded waits for our deferred/module scripts; window.load can
    // also wait for background audio, which must not hold up the visual reveal.
    const ready = documentReady();
    addResource('document', () => ready);
    if (document.fonts) addResource('fonts', async retry => {
      // Recreate the declaring face after an error; FontFace caches failed loads.
      if (retry) await Promise.all(stylesheets.filter(declaresMarker).map(record => stylesheetReady(record, true)));
      const marker = await document.fonts.load('1em Marker');
      if (!marker.length) throw new Error('The story lettering could not load');
      await document.fonts.ready;
    });
    if (retryButton) listen(retryButton, 'click', () => { if (!finished) start().catch(() => release(true)); });
    if (continueButton) listen(continueButton, 'click', () => release());
    listen(window, 'pageshow', event => { if (event.persisted) release(true); });
    listen(window, 'pagehide', () => release(true));
    start().catch(() => release(true));
  } catch {
    release(true);
  }
})();
