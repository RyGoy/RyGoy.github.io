// The sidebar's Musical Recap (partials/navbar.html): a play/pause button for one recording that keeps playing while
// the visitor moves around the site. Every link loads a new page, which stops sound, so each page picks the recording
// up where the last one left off: whether it is playing and how far it has got are kept for the tab (sessionStorage),
// written as it plays and when the page is left. A browser may refuse to start sound on a page the visitor hasn't
// clicked on yet; the button then shows Play, and pressing it carries on from the same place. Other sound on the page
// (a video, a recording) pauses it, so two never play at once. Its look (play triangle or pause pills) follows
// .is-playing (archive.css). Without JavaScript the button stays hidden.
(() => {
  const button = document.getElementById('musical-recap');
  if (!button) return;
  const KEY = 'ttfl-musical-recap';
  const box = button.closest('.musical-recap');  // the button and the words round it
  const audio = new Audio();
  audio.preload = 'none';
  audio.src = button.dataset.audio;

  // Storage can be blocked (private windows, strict settings); then it plays only on the page where it was started.
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let pendingTime = null;  // the place to resume from, until the recording has loaded enough to go there
  const save = (playing) => {
    const time = pendingTime ?? audio.currentTime;
    try { sessionStorage.setItem(KEY, JSON.stringify({ playing, time })); } catch { /* not kept */ }
  };
  let wanted = false;  // whether the visitor has it playing (it may still be loading, or refused by the browser)

  const label = () => {
    const playing = !audio.paused;
    button.title = playing ? 'Pause musical recap for the kids' : 'Play musical recap for the kids';
    button.setAttribute('aria-label', button.title);
    button.classList.toggle('is-playing', playing);
  };
  const play = () => audio.play().then(label, () => label());  // refused: the button shows Play

  // Pick up where the last page left off.
  const resume = () => {
    const state = load();
    wanted = state.playing === true;
    if (state.time > 0) {
      audio.preload = 'auto';
      pendingTime = state.time;
      const seek = () => { audio.currentTime = state.time; pendingTime = null; };
      if (audio.readyState >= 1) seek(); else audio.addEventListener('loadedmetadata', seek, { once: true });
    }
    if (wanted) play(); else label();
  };

  button.addEventListener('click', () => {
    if (audio.paused) { wanted = true; save(true); play(); } else { wanted = false; audio.pause(); save(false); }
  });
  for (const event of ['play', 'pause']) audio.addEventListener(event, label);
  let lastSaved = 0;
  audio.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - lastSaved > 1000) { lastSaved = now; save(wanted); }
  });
  audio.addEventListener('ended', () => { wanted = false; pendingTime = null; audio.currentTime = 0; save(false); label(); });
  audio.addEventListener('error', () => { box.hidden = true; });
  // Other media starting on the page pauses it (media events don't bubble, so listen as they are captured).
  document.addEventListener('play', (event) => {
    if (event.target !== audio && !audio.paused) { wanted = false; audio.pause(); save(false); }
  }, true);
  // Leaving the page keeps the place; coming back to it from the browser's history (a page kept in memory) resumes.
  window.addEventListener('pagehide', () => save(wanted));
  window.addEventListener('pageshow', (event) => { if (event.persisted) resume(); });

  box.hidden = false;
  resume();
})();
