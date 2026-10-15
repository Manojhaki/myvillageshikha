(() => {
  const audio = document.querySelector('#background-music');
  const toggle = document.querySelector('#music-toggle');
  const label = document.querySelector('#music-label');
  if (!audio || !toggle || !label) return;

  const preferenceKey = 'my-village-shikha:music';
  let optedOut = false;
  let starting = false;
  let listening = false;
  try { optedOut = localStorage.getItem(preferenceKey) === 'off'; } catch {}
  audio.volume = 0.3;

  function savePreference(value) {
    try { localStorage.setItem(preferenceKey, value); } catch {}
  }

  function render() {
    const playing = !audio.paused && !audio.ended;
    const failed = Boolean(audio.error);
    const action = playing ? 'Pause background music' : 'Play background music';
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.setAttribute('aria-label', failed ? 'Background music unavailable' : action);
    toggle.title = failed ? 'Background music unavailable' : action;
    toggle.dataset.playing = String(playing);
    toggle.disabled = failed;
    label.textContent = failed ? 'Music unavailable' : playing ? 'Music on' : optedOut ? 'Music off' : 'Play music';
  }

  function stopListening() {
    document.removeEventListener('click', onFirstInteraction, true);
    document.removeEventListener('keydown', onFirstInteraction, true);
    listening = false;
  }

  function waitForInteraction() {
    if (optedOut || listening || audio.error) return;
    document.addEventListener('click', onFirstInteraction, true);
    document.addEventListener('keydown', onFirstInteraction, true);
    listening = true;
  }

  function startMusic() {
    if (optedOut || starting || audio.error) return;
    starting = true;
    // Keep play() in the trusted input event when autoplay needs permission.
    const playRequest = audio.play();
    Promise.resolve(playRequest).then(() => {
      starting = false;
      if (optedOut) audio.pause();
      else stopListening();
      render();
    }).catch(() => {
      starting = false;
      waitForInteraction();
      render();
    });
  }

  function onFirstInteraction(event) {
    if (!event.isTrusted || optedOut) return;
    if (event.target instanceof Element && event.target.closest('#music-toggle')) return;
    if (event.type === 'keydown' && (event.repeat || ['Shift', 'Control', 'Alt', 'Meta', 'Escape'].includes(event.key))) return;
    startMusic();
  }

  toggle.addEventListener('click', () => {
    if (!audio.paused) {
      optedOut = true;
      savePreference('off');
      stopListening();
      audio.pause();
      render();
    } else {
      optedOut = false;
      savePreference('on');
      startMusic();
    }
  });

  audio.addEventListener('play', render);
  audio.addEventListener('playing', () => { stopListening(); render(); });
  audio.addEventListener('pause', render);
  audio.addEventListener('error', () => { stopListening(); render(); });
  toggle.hidden = false;
  render();
  if (!optedOut) startMusic();
})();
