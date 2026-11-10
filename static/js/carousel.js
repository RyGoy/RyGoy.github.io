// Home page carousel (partials/carousel.html). Each frame's data-pos is its distance from the current frame, wrapped
// round so the frames on either side are equally split; the CSS places and sizes the frames from it. No autoplay.
(() => {
  for (const carousel of document.querySelectorAll('.carousel')) {
    const frames = [...carousel.querySelectorAll('.carousel-frame')];
    const status = carousel.querySelector('.carousel-status');
    const count = frames.length;
    if (count < 2) continue;
    let current = frames.findIndex((frame) => frame.dataset.pos === '0');
    if (current < 0) current = 0;

    const show = (index, announce = true) => {
      current = (index + count) % count;
      frames.forEach((frame, i) => {
        let pos = (i - current + count) % count;
        if (pos > count / 2) pos -= count;
        frame.dataset.pos = pos;
        frame.toggleAttribute('aria-hidden', pos !== 0);
        // Only the front frame's link is reachable by keyboard.
        for (const link of frame.querySelectorAll('a')) link.tabIndex = pos === 0 ? 0 : -1;
      });
      if (announce) status.textContent = frames[current].getAttribute('aria-label');
    };

    show(current, false);

    for (const arrow of carousel.querySelectorAll('.carousel-arrow')) {
      arrow.hidden = false;
      arrow.addEventListener('click', () => show(current + (arrow.classList.contains('carousel-next') ? 1 : -1)));
    }
    // A click on a side frame brings it to the front.
    frames.forEach((frame, i) => frame.addEventListener('click', () => { if (i !== current) show(i); }));
    carousel.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') { show(current - 1); event.preventDefault(); }
      if (event.key === 'ArrowRight') { show(current + 1); event.preventDefault(); }
    });
    // Swipe on touch screens.
    let startX = null;
    carousel.addEventListener('pointerdown', (event) => { if (event.pointerType !== 'mouse') startX = event.clientX; });
    carousel.addEventListener('pointerup', (event) => {
      if (startX === null) return;
      const dx = event.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) show(current + (dx < 0 ? 1 : -1));
    });
  }
})();
