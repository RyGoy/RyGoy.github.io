// Terms banner. Loaded by layouts/partials/terms-gate.html; the terms come from the /terms/ page.
// It appears along the bottom of the screen 20 seconds after the visitor arrived on the site (counted from their
// first page this visit, so moving between pages doesn't restart the count), and stays on every page until they
// answer Yes. It doesn't cover the page or block it: a pop-up that hides a page on arrival is one search engines
// rank lower, and it was the first thing every visitor from a search saw.
(() => {
  const script = document.currentScript;
  const termsUrl = new URL(script.dataset.terms, location.href);
  const version = script.dataset.version;
  const KEY = 'ttfl-terms-accepted';
  const ARRIVED = 'ttfl-arrived';
  const DELAY = 20000;

  // Storage can be blocked (private windows, strict settings); then the visitor is asked on each page, 20 seconds
  // after it opened.
  const accepted = () => { try { return localStorage.getItem(KEY) === version; } catch { return false; } };
  const remember = () => { try { localStorage.setItem(KEY, version); } catch { /* not remembered */ } };
  const arrived = () => {
    try {
      const stored = Number(sessionStorage.getItem(ARRIVED));
      if (stored) return stored;
      sessionStorage.setItem(ARRIVED, String(Date.now()));
    } catch { /* not remembered */ }
    return Date.now();
  };

  if (accepted() || location.pathname === termsUrl.pathname) return;
  const showAt = arrived() + DELAY;

  const element = (tag, props, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  // Sound plays while the banner is showing. Browsers often block sound before the visitor has interacted with
  // the site, so it has a button to start or stop it.
  const sound = script.dataset.audio ? new Audio(script.dataset.audio) : null;
  const soundButtons = [];
  const soundButton = () => {
    const button = element('button', { type: 'button', className: 'terms-gate-sound', hidden: !sound },
      element('span', { className: 'terms-gate-sound-icon' }), 'Musical Recap');
    button.addEventListener('click', () => (sound.paused ? sound.play().catch(() => {}) : sound.pause()));
    soundButtons.push(button);
    return button;
  };
  const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>';
  const labelSoundButtons = () => {
    for (const button of soundButtons) {
      button.firstChild.innerHTML = sound.paused ? PLAY : PAUSE;
      button.title = sound.paused ? 'Play musical recap' : 'Pause musical recap';
      button.setAttribute('aria-label', button.title);
    }
  };
  if (sound) {
    for (const event of ['play', 'pause', 'ended']) sound.addEventListener(event, labelSoundButtons);
    sound.addEventListener('error', () => { for (const button of soundButtons) button.hidden = true; });
  }

  const show = (title, terms) => {
    // The banner is too small for the terms' picture; the /terms/ page shows it.
    const image = terms.querySelector('img');
    if (image) {
      const holder = image.parentElement;
      image.remove();
      if (holder !== terms && !holder.textContent.trim() && !holder.children.length) holder.remove();
    }

    const yes = element('button', { type: 'button', className: 'terms-gate-yes', textContent: 'Yes' });
    const no = element('button', { type: 'button', textContent: 'No' });
    const banner = element('section', { className: 'terms-gate terms-banner' },
      element('h2', { id: 'terms-banner-title', textContent: title }),
      element('div', { className: 'terms-gate-body' },
        element('div', { className: 'prose terms-gate-text' }, ...terms.childNodes)),
      element('p', { className: 'terms-gate-question', textContent: 'Do you agree to the terms?' }),
      element('div', { className: 'terms-gate-actions' }, yes, no, soundButton()));
    banner.setAttribute('aria-labelledby', 'terms-banner-title');

    const back = element('button', { type: 'button', textContent: 'Back to the terms' });
    const refusal = element('section', { className: 'terms-gate terms-banner terms-gate-refusal', hidden: true },
      element('h2', { id: 'terms-banner-refusal-title', textContent: 'Then fuck off.', tabIndex: -1 }),
      element('p', { textContent: 'We don’t have time for your bullshit.' }),
      element('div', { className: 'terms-gate-actions' }, back, soundButton()));
    refusal.setAttribute('aria-labelledby', 'terms-banner-refusal-title');

    yes.addEventListener('click', () => {
      remember();
      sound?.pause();
      banner.remove();
      refusal.remove();
    });
    no.addEventListener('click', () => {
      banner.hidden = true;
      refusal.hidden = false;
      refusal.querySelector('h2').focus();
      sound?.play().catch(() => {}); // the click allows sound, so the refusal always has music
    });
    back.addEventListener('click', () => {
      refusal.hidden = true;
      banner.hidden = false;
      yes.focus();
    });

    document.body.append(banner, refusal);
    if (sound) {
      labelSoundButtons();
      // Browsers usually block sound until the visitor interacts with the page. If this is blocked, start
      // on the first click or key press instead, unless that is Yes or the play/pause button itself.
      const playOnFirstInteraction = event => {
        for (const type of ['pointerdown', 'keydown']) document.removeEventListener(type, playOnFirstInteraction, true);
        if (!event.target.closest?.('.terms-gate-sound, .terms-gate-yes')) sound.play().catch(() => {});
      };
      sound.play().catch(() => {
        for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, playOnFirstInteraction, true);
      });
    }
  };

  // If the terms page can't be loaded, show nothing rather than an empty banner.
  setTimeout(() => {
    fetch(termsUrl)
      .then(response => (response.ok ? response.text() : Promise.reject(response.status)))
      .then(html => {
        const page = new DOMParser().parseFromString(html, 'text/html');
        const terms = page.querySelector('.prose');
        if (terms) show(page.querySelector('h1')?.textContent.trim() || 'Terms', document.importNode(terms, true));
      })
      .catch(() => {});
  }, Math.max(0, showAt - Date.now()));
})();
