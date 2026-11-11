// Links with data-webamp="<dialog id>" play their MP3 in Webamp (the Winamp 2 player for the web, MIT licence), in that
// pop-up: the light theme's SOURCE and the sepia theme's Play button (partials/body.html). Each link has its own pop-up and
// its own Webamp holding only its one recording, whose title and artist Webamp reads from the file's tags. Webamp is
// loaded from jsDelivr on the first click, so pages that never use it don't fetch it. Closing the pop-up (Close, Esc, a
// click outside) pauses the recording, and the next click resumes it; Webamp's own close button closes the pop-up too
// and the next click starts afresh. Without JavaScript, or if Webamp can't load, the link opens the MP3 itself.
(() => {
  const WEBAMP = 'https://cdn.jsdelivr.net/npm/webamp@2.3.1/built/webamp.bundle.min.mjs';
  let webampModule = null;  // the import, shared by every link
  for (const link of document.querySelectorAll('a[data-webamp]')) {
    const player = document.getElementById(link.dataset.webamp);
    if (!player || typeof player.showModal !== 'function') continue;
    const stage = player.querySelector('.webamp-stage');  // Webamp replaces what is in it
    const loading = player.querySelector('.webamp-loading');
    let ready = null;  // this link's Webamp (a promise, so a second click while it loads gets the same one)

    const start = async () => {
      webampModule ??= import(WEBAMP);
      const { default: Webamp } = await webampModule;
      if (!Webamp.browserIsSupported()) throw new Error('Webamp is not supported here');
      const webamp = new Webamp({ initialTracks: [{ url: link.href }] });
      webamp.onClose(() => {
        ready = null;
        player.close();
        webamp.dispose();
        loading.hidden = false;
      });
      await webamp.renderInto(stage);
      loading.hidden = true;
      return webamp;
    };

    link.addEventListener('click', async (event) => {
      event.preventDefault();
      player.showModal();
      try {
        ready ??= start();
        (await ready).play();
      } catch (error) {
        ready = null;
        console.warn('Webamp could not start, so the MP3 opens instead:', error);
        player.close();
        location.href = link.href;
      }
    });
    player.addEventListener('click', (event) => { if (event.target === player) player.close(); });
    player.addEventListener('close', () => { ready?.then((webamp) => webamp.pause(), () => {}); });
  }
})();
