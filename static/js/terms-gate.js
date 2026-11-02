// First-visit terms pop-up. Loaded by layouts/partials/terms-gate.html; the terms come from the /terms/ page.
(() => {
  const script = document.currentScript;
  const termsUrl = new URL(script.dataset.terms, location.href);
  const version = script.dataset.version;
  const KEY = 'ttfl-terms-accepted';

  // Storage can be blocked (private windows, strict settings); then the visitor is asked on each page.
  const accepted = () => { try { return localStorage.getItem(KEY) === version; } catch { return false; } };
  const remember = () => { try { localStorage.setItem(KEY, version); } catch { /* not remembered */ } };

  if (accepted() || location.pathname === termsUrl.pathname) return;

  const element = (tag, props, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  // Sound plays while either pop-up is open. Browsers often block sound before the visitor has
  // interacted with the site, so each pop-up has a button to start or stop it.
  const sound = script.dataset.audio ? new Audio(script.dataset.audio) : null;
  const soundButtons = [];
  const soundButton = () => {
    const button = element('button', { type: 'button', className: 'terms-gate-sound', hidden: !sound });
    button.addEventListener('click', () => (sound.paused ? sound.play().catch(() => {}) : sound.pause()));
    soundButtons.push(button);
    return button;
  };
  const labelSoundButtons = () => {
    for (const button of soundButtons) button.textContent = sound.paused ? 'Musical Recap' : 'Stop Musical Recap';
  };
  if (sound) {
    for (const event of ['play', 'pause', 'ended']) sound.addEventListener(event, labelSoundButtons);
    sound.addEventListener('error', () => { for (const button of soundButtons) button.hidden = true; });
  }

  const show = (title, terms) => {
    let agreed = false;

    // The picture sits beside the terms, so lift it (and the paragraph Markdown wraps it in) out of the text.
    const image = terms.querySelector('img');
    if (image) {
      const holder = image.parentElement;
      image.remove();
      if (holder !== terms && !holder.textContent.trim() && !holder.children.length) holder.remove();
    }

    const yes = element('button', { type: 'button', textContent: 'Yes' });
    const no = element('button', { type: 'button', textContent: 'No' });
    const gate = element('dialog', { className: 'terms-gate' },
      element('h2', { id: 'terms-gate-title', textContent: title, tabIndex: -1, autofocus: true }),
      element('div', { className: 'terms-gate-body' },
        element('div', { className: 'prose terms-gate-text' }, ...terms.childNodes),
        ...(image ? [image] : [])),
      element('p', { className: 'terms-gate-question', textContent: 'Do you agree to the terms?' }),
      element('div', { className: 'terms-gate-actions' }, yes, no, soundButton()));
    gate.setAttribute('aria-labelledby', 'terms-gate-title');

    const back = element('button', { type: 'button', textContent: 'Back to the terms' });
    const refusal = element('dialog', { className: 'terms-gate terms-gate-refusal' },
      element('h2', { id: 'terms-gate-refusal-title', textContent: 'Then fuck off.', tabIndex: -1, autofocus: true }),
      element('p', { textContent: 'We don’t have time for your bullshit.' }),
      element('div', { className: 'terms-gate-actions' }, back, soundButton()));
    refusal.setAttribute('aria-labelledby', 'terms-gate-refusal-title');

    yes.addEventListener('click', () => {
      agreed = true;
      remember();
      sound?.pause();
      gate.remove();
      refusal.remove();
    });
    no.addEventListener('click', () => { gate.close(); refusal.showModal(); });
    back.addEventListener('click', () => { refusal.close(); gate.showModal(); });

    // There is no way past without answering: Escape is ignored, and a dialog the browser closes anyway reopens.
    for (const dialog of [gate, refusal]) {
      dialog.addEventListener('cancel', event => event.preventDefault());
      dialog.addEventListener('close', () => {
        if (!agreed && !gate.open && !refusal.open) dialog.showModal();
      });
    }

    document.body.append(gate, refusal);
    gate.showModal();
    if (sound) {
      labelSoundButtons();
      sound.play().catch(() => {}); // blocked autoplay leaves the "Musical Recap" button for the visitor
    }
  };

  // If the terms page can't be loaded, let the visitor in rather than show an empty pop-up.
  fetch(termsUrl)
    .then(response => (response.ok ? response.text() : Promise.reject(response.status)))
    .then(html => {
      const page = new DOMParser().parseFromString(html, 'text/html');
      const terms = page.querySelector('.prose');
      if (terms) show(page.querySelector('h1')?.textContent.trim() || 'Terms', document.importNode(terms, true));
    })
    .catch(() => {});
})();
