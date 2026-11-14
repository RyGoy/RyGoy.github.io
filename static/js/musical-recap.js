// The sidebar's Musical Recap (partials/navbar.html): a play/pause button for one recording that keeps playing while
// the visitor moves around the site. Every link loads a new page, which stops sound, so each page picks the recording
// up where the last one left off: whether it is playing and how far it has got are kept for the tab (sessionStorage),
// written as it plays and when the page is left. A browser may refuse to start sound on a page the visitor hasn't
// clicked on yet; the button then shows Play, and pressing it carries on from the same place. Other sound on the page
// (a video, a recording) pauses it, so two never play at once. Its look (play triangle or pause pills) follows
// .is-playing (archive.css). Without JavaScript the button stays hidden.
// Lyrics: when the button has data-lyrics (an LRC file: lines of text, each optionally after [mm:ss.xx] times), a small
// card floats in the corner while it plays (.recap-lyrics), fetched the first time it plays on a page. With times, the
// line being sung is marked and kept in view; without, it is a list to scroll. Its × hides it until Play is next
// pressed, on every page (sessionStorage).
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
  const lyrics = lyricsCard(button.dataset.lyrics, audio);
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
    if (audio.paused) { wanted = true; save(true); lyrics.reopen(); play(); } else { wanted = false; audio.pause(); save(false); }
  });
  for (const event of ['play', 'pause']) audio.addEventListener(event, () => { label(); lyrics.update(); });
  audio.addEventListener('timeupdate', () => lyrics.follow());
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

  // The floating lyrics card. Returns update() (show or hide it with the sound), follow() (mark the line being sung)
  // and reopen() (undo its ×); all do nothing without lyrics.
  function lyricsCard(url, sound) {
    const none = { update() {}, follow() {}, reopen() {} };
    if (!url) return none;
    const CLOSED = 'ttfl-musical-recap-lyrics-closed';
    const closed = () => { try { return sessionStorage.getItem(CLOSED) === '1'; } catch { return false; } };
    const setClosed = (on) => { try { if (on) sessionStorage.setItem(CLOSED, '1'); else sessionStorage.removeItem(CLOSED); } catch { /* not kept */ } };
    let card = null; let list = null; let lines = []; let current = -1; let loading = null;

    // LRC: '[01:02.50]text' (a line may carry several times); tags such as [ar:...] are skipped.
    const parse = (text) => {
      const out = [];
      for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const times = [];
        let rest = raw.replace(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g, (_, m, s) => { times.push(+m * 60 + parseFloat(s.replace(':', '.'))); return ''; });
        if (/^\s*\[[a-z]+:.*\]\s*$/i.test(rest)) continue;
        rest = rest.trim();
        if (times.length) for (const at of times) out.push({ at, text: rest });
        else out.push({ at: null, text: rest });
      }
      while (out.length && !out[out.length - 1].text) out.pop();
      return out.some((line) => line.at !== null) ? out.filter((line) => line.at !== null).sort((a, b) => a.at - b.at) : out;
    };

    const build = () => {
      card = document.createElement('aside');
      card.className = 'recap-lyrics';
      card.setAttribute('aria-label', 'Lyrics: Musical Recap');
      const head = document.createElement('div'); head.className = 'recap-lyrics-head';
      const title = document.createElement('span'); title.textContent = 'Musical Recap';
      const close = document.createElement('button'); close.type = 'button'; close.className = 'recap-lyrics-close';
      close.setAttribute('aria-label', 'Hide lyrics'); close.title = 'Hide lyrics'; close.textContent = '×';
      close.addEventListener('click', () => { setClosed(true); update(); });
      head.append(title, close);
      list = document.createElement('ol'); list.className = 'recap-lyrics-lines';
      if (lines[0] && lines[0].at !== null) card.classList.add('is-timed');
      for (const line of lines) {
        const item = document.createElement('li');
        item.textContent = line.text || '\u00a0';
        list.append(item);
      }
      card.append(head, list);
      document.body.append(card);
    };

    const follow = () => {
      if (!card || !card.classList.contains('is-timed')) return;
      let at = -1;
      for (let i = 0; i < lines.length && lines[i].at <= sound.currentTime; i++) at = i;
      if (at === current) return;
      list.children[current]?.classList.remove('is-current');
      current = at;
      const item = list.children[current];
      if (!item) return;
      item.classList.add('is-current');
      // Keep it in the middle of the card (scrolling the list only, never the page).
      list.scrollTo({ top: item.offsetTop - list.clientHeight / 2 + item.offsetHeight / 2, behavior: card.classList.contains('is-shown') ? 'smooth' : 'auto' });
    };

    const update = () => {
      const show = !sound.paused && !closed();
      if (show && !card) {
        loading ??= fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
          .then((text) => { lines = parse(text); if (lines.length) build(); })
          .catch(() => { /* no lyrics: nothing shown */ });
        loading.then(() => { if (card) { follow(); update(); } });
        return;
      }
      if (card) card.classList.toggle('is-shown', show);
    };
    return { update, follow, reopen: () => setClosed(false) };
  }
})();
