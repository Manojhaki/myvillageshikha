/* Swap the whole paper world only when its night artwork is decoded and ready. */
(() => {
  'use strict';

  let finishInitial;
  window.shikhaThemeReady = new Promise(resolve => { finishInitial = resolve; });
  const ready = () => { finishInitial(); };
  const root = document.documentElement;
  const storageKey = 'shikha-world-mode';
  const assetTimeout = 15000;
  const images = new Map(); // Keep decoded Image objects alive for later switches.
  let activeMode = 'day';
  let wantedMode = 'day';
  let attempt = 0;
  let transitionTimer;

  function start() {
    const button = document.getElementById('world-mode-toggle');
    const control = button?.closest('.world-mode-control');
    const status = document.getElementById('world-mode-status');
    if (!button || !control) { ready(); return; }

    const targets = [...document.querySelectorAll('[data-night-src]')].map(element => {
      const tag = element.localName.toLowerCase();
      return {
        element,
        kind: tag === 'img' ? 'src' : tag === 'image' ? 'href' : 'background',
        day: tag === 'img' ? element.getAttribute('src')
          : tag === 'image' ? element.getAttribute('href') : element.style.backgroundImage,
        night: new URL(element.getAttribute('data-night-src'), document.baseURI).href,
      };
    });
    const labels = [...document.querySelectorAll('[data-day-label][data-night-label]')];
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    function say(message, state = 'ready') {
      control.setAttribute('data-state', state);
      if (status) {
        status.textContent = message;
        status.setAttribute('data-state', state);
      }
    }
    function remember(mode) {
      try { localStorage.setItem(storageKey, mode); } catch { /* Private browsing still works. */ }
    }
    function busy(loading) {
      button.setAttribute('aria-busy', String(loading));
      if (loading) root.setAttribute('data-theme-loading', 'night');
      else root.removeAttribute('data-theme-loading');
    }

    function apply(mode, intentional) {
      clearTimeout(transitionTimer);
      root.classList.remove('theme-changing');
      if (!reduced?.matches && mode !== activeMode) root.classList.add('theme-changing');
      for (const target of targets) {
        const value = mode === 'night' ? target.night : target.day;
        if (target.kind === 'background') {
          target.element.style.backgroundImage = mode === 'night' ? `url("${value}")` : value;
        } else if (value === null) target.element.removeAttribute(target.kind);
        else target.element.setAttribute(target.kind, value);
      }
      for (const element of labels) {
        element.setAttribute('aria-label', element.getAttribute(mode === 'night' ? 'data-night-label' : 'data-day-label'));
      }
      activeMode = mode;
      root.setAttribute('data-theme', mode);
      button.setAttribute('aria-checked', String(mode === 'night'));
      button.title = mode === 'night' ? 'Return to daytime' : 'Explore the village at night';
      busy(false);
      say(mode === 'night' ? 'Night in Shikha. Bhumi is listening to the forest.' : 'Day in Shikha. The village is awake.');
      if (intentional) remember(mode);
      // Existing scenery measures its stage again; music and drawings keep their state.
      window.dispatchEvent(new Event('resize'));
      if (root.classList.contains('theme-changing')) {
        transitionTimer = setTimeout(() => root.classList.remove('theme-changing'), 650);
      }
    }

    function preload(url) {
      if (images.has(url)) return images.get(url).promise;
      const image = new Image();
      const entry = { image, promise: null };
      entry.promise = new Promise((resolve, reject) => {
        let settled = false;
        let decoding = false;
        const timer = setTimeout(() => fail(), assetTimeout);
        function cleanup() {
          clearTimeout(timer);
          image.removeEventListener('load', loaded);
          image.removeEventListener('error', fail);
        }
        function fail() {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('The night artwork is not ready.'));
        }
        async function loaded() {
          if (settled || decoding) return;
          decoding = true;
          try {
            if (!image.naturalWidth) throw new Error('Empty night artwork');
            if (image.decode) await image.decode();
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
          } catch { fail(); }
        }
        image.addEventListener('load', loaded);
        image.addEventListener('error', fail);
        image.decoding = 'async';
        image.src = url;
        if (image.complete) {
          if (image.naturalWidth) loaded();
          else fail();
        }
      });
      images.set(url, entry);
      entry.promise.catch(() => { if (images.get(url) === entry) images.delete(url); });
      return entry.promise;
    }

    async function choose(mode, intentional = false) {
      const token = ++attempt;
      wantedMode = mode;
      if (mode === 'day') {
        apply('day', intentional);
        ready();
        return;
      }
      busy(true);
      say('Gathering the moonlit forest… Select again to stay in day mode.', 'loading');
      try {
        await Promise.all([...new Set(targets.map(target => target.night))].map(preload));
        if (token !== attempt) return;
        apply('night', intentional);
      } catch {
        if (token !== attempt) return;
        wantedMode = activeMode;
        busy(false);
        say('The night artwork could not load. You can keep exploring, or select Night again to retry.', 'error');
      } finally {
        // A saved preference must never trap visitors behind the loading screen.
        if (token === attempt) ready();
      }
    }

    button.addEventListener('click', () => { choose(wantedMode === 'night' ? 'day' : 'night', true); });
    control.hidden = false;
    root.setAttribute('data-theme', 'day');
    button.setAttribute('aria-checked', 'false');
    let stored;
    try { stored = localStorage.getItem(storageKey); } catch { /* Default to day. */ }
    if (stored === 'night') choose('night');
    else { say('Day in Shikha. The village is awake.'); ready(); }
  }

  function safelyStart() {
    try { start(); }
    catch {
      root.removeAttribute('data-theme-loading');
      ready();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safelyStart, { once: true });
  else safelyStart();
})();
